/**
 * Lithuania's places from the Address Register (VĮ Registrų centras, data.gov.lt, CC BY 4.0), read
 * from the open data store (get.data.gov.lt, `datasets/gov/rc/ar/`): the ten counties
 * (`Apskritis`), the 60 municipalities (`Savivaldybe`), the elderships (`Seniunija`), the
 * settlements (`GyvenamojiVietove`, current ones only) and the settlements' boundaries
 * (`GraGyvenamojiVietove`, LKS-94 / EPSG:3346, written northing first).
 *
 * Counties are regions (they have listings, migration 0030), municipalities departments,
 * settlements communes; no arrondissement. A settlement's point is an interior point of its
 * largest ring (its centroid when inside), transformed to WGS 84 in PostGIS; municipalities and
 * counties take the centre of their settlements. A settlement two of one municipality share
 * names its eldership ("Pavyzdžiai (Pavyzdžio sen.)"), unless it is the one town of that name. The eight cities that are a municipality
 * of their own (`LT_CITY_MUNICIPALITIES`) are settlements like the others; the web app shows
 * their municipality's page for them. Run once, then yearly (`etl:places --country lt`).
 */
import { join } from "node:path";
import { slugify } from "@apercura/core";
import { LT_COUNTIES } from "@apercura/core/country";
import type { Sql } from "../../lib/db";
import { type ExistingPlace, type PlaceRow, type PlacesStats, writePlaces } from "../../lib/places";
import type { ShpRing } from "../../lib/shapefile";
import { interiorPoint } from "../it/places";
import type { LtAddressTables } from "./address";
import type { PoliteClient } from "./download";
import { storeCsvUrl } from "./download";
import { addressTablesOf, readModel, readModelRows } from "./tables";
import {
	addressFile,
	LT_ADDRESS_MODELS,
	LT_PLACE_MODELS,
	type LtAddressModel,
	type LtPlaceModel,
} from "./types";

/** The Address Register's namespace in the open data store. */
export const DEFAULT_LT_ADDRESS_BASE = "https://get.data.gov.lt/datasets/gov/rc/ar";

type Point = { x: number; y: number };

export type LtCounty = { id: string; code: string; name: string };

export type LtPlaceSources = {
	counties: LtCounty[];
	tables: LtAddressTables;
	/** Interior points of the settlements' boundaries in EPSG:3346 (x easting, y northing). */
	points: Map<string, Point>;
	/** Boundaries that could not be read (no geometry, a broken ring). */
	unreadableBoundaries: number;
};

/**
 * The rings of a WKT polygon or multipolygon in LKS-94, as easting/northing points. The store
 * writes LKS-94 northing first (`POLYGON ((6200290.49 342503.63, …))`): of a pair, the larger
 * number (above 5,000,000 in Lithuania) is the northing.
 */
export function wktRings(wkt: string): ShpRing[] {
	const rings: ShpRing[] = [];
	for (const match of wkt.matchAll(/\(([^()]+)\)/g)) {
		const ring: ShpRing = [];
		for (const pair of (match[1] ?? "").split(",")) {
			const [a, b] = pair.trim().split(/\s+/).map(Number);
			if (a === undefined || b === undefined || !Number.isFinite(a) || !Number.isFinite(b))
				continue;
			ring.push(a > b ? { x: b, y: a } : { x: a, y: b });
		}
		if (ring.length >= 4) rings.push(ring);
	}
	return rings;
}

const read = (dir: string, model: LtAddressModel | LtPlaceModel, columns: readonly string[]) =>
	readModelRows(join(dir, addressFile(model)), addressFile(model), columns);

/** The text tables an address is placed with, from `dir` (`ar_savivaldybe.csv`…). */
export async function readLtAddressTables(dir: string): Promise<LtAddressTables> {
	return addressTablesOf(
		await read(dir, "savivaldybe", LT_ADDRESS_MODELS.savivaldybe.columns),
		await read(dir, "seniunija", LT_ADDRESS_MODELS.seniunija.columns),
		await read(dir, "gyvenamojivietove", LT_ADDRESS_MODELS.gyvenamojivietove.columns),
	);
}

/** Reads the places from `dir`, the boundaries streamed (about 120 MB). */
export async function readLtPlaceSources(dir: string): Promise<LtPlaceSources> {
	const counties = (await read(dir, "apskritis", LT_PLACE_MODELS.apskritis.columns))
		.filter((row) => row.adm_kodas)
		.map((row) => ({
			id: row._id ?? "",
			code: row.adm_kodas ?? "",
			name: LT_COUNTIES[row.adm_kodas ?? ""] ?? `${row.pavadinimas} apskritis`,
		}));
	const tables = await readLtAddressTables(dir);
	const points = new Map<string, Point>();
	let unreadableBoundaries = 0;
	const file = addressFile("gragyvenamojivietove");
	for await (const { row } of readModel(
		join(dir, file),
		file,
		LT_PLACE_MODELS.gragyvenamojivietove.columns,
	)) {
		const point = row.gyv_kodas ? interiorPoint(wktRings(row.gyv_vietoves ?? "")) : null;
		if (point && row.gyv_kodas) points.set(row.gyv_kodas, point);
		else unreadableBoundaries++;
	}
	if (counties.length === 0 || tables.municipalities.length === 0) {
		throw new Error("not the Address Register: no counties or municipalities");
	}
	if (tables.settlements.length === 0) throw new Error("not the Address Register: no settlements");
	return { counties, tables, points, unreadableBoundaries };
}

/** The five tables of the places, in the order they are downloaded. */
const PLACE_DOWNLOADS: readonly [
	LtAddressModel | LtPlaceModel,
	string,
	readonly string[] | undefined,
][] = [
	["apskritis", LT_PLACE_MODELS.apskritis.path, undefined],
	["savivaldybe", LT_ADDRESS_MODELS.savivaldybe.path, undefined],
	["seniunija", LT_ADDRESS_MODELS.seniunija.path, undefined],
	["gyvenamojivietove", LT_ADDRESS_MODELS.gyvenamojivietove.path, undefined],
	[
		"gragyvenamojivietove",
		LT_PLACE_MODELS.gragyvenamojivietove.path,
		LT_PLACE_MODELS.gragyvenamojivietove.columns,
	],
];

/** The three text tables the weekly run downloads to place the addresses. */
export const ADDRESS_DOWNLOADS = PLACE_DOWNLOADS.filter(
	([model]) => model === "savivaldybe" || model === "seniunija" || model === "gyvenamojivietove",
);

/** Downloads the tables to `dir`, one polite request after another, and reads them. */
export async function fetchLtPlaceSources(
	client: PoliteClient,
	base: string,
	dir: string,
): Promise<LtPlaceSources> {
	for (const [model, path, columns] of PLACE_DOWNLOADS) {
		const file = await client.download(
			`ar-${model}`,
			storeCsvUrl(base, path, columns),
			join(dir, addressFile(model)),
		);
		if (file.bytes < 200) throw new Error(`Address Register ${model}: ${file.bytes} bytes`);
	}
	return readLtPlaceSources(dir);
}

type Located = { longitude: number; latitude: number };

/** Lithuania's extent, with a margin: a point outside it is a broken boundary, not a place. */
const BOUNDS = { south: 53.8, north: 56.5, west: 20.9, east: 26.9 };

/** Transforms the settlements' points from LKS-94 (EPSG:3346) to WGS 84 in PostGIS. */
async function locate(sql: Sql, points: Map<string, Point>): Promise<Map<string, Located>> {
	const located = new Map<string, Located>();
	const entries = [...points.entries()].map(([key, point]) => ({ key, x: point.x, y: point.y }));
	for (let index = 0; index < entries.length; index += 5_000) {
		const chunk = JSON.stringify(entries.slice(index, index + 5_000));
		const rows = await sql<{ key: string; longitude: number; latitude: number }[]>`
			SELECT r.key, ST_X(t.geom) AS longitude, ST_Y(t.geom) AS latitude
			FROM jsonb_to_recordset(${chunk}::text::jsonb) AS r (key text, x double precision, y double precision)
			CROSS JOIN LATERAL (
				SELECT ST_Transform(ST_SetSRID(ST_MakePoint(r.x, r.y), 3346), 4326) AS geom
			) t
		`;
		for (const row of rows) {
			if (
				row.latitude >= BOUNDS.south &&
				row.latitude <= BOUNDS.north &&
				row.longitude >= BOUNDS.west &&
				row.longitude <= BOUNDS.east
			) {
				located.set(row.key, { longitude: row.longitude, latitude: row.latitude });
			}
		}
	}
	return located;
}

/** A municipality's name as people say it: "Vilniaus miesto savivaldybė", "Birštono savivaldybė". */
export const municipalityName = (registerName: string) =>
	`${registerName.replace(/\s+/g, " ").trim()} savivaldybė`;

/**
 * The place rows of Lithuania. Existing slugs are kept; a renamed place gets a new slug and keeps
 * the old one as an alias, as in the other markets. Counties and municipalities share one slug
 * space; a settlement's slug is unique within its municipality: one two settlements share
 * carries its eldership (`pavyzdziai-pavyzdzio-sen`), then its code when that is not enough.
 */
export function buildLtPlaceRows(
	sources: LtPlaceSources,
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
	const countyCodes = new Map<string, string>();
	const byCode = (a: { code: string }, b: { code: string }) => Number(a.code) - Number(b.code);
	for (const county of [...sources.counties].sort(byCode)) {
		if (countyCodes.has(county.id)) continue;
		countyCodes.set(county.id, county.code);
		rows.push(
			row(
				"region",
				county.code,
				county.name,
				topSlug("region", county.code, county.name),
				null,
				county.code,
				null,
				null,
			),
		);
	}
	const municipalities = new Map<string, { code: string; county: string }>();
	for (const municipality of [...sources.tables.municipalities].sort(byCode)) {
		const county = countyCodes.get(municipality.countyId);
		if (!county || municipalities.has(municipality.id)) continue;
		municipalities.set(municipality.id, { code: municipality.code, county });
		const name = municipalityName(municipality.name);
		rows.push(
			row(
				"department",
				municipality.code,
				name,
				topSlug("department", municipality.code, name),
				municipality.code,
				county,
				{ kind: "region", code: county },
				null,
			),
		);
	}
	const elderships = new Map(sources.tables.elderships.map((item) => [item.id, item.name]));
	// Settlements of one municipality that share a name: the town among them (a city, else a
	// small town, when there is exactly one) keeps the plain name, the others name their eldership.
	const shared = new Map<string, LtPlaceSources["tables"]["settlements"]>();
	for (const settlement of sources.tables.settlements) {
		const key = `${settlement.municipalityId}|${settlement.name}`;
		shared.set(key, [...(shared.get(key) ?? []), settlement]);
	}
	const plain = new Set<string>();
	for (const group of shared.values()) {
		if (group.length === 1) {
			plain.add(group[0]?.code ?? "");
			continue;
		}
		const cities = group.filter((item) => item.type === "m.");
		const towns = group.filter((item) => item.type === "mstl.");
		const town =
			cities.length === 1
				? cities[0]
				: cities.length === 0 && towns.length === 1
					? towns[0]
					: undefined;
		if (town) plain.add(town.code);
	}
	for (const settlement of [...sources.tables.settlements].sort(byCode)) {
		const municipality = municipalities.get(settlement.municipalityId);
		if (!municipality) continue;
		const eldership = settlement.eldershipId ? elderships.get(settlement.eldershipId) : undefined;
		const name =
			!plain.has(settlement.code) && eldership
				? `${settlement.name} (${eldership} sen.)`
				: settlement.name;
		rows.push(
			row(
				"commune",
				settlement.code,
				name,
				localSlug(settlement.code, name, municipality.code),
				municipality.code,
				municipality.county,
				{ kind: "department", code: municipality.code },
				points.get(settlement.code),
			),
		);
	}
	return rows;
}

/** Upserts Lithuania's places (country `LT`); no other market's are read or touched. */
export async function importLtPlaces(
	sql: Sql,
	sources: LtPlaceSources,
	runId: number,
): Promise<PlacesStats & { located: number; unreadableBoundaries: number }> {
	const points = await locate(sql, sources.points);
	let communes = 0;
	const stats = await writePlaces(
		sql,
		"LT",
		(existing) => {
			const rows = buildLtPlaceRows(sources, points, existing);
			communes = rows.filter((row) => row.kind === "commune").length;
			return rows;
		},
		runId,
		{ regions: sources.counties.length, communes: 0, arrondissements: 0 },
	);
	return {
		...stats,
		communes,
		located: points.size,
		unreadableBoundaries: sources.unreadableBoundaries,
	};
}
