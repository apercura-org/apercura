/**
 * Ireland's places, from open boundaries and a gazetteer (CC BY 4.0), read as GeoJSON from their
 * ArcGIS feature services:
 * - the 26 counties of Tailte Éireann's National Statutory Boundaries (2019, generalised 20 m),
 *   by their `CO_ID`: the departments, named "County Cork" (slug `cork`), grouped in the four
 *   provinces (the regions: no listing of their own);
 * - the CSO's Census 2022 Built Up Areas (867 towns, `BUA_CODE`, population): the communes, named
 *   as the census does, a city without "city and suburbs" (`Dublin`, `Cork`);
 * - Tailte Éireann's Centres of Population of the National Placenames Gazetteer (about 2,000
 *   points with their English and Irish names): a point inside a town's boundary makes its names
 *   other names of that town (`Tallaght` → Dublin, `Spiddal` → An Spidéal), for matching only.
 *
 * A town's point and county are computed in PostGIS (as Italy's ISTAT points are transformed
 * there): its point is a point on its surface (a centroid falls outside a hundred concave or
 * coastal towns), its county the one its boundary overlaps most (a centroid test leaves coastal
 * towns such as Dungarvan or Bundoran without one). The counties' and towns' boundaries and the
 * towns' other names are kept in `directory.place_lookup`, where `etl:ie` reads them. Run once,
 * then after a census (`etl:places --country ie`).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { slugify } from "@apercura/core";
import { IE_COUNTIES, IE_PROVINCES } from "@apercura/core/country";
import type { Sql, TransactionSql } from "../../lib/db";
import { downloadFile } from "../../lib/files";
import { type ExistingPlace, type PlaceRow, type PlacesStats, writePlaces } from "../../lib/places";
import { cleanText, townKey, townName } from "./names";

const TAILTE = "https://services-eu1.arcgis.com/FH5XCsx8rYXqnjF5/arcgis/rest/services";

/** Where the places are published (overridden by `ETL_IE_COUNTIES_URL`, `ETL_IE_TOWNS_URL`, `ETL_IE_PLACENAMES_URL`). */
export const IE_PLACE_URLS = {
	counties: `${TAILTE}/Counties___OSi_National_Statutory_Boundaries___Generalised_20m/FeatureServer/0/query?where=1%3D1&outFields=CO_ID,ENGLISH,GAEILGE,PROVINCE&outSR=4326&geometryPrecision=5&f=geojson`,
	towns:
		"https://services-eu1.arcgis.com/BuS9rtTsYEV5C0xh/arcgis/rest/services/CensusHub2022_T1_2_BUA/FeatureServer/0/query?where=1%3D1&outFields=BUA_CODE,BUA_NAME,T1_1AGETT_Norm&outSR=4326&geometryPrecision=5&f=geojson&resultRecordCount=2000",
	/** Paged: `&resultOffset=<n>` is added, 2,000 points at a time. */
	placenames: `${TAILTE}/Centres_of_Population___OSi_National_Placenames_Gazetteer/FeatureServer/0/query?where=1%3D1&outFields=English_Na,Irish_Name,County&outSR=4326&f=geojson&resultRecordCount=2000`,
} as const;

/** The files in `--source-dir`; the gazetteer is read from every `ie-placenames-<n>.geojson`. */
export const IE_PLACE_FILES = {
	counties: "ie-counties.geojson",
	towns: "ie-towns.geojson",
	placenames: (page: number) => `ie-placenames-${page}.geojson`,
} as const;

/** A page of the gazetteer (the service's limit). */
const PLACENAMES_PAGE = 2_000;

export type IeCountyArea = { code: string; geometry: unknown };
export type IeTownArea = {
	code: string;
	name: string;
	population: number | null;
	geometry: unknown;
};
export type IePlacename = { english: string; irish: string; longitude: number; latitude: number };

export type IePlaceSources = {
	counties: IeCountyArea[];
	towns: IeTownArea[];
	placenames: IePlacename[];
};

/**
 * Other names of a town that the gazetteer lacks and the lists write (the PSI's and HIQA's
 * towns, November 2026), by the town's census code: a suburb inside the town's built-up area
 * that has no gazetteer point there (or one in the sea: Salthill), or another spelling of the
 * town's own name than the census's. Kept short, one reason each; a name the lists write for a
 * place outside every census town (a village under the census's threshold) has no entry, and
 * the facility is placed in its county.
 */
export const IE_MANUAL_ALIASES: readonly {
	code: string;
	aliases: readonly string[];
	why: string;
}[] = [
	{
		code: "02341",
		aliases: [
			"Dun Laoghaire",
			"Dún Laoghaire",
			"Glenageary",
			"Balgriffin",
			"Citywest",
			"Northwood",
			"Drumcondra",
		],
		why: "Dublin: suburbs inside its built-up area without a gazetteer point (the gazetteer's Drumcondra is Drumconrath, Co. Meath)",
	},
	{
		code: "17364",
		aliases: [
			"Bishopstown",
			"Mahon",
			"Blackpool",
			"Ballyphehane",
			"Douglas",
			"Montenotte",
			"Gurranabraher",
			"Ballyvolane",
			"Ballintemple",
			"Ballinlough",
			"Rochestown",
		],
		why: "Cork: suburbs inside its built-up area without a gazetteer point",
	},
	{
		code: "26305",
		aliases: ["Renmore", "Doughiska", "Salthill", "Knocknacarra", "Shantalla"],
		why: "Galway: suburbs inside its built-up area (Salthill's gazetteer point is on the shore, outside it)",
	},
	{ code: "20497", aliases: ["Corbally"], why: "Limerick: a suburb inside its built-up area" },
	{
		code: "24643",
		aliases: ["Ferrybank", "Ballybeg"],
		why: "Waterford: Ferrybank (Co. Kilkenny) across the Suir and Ballybeg, inside its built-up area",
	},
	{ code: "31143", aliases: ["Ballytivnan"], why: "Sligo: a suburb inside its built-up area" },
	{
		code: "01639",
		aliases: ["Graiguecullen"],
		why: "Carlow: Graiguecullen (Co. Laois) is the part of the town across the Barrow",
	},
	{
		code: "25684",
		aliases: ["Abbeyside"],
		why: "Dungarvan: Abbeyside is the part of the town across the Colligan",
	},
	{
		code: "09239",
		aliases: ["Lanesboro"],
		why: "Lanesborough-Ballyleague: the short spelling of Lanesborough",
	},
	{
		code: "19864",
		aliases: ["Caherciveen", "Cahersiveen", "Cahirsiveen"],
		why: "Cahirciveen: other spellings of the town's name",
	},
	{
		code: "16545",
		aliases: ["Scariff"],
		why: "Scarriff-Tuamgraney: the usual spelling of Scarriff",
	},
	{ code: "16571", aliases: ["Ennistymon"], why: "Ennistimon: the usual spelling" },
	{ code: "16573", aliases: ["Lahinch"], why: "Lehinch: the usual spelling" },
	{ code: "27290", aliases: ["Kinvara"], why: "Kinvarra: the usual spelling" },
	{ code: "21526", aliases: ["Dromcollogher"], why: "Drumcollogher: the other spelling" },
	{
		code: "18803",
		aliases: ["Enniskeane"],
		why: "Ballineen-Enniskean: the usual spelling of Enniskean",
	},
	{ code: "31146", aliases: ["Ballisodare"], why: "Ballysadare: the other spelling" },
	{ code: "18775", aliases: ["Innishannon"], why: "Inishannon: the other spelling" },
	{ code: "32057", aliases: ["Arva"], why: "Arvagh: the usual spelling" },
	{
		code: "14591",
		aliases: ["Rosslare Strand"],
		why: "Rosslare: the census's town is Rosslare Strand",
	},
	{
		code: "18815",
		aliases: ["Ballymakeera", "Ballymakeery"],
		why: "Baile Mhic Íre: its English names (the gazetteer has none inside it)",
	},
	{
		code: "33117",
		aliases: ["Dungloe"],
		why: "An Clochán Liath: the usual English spelling (the gazetteer writes Dunglow)",
	},
	{
		code: "27299",
		aliases: ["Spiddal"],
		why: "An Spidéal: the usual English spelling (the gazetteer writes Spiddle)",
	},
];

type Feature = { geometry?: unknown; properties?: Record<string, unknown> | null };

function featuresOf(raw: string, what: string): Feature[] {
	let parsed: { type?: string; features?: unknown };
	try {
		parsed = JSON.parse(raw) as typeof parsed;
	} catch {
		throw new Error(`${what}: not JSON`);
	}
	if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
		throw new Error(`${what}: not a GeoJSON feature collection`);
	}
	return parsed.features as Feature[];
}

const property = (feature: Feature, key: string) => {
	const value = feature.properties?.[key];
	return typeof value === "string" || typeof value === "number" ? cleanText(String(value)) : "";
};

const isArea = (geometry: unknown) =>
	typeof geometry === "object" &&
	geometry !== null &&
	["Polygon", "MultiPolygon"].includes((geometry as { type?: string }).type ?? "");

/** Tailte Éireann's counties. Throws unless they are the 26 counties of `IE_COUNTIES`. */
export function parseIeCounties(raw: string): IeCountyArea[] {
	const counties: IeCountyArea[] = [];
	for (const feature of featuresOf(raw, "counties")) {
		const code = property(feature, "CO_ID");
		if (!IE_COUNTIES[code]) throw new Error(`counties: unknown CO_ID "${code}"`);
		if (!isArea(feature.geometry)) throw new Error(`counties: ${code} has no boundary`);
		counties.push({ code, geometry: feature.geometry });
	}
	const codes = new Set(counties.map((county) => county.code));
	if (codes.size !== 26 || counties.length !== 26) {
		throw new Error(`counties: ${codes.size} counties, 26 expected`);
	}
	return counties;
}

/** The CSO's Built Up Areas. Throws when a town has no five-digit code, no name or no boundary. */
export function parseIeTowns(raw: string): IeTownArea[] {
	const towns: IeTownArea[] = [];
	const seen = new Set<string>();
	for (const feature of featuresOf(raw, "towns")) {
		const code = property(feature, "BUA_CODE");
		const name = property(feature, "BUA_NAME");
		if (!/^\d{5}$/.test(code) || !name)
			throw new Error(`towns: a town without a code or a name (${code})`);
		if (!isArea(feature.geometry)) throw new Error(`towns: ${code} has no boundary`);
		if (seen.has(code)) throw new Error(`towns: ${code} twice`);
		seen.add(code);
		const population = Number(property(feature, "T1_1AGETT_Norm"));
		towns.push({
			code,
			name,
			population: Number.isInteger(population) && population >= 0 ? population : null,
			geometry: feature.geometry,
		});
	}
	// The census has 867; a page of an error or a truncated answer has none or a few.
	if (towns.length < 20) throw new Error(`towns: ${towns.length} towns, at least 20 expected`);
	return towns;
}

/** The gazetteer's points, from its pages. */
export function parseIePlacenames(pages: readonly string[]): IePlacename[] {
	const names: IePlacename[] = [];
	for (const page of pages) {
		for (const feature of featuresOf(page, "placenames")) {
			const geometry = feature.geometry as { type?: string; coordinates?: unknown } | undefined;
			const coordinates = geometry?.type === "Point" ? geometry.coordinates : null;
			if (!Array.isArray(coordinates)) continue;
			const [longitude, latitude] = coordinates.map(Number);
			if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;
			const english = property(feature, "English_Na");
			const irish = property(feature, "Irish_Name");
			if (!english && !irish) continue;
			names.push({ english, irish, longitude: longitude ?? 0, latitude: latitude ?? 0 });
		}
	}
	return names;
}

/** Reads the places from `--source-dir` (`ie-counties.geojson`, `ie-towns.geojson`, `ie-placenames-1.geojson`…). */
export async function readIePlaceSources(dir: string): Promise<IePlaceSources> {
	const pages: string[] = [];
	for (let page = 1; ; page++) {
		try {
			pages.push(await readFile(join(dir, IE_PLACE_FILES.placenames(page)), "utf8"));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT" && page > 1) break;
			throw error;
		}
	}
	return {
		counties: parseIeCounties(await readFile(join(dir, IE_PLACE_FILES.counties), "utf8")),
		towns: parseIeTowns(await readFile(join(dir, IE_PLACE_FILES.towns), "utf8")),
		placenames: parseIePlacenames(pages),
	};
}

/** Downloads the counties, the towns and the gazetteer (every page) to `dir`, and reads them. */
export async function fetchIePlaceSources(
	dir: string,
	urls: { counties?: string; towns?: string; placenames?: string } = {},
): Promise<IePlaceSources> {
	const counties = await downloadFile({
		key: "ie-counties",
		url: urls.counties || IE_PLACE_URLS.counties,
		path: join(dir, IE_PLACE_FILES.counties),
		text: true,
	});
	if (counties.bytes < 100_000) throw new Error(`counties: ${counties.bytes} bytes`);
	const towns = await downloadFile({
		key: "ie-towns",
		url: urls.towns || IE_PLACE_URLS.towns,
		path: join(dir, IE_PLACE_FILES.towns),
		text: true,
	});
	if (towns.bytes < 100_000) throw new Error(`towns: ${towns.bytes} bytes`);
	for (let page = 1; page <= 10; page++) {
		const file = await downloadFile({
			key: `ie-placenames-${page}`,
			url: `${urls.placenames || IE_PLACE_URLS.placenames}&resultOffset=${(page - 1) * PLACENAMES_PAGE}`,
			path: join(dir, IE_PLACE_FILES.placenames(page)),
			text: true,
		});
		const features = featuresOf(await readFile(file.path, "utf8"), "placenames");
		if (features.length < PLACENAMES_PAGE) break;
	}
	return readIePlaceSources(dir);
}

export type IeTownFacts = {
	code: string;
	countyCode: string;
	longitude: number;
	latitude: number;
	/** The gazetteer's names whose point is inside the town (its other names). */
	aliases: string[];
};

/** Boundaries as a JSON array for `jsonb_to_recordset` (code and GeoJSON geometry). */
const areasJson = (areas: readonly { code: string; geometry: unknown }[]) =>
	JSON.stringify(areas.map((area) => ({ code: area.code, geometry: area.geometry })));

/** Loads the boundaries into temporary tables of the transaction (valid multipolygons, WGS 84). */
async function loadAreas(tx: TransactionSql, sources: IePlaceSources) {
	for (const [table, areas] of [
		["ie_county_areas", sources.counties],
		["ie_town_areas", sources.towns],
	] as const) {
		await tx.unsafe(
			`CREATE TEMP TABLE ${table} (code text PRIMARY KEY, area geometry) ON COMMIT DROP`,
		);
		await tx.unsafe(
			`INSERT INTO ${table} (code, area)
			SELECT r.code, ST_Multi(ST_CollectionExtract(ST_MakeValid(
				ST_SetSRID(ST_GeomFromGeoJSON(r.geometry::text), 4326)), 3))
			FROM jsonb_to_recordset($1::text::jsonb) AS r (code text, geometry jsonb)`,
			[areasJson(areas)],
		);
		await tx.unsafe(`CREATE INDEX ON ${table} USING gist (area)`);
		await tx.unsafe(`ANALYZE ${table}`);
	}
}

/**
 * Each town's point (on its surface) and county (the one its boundary overlaps most), and the
 * gazetteer's names whose point is inside it, computed in PostGIS.
 */
export async function computeIeTowns(sql: Sql, sources: IePlaceSources): Promise<IeTownFacts[]> {
	return sql.begin(async (tx) => {
		await loadAreas(tx, sources);
		const towns = await tx<
			{ code: string; county: string | null; longitude: number; latitude: number }[]
		>`
			SELECT t.code, c.code AS county,
				ST_X(ST_PointOnSurface(t.area)) AS longitude, ST_Y(ST_PointOnSurface(t.area)) AS latitude
			FROM ie_town_areas t
			LEFT JOIN LATERAL (
				SELECT c.code FROM ie_county_areas c
				WHERE ST_Intersects(c.area, t.area)
				ORDER BY ST_Area(ST_Intersection(c.area, t.area)) DESC, c.code
				LIMIT 1
			) c ON true
		`;
		const names = JSON.stringify(
			sources.placenames.map((name, index) => ({ id: index, x: name.longitude, y: name.latitude })),
		);
		const inside = await tx<{ id: number; code: string }[]>`
			SELECT r.id, t.code
			FROM jsonb_to_recordset(${names}::text::jsonb) AS r (id integer, x double precision, y double precision)
			JOIN ie_town_areas t ON ST_Intersects(t.area, ST_SetSRID(ST_MakePoint(r.x, r.y), 4326))
		`;
		const aliases = new Map<string, Set<string>>();
		for (const row of inside) {
			const name = sources.placenames[row.id];
			if (!name) continue;
			const set = aliases.get(row.code) ?? new Set<string>();
			for (const alias of [name.english, name.irish]) if (alias) set.add(alias);
			aliases.set(row.code, set);
		}
		const missing = towns.filter((town) => !town.county).map((town) => town.code);
		if (missing.length > 0) throw new Error(`towns outside every county: ${missing.join(", ")}`);
		return towns.map((town) => ({
			code: town.code,
			countyCode: town.county ?? "",
			longitude: town.longitude,
			latitude: town.latitude,
			aliases: [...(aliases.get(town.code) ?? [])].sort(),
		}));
	});
}

/** A county's place name and slug: `County Cork`, `cork`. */
export const countyPlaceName = (code: string) => `County ${IE_COUNTIES[code]?.name ?? code}`;

/**
 * The place rows of Ireland. Existing slugs are kept; a renamed place gets a new slug and keeps
 * the old one as an alias, as in the other markets. Provinces and counties share one slug space;
 * a town's slug is unique within its county (`-{code}` on a collision).
 */
export function buildIePlaceRows(
	sources: IePlaceSources,
	facts: readonly IeTownFacts[],
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
	const topSlug = (kind: PlaceRow["kind"], code: string, name: string, base: string) =>
		keep(kind, code, name, () => {
			const slug = topTaken.has(base) ? `${base}-${code.toLowerCase()}` : base;
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
	const row = (
		kind: PlaceRow["kind"],
		code: string,
		name: string,
		slug: { slug: string; previous: string | null },
		department: string | null,
		region: string,
		parent: { kind: string; code: string } | null,
		point: { longitude: number; latitude: number } | null,
		population: number | null,
	): PlaceRow => ({
		kind,
		code,
		name,
		slug: slug.slug,
		department_code: department,
		region_code: region,
		parent_kind: parent?.kind ?? null,
		parent_code: parent?.code ?? null,
		longitude: point?.longitude ?? null,
		latitude: point?.latitude ?? null,
		population,
		postcodes: [],
		previous_slug: slug.previous,
	});
	const rows: PlaceRow[] = [];
	for (const [code, name] of Object.entries(IE_PROVINCES)) {
		rows.push(
			row(
				"region",
				code,
				name,
				topSlug("region", code, name, slugify(name)),
				null,
				code,
				null,
				null,
				null,
			),
		);
	}
	const counties = [...sources.counties].sort((a, b) => Number(a.code) - Number(b.code));
	for (const county of counties) {
		const info = IE_COUNTIES[county.code];
		if (!info) continue;
		const name = countyPlaceName(county.code);
		rows.push(
			row(
				"department",
				county.code,
				name,
				topSlug("department", county.code, name, slugify(info.name)),
				county.code,
				info.province,
				{ kind: "region", code: info.province },
				null,
				null,
			),
		);
	}
	const factsByCode = new Map(facts.map((fact) => [fact.code, fact]));
	// Larger towns first: a slug two towns of a county share goes to the larger one.
	const towns = [...sources.towns].sort(
		(a, b) => (b.population ?? 0) - (a.population ?? 0) || a.code.localeCompare(b.code),
	);
	const communes: PlaceRow[] = [];
	for (const town of towns) {
		const fact = factsByCode.get(town.code);
		const county = fact ? IE_COUNTIES[fact.countyCode] : undefined;
		if (!fact || !county) continue;
		const name = townName(town.name);
		communes.push(
			row(
				"commune",
				town.code,
				name,
				localSlug(town.code, name, fact.countyCode),
				fact.countyCode,
				county.province,
				{ kind: "department", code: fact.countyCode },
				fact,
				town.population,
			),
		);
	}
	communes.sort((a, b) => a.code.localeCompare(b.code));
	return [...rows, ...communes];
}

/** A town's other names: the gazetteer's inside it and the documented ones, not its own name. */
export function townAliases(name: string, gazetteer: readonly string[], code: string): string[] {
	const own = townKey(townName(name));
	const manual = IE_MANUAL_ALIASES.filter((entry) => entry.code === code).flatMap(
		(entry) => entry.aliases,
	);
	const seen = new Set<string>([own]);
	const aliases: string[] = [];
	for (const alias of [...gazetteer, ...manual]) {
		const key = townKey(alias);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		aliases.push(alias);
	}
	return aliases;
}

/**
 * Writes the counties' and towns' boundaries and the towns' other names to
 * `directory.place_lookup` (only rows whose content changed).
 */
async function writeIeLookup(sql: Sql, sources: IePlaceSources, facts: readonly IeTownFacts[]) {
	const aliases = JSON.stringify(
		sources.towns.map((town) => ({
			code: town.code,
			aliases: townAliases(
				town.name,
				facts.find((fact) => fact.code === town.code)?.aliases ?? [],
				town.code,
			),
		})),
	);
	return sql.begin(async (tx) => {
		await loadAreas(tx, sources);
		const written = await tx`
			WITH src AS (
				SELECT p.id AS place_id, a.area, '{}'::text[] AS aliases
				FROM ie_county_areas a
				JOIN directory.places p ON p.country = 'IE' AND p.kind = 'department' AND p.code = a.code
				UNION ALL
				SELECT p.id, a.area, coalesce(n.aliases, '{}')
				FROM ie_town_areas a
				JOIN directory.places p ON p.country = 'IE' AND p.kind = 'commune' AND p.code = a.code
				LEFT JOIN jsonb_to_recordset(${aliases}::text::jsonb) AS n (code text, aliases text[])
					ON n.code = a.code
			)
			INSERT INTO directory.place_lookup AS l (place_id, country, area, aliases, source_hash, updated_at)
			SELECT place_id, 'IE', area, aliases,
				md5(ST_AsEWKB(area)::text || '|' || array_to_string(aliases, '|')), now()
			FROM src
			ON CONFLICT (place_id) DO UPDATE SET
				area = excluded.area,
				aliases = excluded.aliases,
				source_hash = excluded.source_hash,
				updated_at = now()
			WHERE l.source_hash IS DISTINCT FROM excluded.source_hash
		`;
		const [counts] = await tx<{ areas: number; aliases: number }[]>`
			SELECT count(*)::integer AS areas, coalesce(sum(cardinality(aliases)), 0)::integer AS aliases
			FROM directory.place_lookup WHERE country = 'IE'
		`;
		return { written: written.count, areas: counts?.areas ?? 0, aliases: counts?.aliases ?? 0 };
	});
}

/** Upserts Ireland's places (country `IE`) and their lookup rows; no other market's are read or touched. */
export async function importIePlaces(
	sql: Sql,
	sources: IePlaceSources,
	runId: number,
): Promise<PlacesStats & { lookup: { written: number; areas: number; aliases: number } }> {
	const facts = await computeIeTowns(sql, sources);
	let communes = 0;
	const stats = await writePlaces(
		sql,
		"IE",
		(existing) => {
			const rows = buildIePlaceRows(sources, facts, existing);
			communes = rows.filter((row) => row.kind === "commune").length;
			return rows;
		},
		runId,
		{ regions: Object.keys(IE_PROVINCES).length, communes: 0, arrondissements: 0 },
	);
	const lookup = await writeIeLookup(sql, sources, facts);
	return { ...stats, communes, lookup };
}
