/**
 * Finland's places from Statistics Finland (Tilastokeskus, CC BY 4.0, credited "Lähde:
 * Tilastokeskus"): the municipalities of its statistical areas (`kunta4500k_{year}`, the
 * geoserver's WFS layer, read as GeoJSON in WGS 84, with each municipality's three-digit code
 * and its Finnish and Swedish names) and the classification server's correspondence tables of
 * the year, from municipalities to wellbeing services counties (`kunta_1_{year}0101#
 * hyvinvointialue_1_{year}0101`) and to regions (`…#maakunta_1_{year}0101`).
 *
 * Mapped onto the kinds of `directory.places`:
 * - the 19 regions (maakunnat) and Åland are regions (`06` Pirkanmaa), with no listing of their
 *   own;
 * - the 21 wellbeing services counties (hyvinvointialueet), which organise public health care,
 *   and the City of Helsinki and Åland, which organise their own, are departments (`08`
 *   Pirkanmaan hyvinvointialue, `90` Helsinki, `91` Ahvenanmaa), with listings;
 * - the 308 municipalities (kunnat) are communes of their county (`837` Tampere). Helsinki is
 *   the only municipality of its department: like Paris, its city page is the department's
 *   (`apps/web/src/lib/places.ts`).
 * A municipality's point is an interior point of its largest ring; counties and regions take the
 * centre of their municipalities (`lib/places.ts`). Run once, then each January, when the
 * municipalities may merge (`etl:places --country fi`).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { slugify } from "@apercura/core";
import { FI_PLACES_YEAR } from "@apercura/core/country";
import type { Sql, TransactionSql } from "../../lib/db";
import { downloadFile } from "../../lib/files";
import { type ExistingPlace, type PlaceRow, type PlacesStats, writePlaces } from "../../lib/places";
import type { ShpRing } from "../../lib/shapefile";
import { interiorPoint } from "../it/places";

/** File names in `--source-dir`. */
export const FI_PLACES_FILES = {
	municipalities: "kunnat.geojson",
	counties: "kunta_hyvinvointialue.json",
	regions: "kunta_maakunta.json",
} as const;

export type FiPlacesFileId = keyof typeof FI_PLACES_FILES;

/** The addresses of the year's files (`ETL_FI_PLACES_YEAR` picks another year). */
export function defaultFiPlacesUrls(year: number = FI_PLACES_YEAR): Record<FiPlacesFileId, string> {
	const classifications = "https://data.stat.fi/api/classifications/v2/correspondenceTables";
	const map = (target: string) =>
		`${classifications}/kunta_1_${year}0101%23${target}_1_${year}0101/maps?content=data&meta=min&lang=fi&format=json`;
	return {
		municipalities: `https://geo.stat.fi/geoserver/tilastointialueet/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=tilastointialueet:kunta4500k_${year}&outputFormat=application/json&srsName=EPSG:4326`,
		counties: map("hyvinvointialue"),
		regions: map("maakunta"),
	};
}

export type FiUnit = { code: string; name: string };

export type FiMunicipality = FiUnit & {
	/** The Swedish name (`Tammerfors`), the same as the Finnish one when there is none. */
	nameSv: string;
	county: string;
	region: string;
	longitude: number | null;
	latitude: number | null;
};

export type FiPlaceSources = {
	/** The year of the statistical areas (`vuosi`). */
	year: number | null;
	regions: FiUnit[];
	counties: FiUnit[];
	municipalities: FiMunicipality[];
};

/**
 * The department code of the City of Helsinki, which organises its own health care, and the name
 * its pages give it: the classification's "Helsingin kaupunki" is the city, which everyone calls
 * Helsinki.
 */
export const FI_HELSINKI_COUNTY = "90";
const COUNTY_NAMES: Readonly<Record<string, string>> = { [FI_HELSINKI_COUNTY]: "Helsinki" };

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

type Correspondence = {
	sourceItem?: { code?: string; classificationItemNames?: { name?: string }[] };
	targetItem?: { code?: string; classificationItemNames?: { name?: string }[] };
};

/** `{ municipality code → target unit }` of a correspondence table. Throws when it is not one. */
function readCorrespondence(data: Buffer, what: string): Map<string, FiUnit> {
	const rows = JSON.parse(data.toString("utf8")) as Correspondence[];
	if (!Array.isArray(rows) || rows.length === 0) throw new Error(`not a ${what} table: no row`);
	const map = new Map<string, FiUnit>();
	for (const row of rows) {
		const source = text(row.sourceItem?.code);
		const code = text(row.targetItem?.code);
		const name = text(row.targetItem?.classificationItemNames?.[0]?.name);
		if (!/^\d{3}$/.test(source) || !/^\d{2}$/.test(code) || !name) {
			throw new Error(`not a ${what} table: a row without codes`);
		}
		map.set(source, { code, name });
	}
	return map;
}

type Feature = {
	properties?: Record<string, unknown>;
	geometry?: { type?: string; coordinates?: unknown } | null;
};

/** The outer rings of a GeoJSON Polygon or MultiPolygon, as `{ x: longitude, y: latitude }`. */
function outerRings(geometry: Feature["geometry"]): ShpRing[] {
	const toRing = (ring: unknown): ShpRing =>
		Array.isArray(ring)
			? ring
					.filter((point): point is number[] => Array.isArray(point) && point.length >= 2)
					.map((point) => ({ x: Number(point[0]), y: Number(point[1]) }))
			: [];
	if (!geometry || !Array.isArray(geometry.coordinates)) return [];
	if (geometry.type === "Polygon") return [toRing(geometry.coordinates[0])];
	if (geometry.type === "MultiPolygon") {
		return geometry.coordinates.map((polygon) => toRing(Array.isArray(polygon) ? polygon[0] : []));
	}
	return [];
}

/**
 * Reads the three files. Throws when one is not what it should be (a missing property, a
 * municipality without its county or region).
 */
export function parseFiPlaces(files: Record<FiPlacesFileId, Buffer>): FiPlaceSources {
	const collection = JSON.parse(files.municipalities.toString("utf8")) as { features?: Feature[] };
	const features = collection.features;
	if (!Array.isArray(features) || features.length === 0) {
		throw new Error("not the municipalities' layer: no feature");
	}
	const counties = readCorrespondence(files.counties, "municipality–county");
	const regions = readCorrespondence(files.regions, "municipality–region");
	const sources: FiPlaceSources = { year: null, regions: [], counties: [], municipalities: [] };
	const seenCounties = new Map<string, FiUnit>();
	const seenRegions = new Map<string, FiUnit>();
	for (const feature of features) {
		const properties = feature.properties ?? {};
		const code = text(properties.kunta);
		const name = text(properties.nimi);
		if (!/^\d{3}$/.test(code) || !name) {
			throw new Error("not the municipalities' layer: a feature without kunta or nimi");
		}
		const year = Number(properties.vuosi);
		if (Number.isInteger(year) && sources.year === null) sources.year = year;
		const county = counties.get(code);
		const region = regions.get(code);
		if (!county) throw new Error(`municipality ${code} has no wellbeing services county`);
		if (!region) throw new Error(`municipality ${code} has no region`);
		seenCounties.set(county.code, {
			code: county.code,
			name: COUNTY_NAMES[county.code] ?? county.name,
		});
		seenRegions.set(region.code, region);
		const point = interiorPoint(outerRings(feature.geometry));
		sources.municipalities.push({
			code,
			name,
			nameSv: text(properties.namn) || name,
			county: county.code,
			region: region.code,
			longitude: point ? Math.round(point.x * 1e6) / 1e6 : null,
			latitude: point ? Math.round(point.y * 1e6) / 1e6 : null,
		});
	}
	sources.counties = [...seenCounties.values()];
	sources.regions = [...seenRegions.values()];
	return sources;
}

/**
 * The rows of Finland's places, keeping the slug of a place whose name did not change (a renamed
 * place gets a new slug and keeps the old one as an alias). Counties and regions share one slug
 * space, counties first (their pages are listings); a municipality's slug is unique within its
 * county (`-{code}` on a collision).
 */
export function buildFiPlaceRows(sources: FiPlaceSources, existing: ExistingPlace[]): PlaceRow[] {
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
	const localSlug = (code: string, name: string, county: string) =>
		keep("commune", code, name, () => {
			const set = localTaken.get(county) ?? new Set<string>();
			localTaken.set(county, set);
			const base = slugify(name) || code;
			const slug = set.has(base) ? `${base}-${code}` : base;
			set.add(slug);
			return slug;
		});
	const base = {
		parent_kind: null,
		parent_code: null,
		longitude: null,
		latitude: null,
		population: null,
		postcodes: [] as string[],
	};
	const byCode = (a: FiUnit, b: FiUnit) => a.code.localeCompare(b.code);
	// A county lies in one region (Uusimaa holds four, and Helsinki).
	const regionOfCounty = new Map(sources.municipalities.map((item) => [item.county, item.region]));
	const rows: PlaceRow[] = [];
	for (const county of [...sources.counties].sort(byCode)) {
		const { slug, previous } = topSlug("department", county.code, county.name);
		const region = regionOfCounty.get(county.code) ?? null;
		rows.push({
			...base,
			kind: "department",
			code: county.code,
			name: county.name,
			slug,
			department_code: county.code,
			region_code: region,
			parent_kind: region ? "region" : null,
			parent_code: region,
			previous_slug: previous,
		});
	}
	for (const region of [...sources.regions].sort(byCode)) {
		const { slug, previous } = topSlug("region", region.code, region.name);
		rows.push({
			...base,
			kind: "region",
			code: region.code,
			name: region.name,
			slug,
			department_code: null,
			region_code: region.code,
			previous_slug: previous,
		});
	}
	for (const municipality of [...sources.municipalities].sort(byCode)) {
		const { slug, previous } = localSlug(municipality.code, municipality.name, municipality.county);
		rows.push({
			...base,
			kind: "commune",
			code: municipality.code,
			name: municipality.name,
			slug,
			department_code: municipality.county,
			region_code: municipality.region,
			parent_kind: "department",
			parent_code: municipality.county,
			longitude: municipality.longitude,
			latitude: municipality.latitude,
			previous_slug: previous,
		});
	}
	return rows;
}

/** Upserts Finland's places (country `FI`); no other market's are read or touched. */
export async function importFiPlaces(
	sql: Sql,
	sources: FiPlaceSources,
	runId: number,
	log: (message: string) => void = () => {},
): Promise<PlacesStats & { located: number; year: number | null; expectedYear: number }> {
	if (sources.year !== FI_PLACES_YEAR) {
		log(
			`fi places: the statistical areas are of ${sources.year ?? "an unknown year"}, the credit says ${FI_PLACES_YEAR}: raise FI_PLACES_YEAR (packages/core/src/country/fi.ts)`,
		);
	}
	const stats = await writePlaces(
		sql,
		"FI",
		(existing) => buildFiPlaceRows(sources, existing),
		runId,
		{
			regions: sources.regions.length,
			communes: sources.municipalities.length,
			arrondissements: 0,
		},
	);
	return {
		...stats,
		located: sources.municipalities.filter((item) => item.longitude !== null).length,
		year: sources.year,
		expectedYear: FI_PLACES_YEAR,
	};
}

/** Reads the three files from `--source-dir`. */
export async function readFiPlaceSources(dir: string): Promise<FiPlaceSources> {
	const files = {} as Record<FiPlacesFileId, Buffer>;
	for (const [key, name] of Object.entries(FI_PLACES_FILES) as [FiPlacesFileId, string][]) {
		files[key] = await readFile(join(dir, name));
	}
	return parseFiPlaces(files);
}

/** Downloads the three files (about 800 kB) to `dir` and reads them. */
export async function fetchFiPlaceSources(
	urls: Record<FiPlacesFileId, string>,
	dir: string,
): Promise<FiPlaceSources> {
	const files = {} as Record<FiPlacesFileId, Buffer>;
	for (const [key, name] of Object.entries(FI_PLACES_FILES) as [FiPlacesFileId, string][]) {
		const file = await downloadFile({
			key: `places-${key}`,
			url: urls[key],
			path: join(dir, name),
			text: false,
		});
		files[key] = await readFile(file.path);
	}
	return parseFiPlaces(files);
}

// ---------------------------------------------------------------------------
// Placing a service location
// ---------------------------------------------------------------------------

export type FiMunicipalityPlace = { id: number; code: string; name: string; countyCode: string };

/** Finland's municipalities by their three-digit code, the code PTV writes in every address. */
export type FiPlaceIndex = Map<string, FiMunicipalityPlace>;

/** Builds the index of Finland's municipalities the service locations are placed in. */
export async function loadFiPlaceIndex(sql: Sql | TransactionSql): Promise<FiPlaceIndex> {
	const rows = await sql<FiMunicipalityPlace[]>`
		SELECT id, code, name, department_code AS "countyCode" FROM directory.places
		WHERE country = 'FI' AND kind = 'commune' AND removed_at IS NULL
	`;
	return new Map(rows.map((row) => [row.code, row]));
}
