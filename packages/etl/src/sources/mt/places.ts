/**
 * Malta's places: the 68 localities (local councils) of the Planning Authority's "Local Councils
 * Units and Boundaries" (INSPIRE administrative units, CC BY 4.0 on data.gov.mt, its service's
 * metadata: "no conditions to access and use"), read as GeoJSON in WGS 84 from its WFS, each
 * keyed by the National Statistics Office's code of the locality (`nationalCode` `MT01402`).
 *
 * Mapped onto the kinds of `directory.places`, with the names of `MT_LOCALITIES` (the NSO's
 * English names, the Address Registrar's Maltese ones):
 * - the two NUTS 3 regions, Malta and Gozo and Comino, are regions (`01`, `02`), with no listing
 *   of their own;
 * - the NSO's six districts are departments (`011` Southern Harbour District … `026` Gozo and
 *   Comino District), with listings;
 * - the 68 localities are communes of their district (`01101` Valletta), each at a point on its
 *   surface computed in PostGIS (a centroid falls in the sea for some harbour localities).
 * Each locality's boundary and other names (its Maltese name, the parts and English names
 * `MT_LOCALITIES` lists) are kept in `directory.place_lookup`, where `etl:mt` places a pharmacy
 * by its point. Run once, then when the councils' boundaries change (`etl:places --country mt`).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { slugify } from "@apercura/core";
import {
	MT_DISTRICTS,
	MT_LOCALITIES,
	MT_REGIONS,
	mtDistrictOf,
	mtRegionOf,
} from "@apercura/core/country";
import type { Sql, TransactionSql } from "../../lib/db";
import { downloadFile } from "../../lib/files";
import { type ExistingPlace, type PlaceRow, type PlacesStats, writePlaces } from "../../lib/places";

/** The Planning Authority's WFS, its local councils as GeoJSON in WGS 84 (`ETL_MT_PLACES_URL`). */
export const DEFAULT_MT_PLACES_URL =
	"https://haleconnect.com/ows/services/org.1261.27899a9f-4361-4e9c-a73e-148512500919_wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=au:AdministrativeUnit&NAMESPACES=xmlns(au,http://inspire.ec.europa.eu/schemas/au/4.0)&OUTPUTFORMAT=application/geo%2Bjson&SRSNAME=EPSG:4326";

/** The file in `--source-dir`. */
export const MT_PLACES_FILE = "mt-local-councils.geojson";

export type MtLocalityArea = { code: string; geometry: unknown };

type Feature = { geometry?: unknown; properties?: Record<string, unknown> | null };

const isArea = (geometry: unknown) =>
	typeof geometry === "object" &&
	geometry !== null &&
	["Polygon", "MultiPolygon"].includes((geometry as { type?: string }).type ?? "");

/**
 * The localities' boundaries. Throws unless they are exactly the 68 localities of
 * `MT_LOCALITIES`, each with an area.
 */
export function parseMtPlaces(raw: string): MtLocalityArea[] {
	let parsed: { type?: string; features?: unknown };
	try {
		parsed = JSON.parse(raw) as typeof parsed;
	} catch {
		throw new Error("local councils: not JSON");
	}
	if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
		throw new Error("local councils: not a GeoJSON feature collection");
	}
	const areas: MtLocalityArea[] = [];
	const seen = new Set<string>();
	for (const feature of parsed.features as Feature[]) {
		const national = String(feature.properties?.nationalCode ?? "").trim();
		const code = /^MT(\d{5})$/.exec(national)?.[1] ?? "";
		if (!MT_LOCALITIES[code]) throw new Error(`local councils: unknown code "${national}"`);
		if (!isArea(feature.geometry)) throw new Error(`local councils: ${code} has no boundary`);
		if (seen.has(code)) throw new Error(`local councils: ${code} twice`);
		seen.add(code);
		areas.push({ code, geometry: feature.geometry });
	}
	const missing = Object.keys(MT_LOCALITIES).filter((code) => !seen.has(code));
	if (missing.length > 0) throw new Error(`local councils: missing ${missing.join(", ")}`);
	return areas;
}

/** Reads the boundaries from `--source-dir`. */
export async function readMtPlaceSources(dir: string): Promise<MtLocalityArea[]> {
	return parseMtPlaces(await readFile(join(dir, MT_PLACES_FILE), "utf8"));
}

/** Downloads the boundaries (about 4.6 MB) to `dir` and reads them. */
export async function fetchMtPlaceSources(url: string, dir: string): Promise<MtLocalityArea[]> {
	const file = await downloadFile({
		key: "mt-local-councils",
		url,
		path: join(dir, MT_PLACES_FILE),
		text: true,
	});
	if (file.bytes < 10_000) throw new Error(`local councils: ${file.bytes} bytes`);
	return readMtPlaceSources(dir);
}

/** A department's place name: `Northern Harbour District`. */
export const districtPlaceName = (code: string) => `${MT_DISTRICTS[code] ?? code} District`;

/** Loads the boundaries into a temporary table of the transaction (valid multipolygons, WGS 84). */
async function loadAreas(tx: TransactionSql, areas: readonly MtLocalityArea[]) {
	await tx.unsafe(
		"CREATE TEMP TABLE mt_locality_areas (code text PRIMARY KEY, area geometry) ON COMMIT DROP",
	);
	await tx.unsafe(
		`INSERT INTO mt_locality_areas (code, area)
		SELECT r.code, ST_Multi(ST_CollectionExtract(ST_MakeValid(
			ST_SetSRID(ST_GeomFromGeoJSON(r.geometry::text), 4326)), 3))
		FROM jsonb_to_recordset($1::text::jsonb) AS r (code text, geometry jsonb)`,
		[JSON.stringify(areas.map((area) => ({ code: area.code, geometry: area.geometry })))],
	);
	await tx.unsafe("ANALYZE mt_locality_areas");
}

export type MtLocalityPoint = { code: string; longitude: number; latitude: number };

/** Each locality's point on its surface, computed in PostGIS. */
export async function computeMtPoints(
	sql: Sql,
	areas: readonly MtLocalityArea[],
): Promise<MtLocalityPoint[]> {
	return sql.begin(async (tx) => {
		await loadAreas(tx, areas);
		return tx<MtLocalityPoint[]>`
			SELECT code, ST_X(ST_PointOnSurface(area)) AS longitude, ST_Y(ST_PointOnSurface(area)) AS latitude
			FROM mt_locality_areas ORDER BY code
		`;
	});
}

/**
 * The place rows of Malta. Existing slugs are kept; a renamed place gets a new slug and keeps the
 * old one as an alias, as in the other markets. Departments and regions share one slug space,
 * departments first (their pages are listings: the region "Gozo and Comino" takes `-02`); a
 * locality's slug is unique within its district (`-{code}` on a collision).
 */
export function buildMtPlaceRows(
	points: readonly MtLocalityPoint[],
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
			const slug = topTaken.has(base) ? `${base}-${code}` : base;
			topTaken.add(slug);
			return slug;
		});
	const localSlug = (code: string, name: string, district: string) =>
		keep("commune", code, name, () => {
			const set = localTaken.get(district) ?? new Set<string>();
			localTaken.set(district, set);
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
	const rows: PlaceRow[] = [];
	for (const code of Object.keys(MT_DISTRICTS).sort()) {
		const name = districtPlaceName(code);
		const { slug, previous } = topSlug(
			"department",
			code,
			name,
			slugify(MT_DISTRICTS[code] ?? code),
		);
		const region = mtRegionOf(code);
		rows.push({
			...base,
			kind: "department",
			code,
			name,
			slug,
			department_code: code,
			region_code: region,
			parent_kind: "region",
			parent_code: region,
			previous_slug: previous,
		});
	}
	for (const code of Object.keys(MT_REGIONS).sort()) {
		const name = MT_REGIONS[code] ?? code;
		const { slug, previous } = topSlug("region", code, name, slugify(name));
		rows.push({
			...base,
			kind: "region",
			code,
			name,
			slug,
			department_code: null,
			region_code: code,
			previous_slug: previous,
		});
	}
	for (const point of [...points].sort((a, b) => a.code.localeCompare(b.code))) {
		const locality = MT_LOCALITIES[point.code];
		if (!locality) continue;
		const district = mtDistrictOf(point.code);
		const { slug, previous } = localSlug(point.code, locality.name, district);
		rows.push({
			...base,
			kind: "commune",
			code: point.code,
			name: locality.name,
			slug,
			department_code: district,
			region_code: mtRegionOf(point.code),
			parent_kind: "department",
			parent_code: district,
			longitude: Math.round(point.longitude * 1e6) / 1e6,
			latitude: Math.round(point.latitude * 1e6) / 1e6,
			previous_slug: previous,
		});
	}
	return rows;
}

/** A locality's other names: its Maltese name and those `MT_LOCALITIES` lists, not its own name. */
export function localityAliases(code: string): string[] {
	const locality = MT_LOCALITIES[code];
	if (!locality) return [];
	const names = [locality.maltese, ...(locality.other ?? [])].filter(
		(name) => name !== locality.name,
	);
	return [...new Set(names)];
}

/** Writes the localities' boundaries and other names to `directory.place_lookup` (changed rows only). */
async function writeMtLookup(sql: Sql, areas: readonly MtLocalityArea[]) {
	const aliases = JSON.stringify(
		areas.map((area) => ({ code: area.code, aliases: localityAliases(area.code) })),
	);
	return sql.begin(async (tx) => {
		await loadAreas(tx, areas);
		const written = await tx`
			WITH src AS (
				SELECT p.id AS place_id, a.area, coalesce(n.aliases, '{}') AS aliases
				FROM mt_locality_areas a
				JOIN directory.places p ON p.country = 'MT' AND p.kind = 'commune' AND p.code = a.code
				LEFT JOIN jsonb_to_recordset(${aliases}::text::jsonb) AS n (code text, aliases text[])
					ON n.code = a.code
			)
			INSERT INTO directory.place_lookup AS l (place_id, country, area, aliases, source_hash, updated_at)
			SELECT place_id, 'MT', area, aliases,
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
			FROM directory.place_lookup WHERE country = 'MT'
		`;
		return { written: written.count, areas: counts?.areas ?? 0, aliases: counts?.aliases ?? 0 };
	});
}

/** Upserts Malta's places (country `MT`) and their lookup rows; no other market's are read or touched. */
export async function importMtPlaces(
	sql: Sql,
	areas: readonly MtLocalityArea[],
	runId: number,
): Promise<PlacesStats & { lookup: { written: number; areas: number; aliases: number } }> {
	const points = await computeMtPoints(sql, areas);
	const stats = await writePlaces(
		sql,
		"MT",
		(existing) => buildMtPlaceRows(points, existing),
		runId,
		{ regions: Object.keys(MT_REGIONS).length, communes: points.length, arrondissements: 0 },
	);
	const lookup = await writeMtLookup(sql, areas);
	return { ...stats, lookup };
}

// ---------------------------------------------------------------------------
// Placing a pharmacy
// ---------------------------------------------------------------------------

export type MtLocalityPlace = { id: number; code: string; name: string; districtCode: string };

/** Malta's localities by their NSO code. */
export type MtPlaceIndex = Map<string, MtLocalityPlace>;

/** Builds the index of Malta's localities the pharmacies are placed in. */
export async function loadMtPlaceIndex(sql: Sql | TransactionSql): Promise<MtPlaceIndex> {
	const rows = await sql<MtLocalityPlace[]>`
		SELECT id, code, name, department_code AS "districtCode" FROM directory.places
		WHERE country = 'MT' AND kind = 'commune' AND removed_at IS NULL
	`;
	return new Map(rows.map((row) => [row.code, row]));
}

/** How far outside every boundary a point may be and still be placed in the nearest (a quay). */
export const MT_NEARBY_METRES = 200;

export type MtPointPlace = { code: string; inside: boolean };

/**
 * The locality whose stored boundary holds each point (`directory.place_lookup`), else the
 * nearest within `MT_NEARBY_METRES`, by the point's key. A point near no boundary is absent.
 */
export async function locateMtPoints(
	sql: Sql | TransactionSql,
	points: readonly { key: string; longitude: number; latitude: number }[],
): Promise<Map<string, MtPointPlace>> {
	const found = new Map<string, MtPointPlace>();
	if (points.length === 0) return found;
	const rows = await sql<{ key: string; code: string | null; inside: boolean }[]>`
		WITH pts AS (
			SELECT r.key, ST_SetSRID(ST_MakePoint(r.longitude, r.latitude), 4326) AS point
			FROM jsonb_to_recordset(${JSON.stringify(points)}::text::jsonb)
				AS r (key text, longitude double precision, latitude double precision)
		)
		SELECT pts.key, near.code, near.inside
		FROM pts
		LEFT JOIN LATERAL (
			SELECT p.code, ST_Intersects(l.area, pts.point) AS inside
			FROM directory.place_lookup l
			JOIN directory.places p ON p.id = l.place_id AND p.kind = 'commune' AND p.removed_at IS NULL
			-- Degrees first (the boundaries' index: 0.003° is over 270 m in Malta), then metres.
			WHERE l.country = 'MT' AND l.area IS NOT NULL AND ST_DWithin(l.area, pts.point, 0.003)
				AND ST_DWithin(l.area::geography, pts.point::geography, ${MT_NEARBY_METRES})
			ORDER BY ST_Intersects(l.area, pts.point) DESC,
				ST_Distance(l.area::geography, pts.point::geography), p.code
			LIMIT 1
		) near ON true
	`;
	for (const row of rows) {
		if (row.code) found.set(row.key, { code: row.code, inside: row.inside });
	}
	return found;
}
