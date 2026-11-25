/**
 * The places of the UK listings, all under the Open Government Licence, mapped onto the four
 * kinds of `directory.places`:
 *
 * - regions: England's nine regions and the three other nations (`GB_REGIONS`, ONS codes);
 * - departments: the local authority districts (ONS LAD codes, `E06000004`), with their region
 *   from the ONS ward-to-region lookup and their centre from the ONS boundaries;
 * - communes: the cities, towns and villages of OS Open Names in Great Britain and of the
 *   OSNI gazetteer in Northern Ireland, each in the local authority whose boundary holds it.
 *
 * Imported once (`etl:places --country gb`, or by the first `etl:gb`), like Austria's.
 * There are no arrondissements: a city is one town.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { slugify } from "@apercura/core";
import { GB_REGIONS, gbNationOf } from "@apercura/core/country";
import type { Sql } from "../../lib/db";
import { downloadFile, fetchJson } from "../../lib/files";
import { type ExistingPlace, type PlaceRow, type PlacesStats, writePlaces } from "../../lib/places";
import { zipEntries } from "../../lib/zip";
import { titleCaseGb } from "./names";
import { csvRecords, decodeText } from "./types";

/**
 * The ONS lookup of wards to local authorities, regions and countries (2026), asked for the
 * distinct authorities: 361 rows of code, name, region and country.
 */
export const DEFAULT_GB_LAD_LOOKUP_URL =
	"https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/WD26_LAD26_CTYUA26_RGN26_CTRY26_UK_LU/FeatureServer/0/query?where=1%3D1&outFields=LAD26CD,LAD26NM,RGN26CD,CTRY26CD&returnDistinctValues=true&returnGeometry=false&f=json&resultRecordCount=2000";

/** The ONS boundaries of the local authorities (December 2026, clipped), simplified, in WGS 84. */
export const DEFAULT_GB_LAD_BOUNDARIES_URL =
	"https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/LAD_DEC_2026_UK_BFC/FeatureServer/0/query?where=1%3D1&outFields=LAD26CD,LAD26NM,LONG,LAT&outSR=4326&f=geojson&geometryPrecision=5&maxAllowableOffset=0.001";

/** OS Open Names, the OS Downloads API's stable link to the latest CSV release. */
export const DEFAULT_GB_TOWNS_URL =
	"https://api.os.uk/downloads/v1/products/OpenNames/downloads?area=GB&format=CSV&redirect";

/** The OSNI gazetteer of Northern Ireland's towns and villages (OpenDataNI). */
export const DEFAULT_GB_NI_TOWNS_URL =
	"https://admin.opendatani.gov.uk/dataset/d27903f1-15e6-4c07-8564-ddc655e9c549/resource/411c6ea5-c079-43aa-bd62-438423d070cc/download/osni_open_data_-_gazetteer_-_place_names.csv";

/** File names in `--source-dir`. */
export const GB_PLACE_FILES = {
	ladLookup: "lad-lookup.json",
	ladBoundaries: "lad-boundaries.geojson",
	/** The release ZIP, or `open-names.csv` (one CSV of it) for fixtures. */
	towns: "open-names.zip",
	niTowns: "osni-place-names.csv",
} as const;

export type GbLad = {
	code: string;
	name: string;
	/** An English region (`E12…`) or the authority's nation (`W92000004`…). */
	regionCode: string;
};

export type GbTown = {
	/** OS Open Names identifier (`osgb4000000074553648`), or `osni{OBJECTID}`. */
	code: string;
	name: string;
	/** 1 city, 2 town, 3 village: the first of homonyms in an authority is kept. */
	rank: number;
	x: number;
	y: number;
	/** 27700 (British National Grid) or 29903 (Irish Grid). */
	srid: number;
};

export type GbPlaceSources = {
	lads: GbLad[];
	/** GeoJSON FeatureCollection of the authorities' boundaries (WGS 84), with their centres. */
	boundaries: { features: unknown[] };
	towns: GbTown[];
};

/** The field of a vintage of ONS codes (`LAD26CD`, next year `LAD27CD`). */
function vintageField(attributes: Record<string, unknown>, pattern: RegExp): string | null {
	const key = Object.keys(attributes).find((name) => pattern.test(name));
	const value = key ? attributes[key] : null;
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Reads the ONS lookup answer: one authority per code, its region or nation. */
export function parseLadLookup(json: unknown): GbLad[] {
	const features = (json as { features?: { attributes?: Record<string, unknown> }[] })?.features;
	if (!Array.isArray(features) || features.length === 0) {
		throw new Error("ONS lookup: no local authority");
	}
	const lads = new Map<string, GbLad>();
	for (const feature of features) {
		const attributes = feature.attributes ?? {};
		const code = vintageField(attributes, /^LAD\d{2}CD$/i);
		const name = vintageField(attributes, /^LAD\d{2}NM$/i);
		if (!code || !name || !/^[ENSW]\d{8}$/.test(code)) continue;
		const region = vintageField(attributes, /^RGN\d{2}CD$/i);
		const nation = vintageField(attributes, /^CTRY\d{2}CD$/i) ?? gbNationOf(code);
		const regionCode = region && GB_REGIONS[region] ? region : nation;
		if (!regionCode || !GB_REGIONS[regionCode]) continue;
		lads.set(code, { code, name, regionCode });
	}
	if (lads.size === 0) throw new Error("ONS lookup: no local authority");
	return [...lads.values()].sort((a, b) => a.code.localeCompare(b.code));
}

/** OS Open Names' populated places kept as towns, by rank. */
const TOWN_RANKS: Readonly<Record<string, number>> = { City: 1, Town: 2, Village: 3 };

/**
 * The cities, towns and villages of OS Open Names, from the release ZIP (or one CSV of it).
 * Headerless CSV (`Doc/OS_Open_Names_Header.csv`): 1 ID, 3 NAME1, 4 NAME1_LANG, 5 NAME2,
 * 6 NAME2_LANG, 7 TYPE, 8 LOCAL_TYPE, 9 GEOMETRY_X, 10 GEOMETRY_Y. The English name is kept
 * where a place has two (`Abertawe` / `Swansea`).
 */
export function readOpenNames(archive: Buffer): GbTown[] {
	const towns: GbTown[] = [];
	const isZip = archive.length > 4 && archive.readUInt32LE(0) === 0x04034b50;
	const texts = isZip
		? (function* () {
				for (const entry of zipEntries(archive, (name) => /^Data\/[^/]+\.csv$/i.test(name))) {
					yield decodeText(entry.data);
				}
			})()
		: [decodeText(archive)];
	for (const text of texts) {
		for (const { fields } of csvRecords(text)) {
			if (fields[6] !== "populatedPlace") continue;
			const rank = TOWN_RANKS[fields[7] ?? ""];
			if (!rank) continue;
			const english =
				fields[3] === "eng" || !fields[3] ? fields[2] : fields[5] === "eng" ? fields[4] : fields[2];
			const name = (english ?? "").trim();
			const x = Number(fields[8]);
			const y = Number(fields[9]);
			const code = (fields[0] ?? "").trim();
			if (!name || !code || !Number.isFinite(x) || !Number.isFinite(y)) continue;
			towns.push({ code, name, rank, x, y, srid: 27700 });
		}
	}
	if (towns.length === 0) throw new Error("OS Open Names: no populated place");
	return towns;
}

/** The OSNI gazetteer: `PLACENAME,X,Y,OBJECTID`, Irish Grid coordinates, names in capitals. */
export function readOsniTowns(data: Buffer | string): GbTown[] {
	const text = typeof data === "string" ? data : decodeText(data);
	const towns: GbTown[] = [];
	let header: string[] | null = null;
	for (const { fields } of csvRecords(text)) {
		if (!header) {
			header = fields.map((name) => name.trim().toUpperCase());
			continue;
		}
		const get = (name: string) => fields[header?.indexOf(name) ?? -1]?.trim() ?? "";
		const name = titleCaseGb(get("PLACENAME"));
		const x = Number(get("X"));
		const y = Number(get("Y"));
		const id = get("OBJECTID");
		if (!name || !/^\d+$/.test(id) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
		towns.push({ code: `osni${id}`, name, rank: 2, x, y, srid: 29903 });
	}
	if (towns.length === 0) throw new Error("OSNI gazetteer: no place");
	return towns;
}

export async function fetchGbPlaceSources(
	urls: { ladLookup: string; ladBoundaries: string; towns: string; niTowns: string },
	workDir: string,
): Promise<GbPlaceSources> {
	const lads = parseLadLookup(await fetchJson<unknown>(urls.ladLookup));
	// The boundaries take tens of seconds to be generated: a download, not a metadata request.
	const shapes = await downloadFile({
		key: "gb-lad-boundaries",
		url: urls.ladBoundaries,
		path: join(workDir, GB_PLACE_FILES.ladBoundaries),
		text: true,
	});
	const boundaries = JSON.parse(await readFile(shapes.path, "utf8")) as { features: unknown[] };
	const towns = await downloadFile({
		key: "gb-towns",
		url: urls.towns,
		path: join(workDir, GB_PLACE_FILES.towns),
		text: false,
	});
	const niTowns = await downloadFile({
		key: "gb-ni-towns",
		url: urls.niTowns,
		path: join(workDir, GB_PLACE_FILES.niTowns),
		text: false,
	});
	return {
		lads,
		boundaries,
		towns: [
			...readOpenNames(await readFile(towns.path)),
			...readOsniTowns(await readFile(niTowns.path)),
		],
	};
}

export async function readGbPlaceSources(dir: string): Promise<GbPlaceSources> {
	const read = (name: string) => readFile(join(dir, name));
	const towns = await read(GB_PLACE_FILES.towns).catch(() => read("open-names.csv"));
	return {
		lads: parseLadLookup(JSON.parse((await read(GB_PLACE_FILES.ladLookup)).toString("utf8"))),
		boundaries: JSON.parse((await read(GB_PLACE_FILES.ladBoundaries)).toString("utf8")),
		towns: [...readOpenNames(towns), ...readOsniTowns(await read(GB_PLACE_FILES.niTowns))],
	};
}

/** A town located: its point in WGS 84 and the authority whose boundary holds it. */
export type LocatedTown = GbTown & { ladCode: string; longitude: number; latitude: number };

/** How far outside every boundary a town may be and still be given the nearest one (the coast). */
const COAST_METRES = 3_000;

/**
 * Locates the towns with PostGIS: their point in WGS 84 and the authority whose boundary
 * contains it (else the nearest within 3 km: a harbour on a simplified coastline). Towns
 * outside every authority are left out. Read-only: temporary tables, rolled back.
 */
export async function locateTowns(
	sql: Sql,
	sources: GbPlaceSources,
): Promise<{
	towns: LocatedTown[];
	centres: Map<string, { longitude: number; latitude: number }>;
}> {
	let located: LocatedTown[] = [];
	const centres = new Map<string, { longitude: number; latitude: number }>();
	await sql
		.begin(async (tx) => {
			await tx`CREATE TEMP TABLE gb_lad_shapes (code text PRIMARY KEY, geom geometry, lon float8, lat float8) ON COMMIT DROP`;
			for (const feature of sources.boundaries.features as {
				geometry?: unknown;
				properties?: Record<string, unknown>;
			}[]) {
				const properties = feature.properties ?? {};
				const code = vintageField(properties, /^LAD\d{2}CD$/i);
				if (!code || !feature.geometry) continue;
				const lon = Number(properties.LONG ?? properties.long);
				const lat = Number(properties.LAT ?? properties.lat);
				await tx`
					INSERT INTO gb_lad_shapes (code, geom, lon, lat)
					VALUES (${code},
						ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(feature.geometry)}), 4326)),
						${Number.isFinite(lon) ? lon : null}, ${Number.isFinite(lat) ? lat : null})
					ON CONFLICT (code) DO NOTHING
				`;
			}
			await tx`CREATE INDEX ON gb_lad_shapes USING gist (geom)`;
			await tx`ANALYZE gb_lad_shapes`;
			const shapes = await tx<{ code: string; lon: number | null; lat: number | null }[]>`
				SELECT code,
					coalesce(lon, ST_X(ST_PointOnSurface(geom))) AS lon,
					coalesce(lat, ST_Y(ST_PointOnSurface(geom))) AS lat
				FROM gb_lad_shapes
			`;
			for (const shape of shapes) {
				if (shape.lon !== null && shape.lat !== null) {
					centres.set(shape.code, { longitude: shape.lon, latitude: shape.lat });
				}
			}
			await tx`CREATE TEMP TABLE gb_towns (code text, name text, rank integer, x float8, y float8, srid integer) ON COMMIT DROP`;
			for (let index = 0; index < sources.towns.length; index += 5_000) {
				const chunk = JSON.stringify(sources.towns.slice(index, index + 5_000));
				await tx`
					INSERT INTO gb_towns
					SELECT * FROM jsonb_to_recordset(${chunk}::text::jsonb)
						AS r (code text, name text, rank integer, x float8, y float8, srid integer)
				`;
			}
			await tx`ALTER TABLE gb_towns ADD COLUMN point geometry`;
			await tx`UPDATE gb_towns SET point = ST_Transform(ST_SetSRID(ST_MakePoint(x, y), srid), 4326)`;
			await tx`CREATE INDEX ON gb_towns USING gist (point)`;
			await tx`ANALYZE gb_towns`;
			const rows = await tx<{ code: string; lad: string; lon: number; lat: number }[]>`
				SELECT t.code, coalesce(inside.code, near.code) AS lad, ST_X(t.point) AS lon, ST_Y(t.point) AS lat
				FROM gb_towns t
				LEFT JOIN LATERAL (
					SELECT s.code FROM gb_lad_shapes s WHERE ST_Intersects(s.geom, t.point) ORDER BY s.code LIMIT 1
				) inside ON true
				LEFT JOIN LATERAL (
					SELECT s.code FROM gb_lad_shapes s
					WHERE inside.code IS NULL AND ST_DWithin(s.geom::geography, t.point::geography, ${COAST_METRES})
					ORDER BY s.geom <-> t.point
					LIMIT 1
				) near ON true
				WHERE coalesce(inside.code, near.code) IS NOT NULL
			`;
			const byCode = new Map(sources.towns.map((town) => [town.code, town]));
			located = rows.flatMap((row) => {
				const town = byCode.get(row.code);
				return town ? [{ ...town, ladCode: row.lad, longitude: row.lon, latitude: row.lat }] : [];
			});
			throw new Rollback();
		})
		.catch((error: unknown) => {
			if (!(error instanceof Rollback)) throw error;
		});
	return { towns: located, centres };
}

class Rollback extends Error {}

/**
 * The place rows of the UK. Existing slugs are kept; a renamed place gets a new slug and keeps
 * the old one as an alias, as in France. Of two towns of one authority with the same slug, the
 * larger (city, town, village) is kept, then the first by code: a page names one place.
 */
export function buildGbPlaceRows(
	lads: GbLad[],
	towns: LocatedTown[],
	centres: Map<string, { longitude: number; latitude: number }>,
	existing: ExistingPlace[],
): PlaceRow[] {
	const existingByKey = new Map(existing.map((place) => [`${place.kind}:${place.code}`, place]));
	const keep = (kind: PlaceRow["kind"], code: string, name: string, fresh: () => string) => {
		const known = existingByKey.get(`${kind}:${code}`);
		if (known && known.name === name) return { slug: known.slug, previous: null };
		const slug = fresh();
		return { slug, previous: known && known.slug !== slug ? known.slug : null };
	};
	const row = (
		kind: PlaceRow["kind"],
		code: string,
		name: string,
		slug: string,
		departmentCode: string | null,
		regionCode: string | null,
		parent: { kind: string; code: string } | null,
		previous: string | null,
		point: { longitude: number; latitude: number } | null | undefined,
	): PlaceRow => ({
		kind,
		code,
		name,
		slug,
		department_code: departmentCode,
		region_code: regionCode,
		parent_kind: parent?.kind ?? null,
		parent_code: parent?.code ?? null,
		longitude: point?.longitude ?? null,
		latitude: point?.latitude ?? null,
		population: null,
		postcodes: [],
		previous_slug: previous,
	});

	const rows: PlaceRow[] = [];
	// Regions and departments share one slug space per market.
	const topTaken = new Set<string>();
	for (const place of existing) {
		if (place.kind === "region" || place.kind === "department") topTaken.add(place.slug);
	}
	const topSlug = (kind: PlaceRow["kind"], code: string, name: string) =>
		keep(kind, code, name, () => {
			const base = slugify(name) || code.toLowerCase();
			const slug = topTaken.has(base) ? `${base}-${code.toLowerCase()}` : base;
			topTaken.add(slug);
			return slug;
		});
	const usedRegions = new Set(lads.map((lad) => lad.regionCode));
	for (const [code, { name }] of Object.entries(GB_REGIONS)) {
		if (!usedRegions.has(code)) continue;
		const { slug, previous } = topSlug("region", code, name);
		rows.push(row("region", code, name, slug, null, code, null, previous, null));
	}
	const ladCodes = new Set<string>();
	for (const lad of lads) {
		ladCodes.add(lad.code);
		const { slug, previous } = topSlug("department", lad.code, lad.name);
		rows.push(
			row(
				"department",
				lad.code,
				lad.name,
				slug,
				lad.code,
				lad.regionCode,
				{ kind: "region", code: lad.regionCode },
				previous,
				centres.get(lad.code),
			),
		);
	}
	const regionOf = new Map(lads.map((lad) => [lad.code, lad.regionCode]));
	const localTaken = new Map<string, Set<string>>();
	for (const place of existing) {
		if (place.kind !== "commune") continue;
		const set = localTaken.get(place.departmentCode ?? "") ?? new Set<string>();
		set.add(place.slug);
		localTaken.set(place.departmentCode ?? "", set);
	}
	const kept = new Map<string, LocatedTown>();
	for (const town of [...towns].sort(
		(a, b) => a.rank - b.rank || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
	)) {
		if (!ladCodes.has(town.ladCode)) continue;
		const key = `${town.ladCode}:${slugify(town.name)}`;
		if (!slugify(town.name) || kept.has(key)) continue;
		kept.set(key, town);
	}
	for (const town of kept.values()) {
		const { slug, previous } = keep("commune", town.code, town.name, () => {
			const set = localTaken.get(town.ladCode) ?? new Set<string>();
			localTaken.set(town.ladCode, set);
			const base = slugify(town.name);
			const fresh = set.has(base) ? `${base}-${town.code.toLowerCase()}` : base;
			set.add(fresh);
			return fresh;
		});
		rows.push(
			row(
				"commune",
				town.code,
				town.name,
				slug,
				town.ladCode,
				regionOf.get(town.ladCode) ?? null,
				{ kind: "department", code: town.ladCode },
				previous,
				town,
			),
		);
	}
	return rows;
}

/** Upserts the UK's places (country `GB`); no other market's are read or touched. */
export async function importGbPlaces(
	sql: Sql,
	sources: GbPlaceSources,
	runId: number,
): Promise<PlacesStats> {
	const { towns, centres } = await locateTowns(sql, sources);
	let communes = 0;
	const stats = await writePlaces(
		sql,
		"GB",
		(existing) => {
			const rows = buildGbPlaceRows(sources.lads, towns, centres, existing);
			communes = rows.filter((row) => row.kind === "commune").length;
			return rows;
		},
		runId,
		{
			regions: new Set(sources.lads.map((lad) => lad.regionCode)).size,
			communes: 0,
			arrondissements: 0,
		},
	);
	return { ...stats, communes };
}
