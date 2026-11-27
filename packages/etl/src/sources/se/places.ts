/**
 * Sweden's places, from Statistics Sweden's digital boundaries (SCB, "Digitala gränser", CC0
 * 1.0): one ZIP of ZIPs, each a shapefile in SWEREF 99 TM (EPSG:3006) with its attributes in
 * Windows-1252:
 * - `Kommun_Sweref99TM` (`KnKod`, `KnNamn`): the 290 municipalities (kommuner), the communes;
 * - `LanSweref99TM` (`LnKod`, `LnNamn`): the 21 counties (län), the departments, named from
 *   `SE_COUNTIES` (`Stockholms län`), whose codes must match.
 *
 * Two levels, as in Norway: a municipality's county is the first two digits of its code. Gotland
 * is a county of one municipality (`0980`), whose page is the county's (the web app's rule). Each
 * municipality's point is a point on its surface (a centroid falls outside an archipelago or a
 * concave municipality), computed in PostGIS after the boundaries are transformed to WGS 84; the
 * boundaries are kept in `directory.place_lookup`, where `etl:se` places the health centres by
 * their point. The boundaries are SCB's simplified ones, "adapted for statistics": a point on a
 * shore may fall just outside them, which `etl:se` allows for. Run once, then when a municipality
 * changes (`etl:places --country se`).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { slugify } from "@apercura/core";
import { SE_COUNTIES } from "@apercura/core/country";
import type { Sql, TransactionSql } from "../../lib/db";
import { downloadFile, USER_AGENT } from "../../lib/files";
import { type ExistingPlace, type PlaceRow, type PlacesStats, writePlaces } from "../../lib/places";
import { readDbf, readShpPolygons, type ShpRing } from "../../lib/shapefile";
import { readZipEntries } from "../../lib/zip";
import { cleanText } from "./text";

/** SCB's page linking the current boundaries (overridden by `ETL_SE_PLACES_PAGE_URL`). */
export const SE_PLACES_PAGE_URL =
	"https://www.scb.se/hitta-statistik/regional-statistik-och-kartor/regionala-indelningar/digitala-granser/";
/** The boundaries the page linked on 27 November 2026, when the page names none. */
export const DEFAULT_SE_PLACES_URL =
	"https://www.scb.se/contentassets/3443fea3fa6640f7a57ea15d9a372d33/shape_svenska_260225.zip";
/** The boundaries' file in `--source-dir` and the work directory. */
export const SE_PLACES_FILE = "scb-granser.zip";

/** The real file holds 290 municipalities; fewer than this means a broken or partial file. */
const MIN_REAL_MUNICIPALITIES = 280;

export type SeArea = { code: string; name: string; rings: ShpRing[] };

export type SePlaceSources = { counties: SeArea[]; municipalities: SeArea[] };

/** The shapefile in one of the outer archive's archives (`Kommun_Sweref99TM.zip`). */
function readShapefile(
	outer: Buffer,
	pattern: RegExp,
	codeField: string,
	nameField: string,
	what: string,
): SeArea[] {
	const [archive] = readZipEntries(outer, (name) => pattern.test(name));
	if (!archive) throw new Error(`boundaries: no ${what} archive`);
	const files = readZipEntries(archive.data, (name) => /\.(?:dbf|shp)$/i.test(name));
	const dbf = files.find((file) => /\.dbf$/i.test(file.name));
	const shp = files.find((file) => /\.shp$/i.test(file.name));
	if (!dbf || !shp) throw new Error(`boundaries: the ${what} archive has no .dbf or .shp`);
	const table = readDbf(dbf.data, { encoding: "windows-1252" });
	const shapes = readShpPolygons(shp.data);
	if (shapes.length !== table.records.length) {
		throw new Error(
			`boundaries: ${what}: ${shapes.length} shapes, ${table.records.length} records`,
		);
	}
	const areas: SeArea[] = [];
	const seen = new Set<string>();
	table.records.forEach((record, index) => {
		const code = cleanText(record[codeField]);
		const name = cleanText(record[nameField]);
		const rings = shapes[index];
		if (!code || !name) throw new Error(`boundaries: ${what}: a record without code or name`);
		if (!rings) throw new Error(`boundaries: ${what} ${code} has no boundary`);
		if (seen.has(code)) throw new Error(`boundaries: ${what} ${code} twice`);
		seen.add(code);
		areas.push({ code, name, rings });
	});
	return areas;
}

/**
 * Reads SCB's archive. Throws unless every county code is one of `SE_COUNTIES`, every
 * municipality code four digits of a known county, and at least `minMunicipalities` are there.
 */
export function parseScbBoundaries(
	archive: Buffer,
	{ minMunicipalities = MIN_REAL_MUNICIPALITIES }: { minMunicipalities?: number } = {},
): SePlaceSources {
	const counties = readShapefile(archive, /^Lan.*\.zip$/i, "LnKod", "LnNamn", "county");
	const municipalities = readShapefile(
		archive,
		/^Kommun.*\.zip$/i,
		"KnKod",
		"KnNamn",
		"municipality",
	);
	for (const county of counties) {
		if (!SE_COUNTIES[county.code]) throw new Error(`boundaries: unknown county ${county.code}`);
	}
	for (const municipality of municipalities) {
		if (!/^\d{4}$/.test(municipality.code) || !SE_COUNTIES[municipality.code.slice(0, 2)]) {
			throw new Error(`boundaries: unknown municipality code ${municipality.code}`);
		}
	}
	if (municipalities.length < minMunicipalities) {
		throw new Error(
			`boundaries: ${municipalities.length} municipalities, at least ${minMunicipalities} expected`,
		);
	}
	return { counties, municipalities };
}

/** The current boundaries' link on SCB's page (`…/shape_svenska_260225.zip`), absolute, or null. */
export function scbShapeLink(html: string, base: string = SE_PLACES_PAGE_URL): string | null {
	const href = /href="([^"]*shape_svenska_[^"]*\.zip)"/i.exec(html)?.[1];
	return href ? new URL(href.replace(/&amp;/g, "&"), base).toString() : null;
}

/** Reads the boundaries from `--source-dir` (`scb-granser.zip`). */
export async function readSePlaceSources(dir: string): Promise<SePlaceSources> {
	return parseScbBoundaries(await readFile(join(dir, SE_PLACES_FILE)), { minMunicipalities: 1 });
}

/**
 * Downloads the boundaries to `dir` and reads them: `url` when given, else the archive SCB's
 * page links today, else the one it linked on 27 November 2026.
 */
export async function fetchSePlaceSources(
	dir: string,
	{ url, pageUrl = SE_PLACES_PAGE_URL }: { url?: string; pageUrl?: string } = {},
): Promise<SePlaceSources> {
	let link = url || null;
	if (!link) {
		try {
			const response = await fetch(pageUrl, {
				headers: { "user-agent": USER_AGENT },
				signal: AbortSignal.timeout(30_000),
			});
			if (response.ok) link = scbShapeLink(await response.text(), pageUrl);
		} catch {
			// The page is a convenience: the known archive is read instead.
		}
	}
	const file = await downloadFile({
		key: "se-places",
		url: link ?? DEFAULT_SE_PLACES_URL,
		path: join(dir, SE_PLACES_FILE),
		text: false,
	});
	if (file.bytes < 50_000) throw new Error(`boundaries: ${file.bytes} bytes`);
	return parseScbBoundaries(await readFile(file.path));
}

/** Boundaries as a JSON array for `jsonb_to_recordset`: each a multilinestring of its rings. */
const areasJson = (areas: readonly SeArea[]) =>
	JSON.stringify(
		areas.map((area) => ({
			code: area.code,
			geometry: {
				type: "MultiLineString",
				coordinates: area.rings.map((ring) =>
					ring.map((point) => [Math.round(point.x * 10) / 10, Math.round(point.y * 10) / 10]),
				),
			},
		})),
	);

/**
 * Loads the boundaries into temporary tables of the transaction: the rings built into areas
 * (holes by nesting), transformed from SWEREF 99 TM to WGS 84, made valid multipolygons.
 */
async function loadAreas(tx: TransactionSql, sources: SePlaceSources) {
	for (const [table, areas] of [
		["se_county_areas", sources.counties],
		["se_municipality_areas", sources.municipalities],
	] as const) {
		await tx.unsafe(
			`CREATE TEMP TABLE ${table} (code text PRIMARY KEY, area geometry) ON COMMIT DROP`,
		);
		await tx.unsafe(
			`INSERT INTO ${table} (code, area)
			SELECT r.code, ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_Transform(
				ST_BuildArea(ST_SetSRID(ST_GeomFromGeoJSON(r.geometry::text), 3006)), 4326)), 3))
			FROM jsonb_to_recordset($1::text::jsonb) AS r (code text, geometry jsonb)`,
			[areasJson(areas)],
		);
		const [empty] = await tx.unsafe<{ codes: string[] | null }[]>(
			`SELECT array_agg(code ORDER BY code) AS codes FROM ${table} WHERE area IS NULL OR ST_IsEmpty(area)`,
		);
		if (empty?.codes?.length) {
			throw new Error(`boundaries: no area built for ${empty.codes.join(", ")}`);
		}
		await tx.unsafe(`CREATE INDEX ON ${table} USING gist (area)`);
		await tx.unsafe(`ANALYZE ${table}`);
	}
}

export type SeMunicipalityPoint = { code: string; longitude: number; latitude: number };

/** Each municipality's point on its surface, in WGS 84, computed in PostGIS. */
export async function computeSePoints(
	sql: Sql,
	sources: SePlaceSources,
): Promise<SeMunicipalityPoint[]> {
	return sql.begin(async (tx) => {
		await loadAreas(tx, sources);
		return tx<SeMunicipalityPoint[]>`
			SELECT code, ST_X(ST_PointOnSurface(area)) AS longitude, ST_Y(ST_PointOnSurface(area)) AS latitude
			FROM se_municipality_areas ORDER BY code
		`;
	});
}

/**
 * The place rows of Sweden: the 21 counties (all of `SE_COUNTIES`, named `Stockholms län`, slug
 * `stockholms-lan`) and the municipalities of the boundaries (`Upplands Väsby`, slug
 * `upplands-vasby`, unique within its county). Existing slugs are kept; a renamed place gets a
 * new slug and keeps the old one as an alias, as in the other markets.
 */
export function buildSePlaceRows(
	sources: SePlaceSources,
	points: readonly SeMunicipalityPoint[],
	existing: ExistingPlace[],
): PlaceRow[] {
	const existingByKey = new Map(existing.map((place) => [`${place.kind}:${place.code}`, place]));
	const keep = (kind: PlaceRow["kind"], code: string, name: string, fresh: () => string) => {
		const known = existingByKey.get(`${kind}:${code}`);
		if (known && known.name === name) return { slug: known.slug, previous: null };
		const slug = fresh();
		return { slug, previous: known && known.slug !== slug ? known.slug : null };
	};
	const taken = new Map<string, Set<string>>();
	for (const place of existing) {
		const scope = place.kind === "department" ? "" : (place.departmentCode ?? "");
		const set = taken.get(scope) ?? new Set<string>();
		set.add(place.slug);
		taken.set(scope, set);
	}
	const unique = (scope: string, base: string, code: string) => {
		const set = taken.get(scope) ?? new Set<string>();
		taken.set(scope, set);
		const slug = set.has(base) ? `${base}-${code}` : base;
		set.add(slug);
		return slug;
	};
	const base = { region_code: null, population: null, postcodes: [] as string[] };
	const rows: PlaceRow[] = [];
	for (const [code, name] of Object.entries(SE_COUNTIES).sort(([a], [b]) => a.localeCompare(b))) {
		const { slug, previous } = keep("department", code, name, () =>
			unique("", slugify(name) || code, code),
		);
		rows.push({
			...base,
			kind: "department",
			code,
			name,
			slug,
			department_code: code,
			parent_kind: null,
			parent_code: null,
			longitude: null,
			latitude: null,
			previous_slug: previous,
		});
	}
	const pointOf = new Map(points.map((point) => [point.code, point]));
	for (const municipality of [...sources.municipalities].sort((a, b) =>
		a.code.localeCompare(b.code),
	)) {
		const county = municipality.code.slice(0, 2);
		const { slug, previous } = keep("commune", municipality.code, municipality.name, () =>
			unique(county, slugify(municipality.name) || municipality.code, municipality.code),
		);
		const point = pointOf.get(municipality.code);
		rows.push({
			...base,
			kind: "commune",
			code: municipality.code,
			name: municipality.name,
			slug,
			department_code: county,
			parent_kind: "department",
			parent_code: county,
			longitude: point?.longitude ?? null,
			latitude: point?.latitude ?? null,
			previous_slug: previous,
		});
	}
	return rows;
}

/**
 * Writes the counties' and municipalities' boundaries to `directory.place_lookup` (only rows
 * whose content changed); the municipalities' names are their own, no other names are kept.
 */
async function writeSeLookup(sql: Sql, sources: SePlaceSources) {
	return sql.begin(async (tx) => {
		await loadAreas(tx, sources);
		const written = await tx`
			WITH src AS (
				SELECT p.id AS place_id, a.area
				FROM se_county_areas a
				JOIN directory.places p ON p.country = 'SE' AND p.kind = 'department' AND p.code = a.code
				UNION ALL
				SELECT p.id, a.area
				FROM se_municipality_areas a
				JOIN directory.places p ON p.country = 'SE' AND p.kind = 'commune' AND p.code = a.code
			)
			INSERT INTO directory.place_lookup AS l (place_id, country, area, aliases, source_hash, updated_at)
			SELECT place_id, 'SE', area, '{}'::text[], md5(ST_AsEWKB(area)::text), now()
			FROM src
			ON CONFLICT (place_id) DO UPDATE SET
				area = excluded.area,
				aliases = excluded.aliases,
				source_hash = excluded.source_hash,
				updated_at = now()
			WHERE l.source_hash IS DISTINCT FROM excluded.source_hash
		`;
		const [counts] = await tx<{ areas: number }[]>`
			SELECT count(*)::integer AS areas FROM directory.place_lookup WHERE country = 'SE'
		`;
		return { written: written.count, areas: counts?.areas ?? 0 };
	});
}

/** Upserts Sweden's places (country `SE`) and their boundaries; no other market's are read or touched. */
export async function importSePlaces(
	sql: Sql,
	sources: SePlaceSources,
	runId: number,
): Promise<PlacesStats & { located: number; lookup: { written: number; areas: number } }> {
	const points = await computeSePoints(sql, sources);
	const stats = await writePlaces(
		sql,
		"SE",
		(existing) => buildSePlaceRows(sources, points, existing),
		runId,
		{ regions: 0, communes: sources.municipalities.length, arrondissements: 0 },
	);
	const lookup = await writeSeLookup(sql, sources);
	return { ...stats, located: points.length, lookup };
}
