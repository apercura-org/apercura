/**
 * Italy's places from ISTAT's boundaries of the administrative units for statistical purposes
 * ("Confini delle unità amministrative a fini statistici al 1° gennaio", generalized version,
 * CC BY 4.0): one ZIP of three polygon shapefiles in WGS 84 / UTM zone 32N (EPSG:32632), the
 * twenty regions (`Reg…`), the provinces, metropolitan cities and free municipal consortia
 * (`ProvCM…`, the "unità territoriali sovracomunali" of the statistics) and the municipalities
 * (`Com…`), each with its ISTAT codes and names.
 *
 * Regions are regions, the supra-municipal units departments, the municipalities communes; no
 * arrondissement. A municipality's point is an interior point of its largest ring (its centroid
 * when inside), transformed to WGS 84 in PostGIS; departments and regions take the centre of
 * their municipalities. A place is named in Italian: a bilingual name keeps its Italian part
 * ("Bolzano/Bozen" → "Bolzano"), and a province named like its region (Valle d'Aosta) takes its
 * capital's name. Run once, then each January (`etl:places --country it`).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { slugify } from "@apercura/core";
import { ISTAT_BOUNDARIES_YEAR } from "@apercura/core/country";
import type { Sql } from "../../lib/db";
import { downloadFile } from "../../lib/files";
import { type ExistingPlace, type PlaceRow, type PlacesStats, writePlaces } from "../../lib/places";
import { readDbf, readShpPolygons, type ShpRing } from "../../lib/shapefile";
import { readZipEntries } from "../../lib/zip";

/** File name expected in `--source-dir` for the places (fixtures, offline runs). */
export const IT_PLACES_FILE = "istat-confini.zip";

/** The generalized boundaries of 1 January of `year` (about 10 MB). */
export function defaultItPlacesUrl(year: number = ISTAT_BOUNDARIES_YEAR): string {
	return `https://www.istat.it/storage/cartografia/confini_amministrativi/generalizzati/${year}/Limiti0101${year}_g.zip`;
}

type Point = { x: number; y: number };

export type ItRegion = { code: string; name: string };
export type ItProvince = { code: string; name: string; abbreviation: string; regionCode: string };
export type ItMunicipality = {
	code: string;
	name: string;
	provinceCode: string;
	regionCode: string;
	/** Capital of its province (`CC_UTS`). */
	capital: boolean;
	/** Interior point in EPSG:32632, or null without geometry. */
	point: Point | null;
};

export type ItPlaceSources = {
	regions: ItRegion[];
	provinces: ItProvince[];
	municipalities: ItMunicipality[];
};

/** A two-digit region code (`1` → `01`), three-digit province (`58` → `058`), six-digit municipality. */
const pad = (value: string | undefined, width: number) => (value ?? "").trim().padStart(width, "0");

/** The Italian part of a bilingual name ("Bolzano/Bozen" → "Bolzano"). */
export function italianName(name: string): string {
	return (name.split("/")[0] ?? name).replace(/\s+/g, " ").trim();
}

/** Twice the signed area of a ring (positive counterclockwise). */
function ringArea(ring: ShpRing): number {
	let area = 0;
	for (let index = 0; index < ring.length - 1; index++) {
		const a = ring[index];
		const b = ring[index + 1];
		if (a && b) area += a.x * b.y - b.x * a.y;
	}
	return area;
}

function ringCentroid(ring: ShpRing): Point | null {
	const doubleArea = ringArea(ring);
	if (doubleArea === 0) return null;
	let x = 0;
	let y = 0;
	for (let index = 0; index < ring.length - 1; index++) {
		const a = ring[index];
		const b = ring[index + 1];
		if (!a || !b) continue;
		const cross = a.x * b.y - b.x * a.y;
		x += (a.x + b.x) * cross;
		y += (a.y + b.y) * cross;
	}
	return { x: x / (3 * doubleArea), y: y / (3 * doubleArea) };
}

/** Where a horizontal line crosses a ring's edges (x values, sorted). */
function crossings(ring: ShpRing, y: number): number[] {
	const xs: number[] = [];
	for (let index = 0; index < ring.length - 1; index++) {
		const a = ring[index];
		const b = ring[index + 1];
		if (!a || !b) continue;
		if (a.y > y !== b.y > y) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
	}
	return xs.sort((p, q) => p - q);
}

/**
 * A point inside a polygon: the centroid of its largest ring when it lies inside it, else the
 * middle of the widest stretch of the ring on the centroid's latitude (a crescent-shaped
 * municipality's centroid can fall outside it, a coastal one's in the sea).
 */
export function interiorPoint(rings: readonly ShpRing[]): Point | null {
	let largest: ShpRing | null = null;
	let largestArea = 0;
	for (const ring of rings) {
		const area = Math.abs(ringArea(ring));
		if (area > largestArea) {
			largest = ring;
			largestArea = area;
		}
	}
	if (!largest) return null;
	const centroid = ringCentroid(largest);
	if (!centroid) return null;
	const xs = crossings(largest, centroid.y);
	let inside = false;
	for (const x of xs) if (x < centroid.x) inside = !inside;
	if (inside) return centroid;
	let best: Point | null = null;
	let width = 0;
	for (let index = 0; index + 1 < xs.length; index += 2) {
		const from = xs[index] ?? 0;
		const to = xs[index + 1] ?? 0;
		if (to - from > width) {
			width = to - from;
			best = { x: (from + to) / 2, y: centroid.y };
		}
	}
	return best ?? centroid;
}

/** The shapefile of a layer (`Com`, `ProvCM`, `Reg`) in ISTAT's archive, as .dbf and .shp. */
function layer(archive: Buffer, prefix: string, withShapes: boolean) {
	const pattern = new RegExp(`(?:^|/)${prefix}\\d{8}_g(?:_WGS84)?\\.(dbf|shp)$`, "i");
	const entries = readZipEntries(
		archive,
		(name) => pattern.test(name) && (withShapes || name.toLowerCase().endsWith(".dbf")),
	);
	const dbf = entries.find((entry) => entry.name.toLowerCase().endsWith(".dbf"));
	if (!dbf) throw new Error(`not ISTAT's boundaries: no ${prefix} layer`);
	const shp = entries.find((entry) => entry.name.toLowerCase().endsWith(".shp"));
	if (withShapes && !shp) throw new Error(`not ISTAT's boundaries: no ${prefix} shapes`);
	return { records: readDbf(dbf.data).records, shapes: shp ? readShpPolygons(shp.data) : [] };
}

/** Reads ISTAT's archive. Throws when a layer or a column is missing. */
export function parseIstatBoundaries(archive: Buffer): ItPlaceSources {
	const reg = layer(archive, "Reg", false);
	const prov = layer(archive, "ProvCM", false);
	const com = layer(archive, "Com", true);
	const need = (records: Record<string, string>[], columns: string[], what: string) => {
		const first = records[0];
		const missing = first ? columns.filter((column) => !(column in first)) : columns;
		if (missing.length > 0) throw new Error(`not ISTAT's ${what}: no column ${missing.join(", ")}`);
	};
	need(reg.records, ["COD_REG", "DEN_REG"], "regions");
	need(prov.records, ["COD_REG", "COD_UTS", "DEN_UTS", "SIGLA"], "provinces");
	need(com.records, ["COD_REG", "COD_UTS", "PRO_COM_T", "COMUNE", "CC_UTS"], "municipalities");
	if (com.shapes.length !== com.records.length) {
		throw new Error(`${com.records.length} municipalities but ${com.shapes.length} shapes`);
	}
	return {
		regions: reg.records.map((record) => ({
			code: pad(record.COD_REG, 2),
			name: italianName(record.DEN_REG ?? ""),
		})),
		provinces: prov.records.map((record) => ({
			code: pad(record.COD_UTS, 3),
			name: italianName(record.DEN_UTS ?? ""),
			abbreviation: (record.SIGLA ?? "").trim().toUpperCase(),
			regionCode: pad(record.COD_REG, 2),
		})),
		municipalities: com.records.map((record, index) => {
			const rings = com.shapes[index];
			return {
				code: pad(record.PRO_COM_T, 6),
				name: italianName(record.COMUNE ?? ""),
				provinceCode: pad(record.COD_UTS, 3),
				regionCode: pad(record.COD_REG, 2),
				capital: (record.CC_UTS ?? "").trim() === "1",
				point: rings ? interiorPoint(rings) : null,
			};
		}),
	};
}

/** Reads the places from `--source-dir` (`istat-confini.zip`). */
export async function readItPlaceSources(dir: string): Promise<ItPlaceSources> {
	return parseIstatBoundaries(await readFile(join(dir, IT_PLACES_FILE)));
}

/** Downloads ISTAT's archive to `dir` and reads it. */
export async function fetchItPlaceSources(url: string, dir: string): Promise<ItPlaceSources> {
	const file = await downloadFile({
		key: "istat-confini",
		url,
		path: join(dir, IT_PLACES_FILE),
		text: false,
	});
	if (file.bytes < 10_000 || file.bytes > 200 * 1024 * 1024) {
		throw new Error(`ISTAT's boundaries: ${file.bytes} bytes`);
	}
	return parseIstatBoundaries(await readFile(file.path));
}

type Located = { longitude: number; latitude: number };

/** Transforms the municipalities' points from UTM zone 32N (EPSG:32632) to WGS 84 in PostGIS. */
async function locate(sql: Sql, points: Map<string, Point>): Promise<Map<string, Located>> {
	const located = new Map<string, Located>();
	const entries = [...points.entries()].map(([key, point]) => ({ key, x: point.x, y: point.y }));
	for (let index = 0; index < entries.length; index += 5_000) {
		const chunk = JSON.stringify(entries.slice(index, index + 5_000));
		const rows = await sql<{ key: string; longitude: number; latitude: number }[]>`
			SELECT r.key, ST_X(t.geom) AS longitude, ST_Y(t.geom) AS latitude
			FROM jsonb_to_recordset(${chunk}::text::jsonb) AS r (key text, x double precision, y double precision)
			CROSS JOIN LATERAL (
				SELECT ST_Transform(ST_SetSRID(ST_MakePoint(r.x, r.y), 32632), 4326) AS geom
			) t
		`;
		for (const row of rows)
			located.set(row.key, { longitude: row.longitude, latitude: row.latitude });
	}
	return located;
}

/**
 * The place rows of Italy. Existing slugs are kept; a renamed place gets a new slug and keeps
 * the old one as an alias, as in the other markets. Regions and provinces share one slug space;
 * a municipality's slug is unique within its province (`-{code}` on a collision).
 */
export function buildItPlaceRows(
	sources: ItPlaceSources,
	points: ReadonlyMap<string, Located>,
	existing: ExistingPlace[],
): PlaceRow[] {
	const existingByKey = new Map(existing.map((place) => [`${place.kind}:${place.code}`, place]));
	const keep = (kind: PlaceRow["kind"], code: string, name: string, fresh: () => string) => {
		const known = existingByKey.get(`${kind}:${code}`);
		if (known && known.name === name) return { slug: known.slug, previous: null };
		const slug = fresh();
		return { slug, previous: known && known.slug !== slug ? known.slug : null };
	};
	const topTaken = new Set<string>();
	const localTaken = new Map<string, Set<string>>();
	for (const place of existing) {
		if (place.kind === "region" || place.kind === "department") topTaken.add(place.slug);
		else {
			const set = localTaken.get(place.departmentCode ?? "") ?? new Set<string>();
			set.add(place.slug);
			localTaken.set(place.departmentCode ?? "", set);
		}
	}
	const topSlug = (kind: PlaceRow["kind"], code: string, name: string) =>
		keep(kind, code, name, () => {
			const base = slugify(name) || code;
			const slug = topTaken.has(base) ? `${base}-${code}` : base;
			topTaken.add(slug);
			return slug;
		});
	const localSlug = (code: string, name: string, department: string) =>
		keep("commune", code, name, () => {
			const set = localTaken.get(department) ?? new Set<string>();
			localTaken.set(department, set);
			const base = slugify(name) || code;
			const slug = set.has(base) ? `${base}-${code}` : base;
			set.add(slug);
			return slug;
		});
	const row = (
		kind: PlaceRow["kind"],
		code: string,
		name: string,
		slug: { slug: string; previous: string | null },
		departmentCode: string | null,
		regionCode: string | null,
		parent: { kind: string; code: string } | null,
		point: Located | null | undefined,
	): PlaceRow => ({
		kind,
		code,
		name,
		slug: slug.slug,
		department_code: departmentCode,
		region_code: regionCode,
		parent_kind: parent?.kind ?? null,
		parent_code: parent?.code ?? null,
		longitude: point?.longitude ?? null,
		latitude: point?.latitude ?? null,
		population: null,
		postcodes: [],
		previous_slug: slug.previous,
	});

	const rows: PlaceRow[] = [];
	const regions = new Map<string, string>();
	for (const region of [...sources.regions].sort((a, b) => a.code.localeCompare(b.code))) {
		if (!region.name || regions.has(region.code)) continue;
		regions.set(region.code, region.name);
		rows.push(
			row(
				"region",
				region.code,
				region.name,
				topSlug("region", region.code, region.name),
				null,
				region.code,
				null,
				null,
			),
		);
	}
	const capitals = new Map(
		sources.municipalities
			.filter((municipality) => municipality.capital)
			.map((municipality) => [municipality.provinceCode, municipality.name]),
	);
	const provinces = new Set<string>();
	for (const province of [...sources.provinces].sort((a, b) => a.code.localeCompare(b.code))) {
		const region = regions.get(province.regionCode);
		if (!region || !province.name || provinces.has(province.code)) continue;
		provinces.add(province.code);
		// The province of Aosta is named like its region: it takes its capital's name.
		const name =
			province.name === region ? (capitals.get(province.code) ?? province.name) : province.name;
		rows.push(
			row(
				"department",
				province.code,
				name,
				topSlug("department", province.code, name),
				province.code,
				province.regionCode,
				{ kind: "region", code: province.regionCode },
				null,
			),
		);
	}
	for (const municipality of [...sources.municipalities].sort((a, b) =>
		a.code.localeCompare(b.code),
	)) {
		if (!provinces.has(municipality.provinceCode) || !municipality.name) continue;
		rows.push(
			row(
				"commune",
				municipality.code,
				municipality.name,
				localSlug(municipality.code, municipality.name, municipality.provinceCode),
				municipality.provinceCode,
				municipality.regionCode,
				{ kind: "department", code: municipality.provinceCode },
				points.get(municipality.code),
			),
		);
	}
	return rows;
}

/** Upserts Italy's places (country `IT`); no other market's are read or touched. */
export async function importItPlaces(
	sql: Sql,
	sources: ItPlaceSources,
	runId: number,
): Promise<PlacesStats> {
	const raw = new Map<string, Point>();
	for (const municipality of sources.municipalities) {
		if (municipality.point) raw.set(municipality.code, municipality.point);
	}
	const points = await locate(sql, raw);
	let communes = 0;
	const stats = await writePlaces(
		sql,
		"IT",
		(existing) => {
			const rows = buildItPlaceRows(sources, points, existing);
			communes = rows.filter((row) => row.kind === "commune").length;
			return rows;
		},
		runId,
		{ regions: sources.regions.length, communes: 0, arrondissements: 0 },
	);
	return { ...stats, communes };
}
