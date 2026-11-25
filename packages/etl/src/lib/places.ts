/**
 * Writing the places of a market (France, Austria) into `directory.places`.
 */
import type { Sql } from "./db";

export type PlaceRow = {
	kind: "region" | "department" | "commune" | "arrondissement";
	code: string;
	name: string;
	slug: string;
	department_code: string | null;
	region_code: string | null;
	parent_kind: string | null;
	parent_code: string | null;
	longitude: number | null;
	latitude: number | null;
	population: number | null;
	postcodes: string[];
	previous_slug: string | null;
};

export type ExistingPlace = {
	kind: string;
	code: string;
	name: string;
	slug: string;
	departmentCode: string | null;
};

export type PlacesStats = {
	regions: number;
	departments: number;
	communes: number;
	arrondissements: number;
	inserted: number;
	updated: number;
	removed: number;
	aliases: number;
};

/**
 * Upserts the places of one market set-based (one statement over a JSON array)
 * and links parents. `build` turns the market's current places into the rows
 * to write (existing slugs are kept, a renamed place keeps its old slug as an
 * alias). Only rows of `country` are read, written or removed: a market's
 * places import never touches another market's.
 */
export async function writePlaces(
	sql: Sql,
	country: string,
	build: (existing: ExistingPlace[]) => PlaceRow[],
	runId: number,
	counts: { regions: number; communes: number; arrondissements: number },
): Promise<PlacesStats> {
	return sql.begin(async (tx) => {
		const existing = await tx<ExistingPlace[]>`
			SELECT kind, code, name, slug, department_code AS "departmentCode" FROM directory.places
			WHERE country = ${country}
		`;
		const rows = build([...existing]);
		const json = JSON.stringify(rows);

		await tx`
			CREATE TEMP TABLE import_places ON COMMIT DROP AS
			SELECT r.*, md5(concat_ws('|', r.name, r.slug, r.department_code, r.region_code, r.parent_kind,
				r.parent_code, r.longitude, r.latitude, r.population, array_to_string(r.postcodes, ','))) AS source_hash
			FROM jsonb_to_recordset(${json}::text::jsonb) AS r (
				kind text, code text, name text, slug text, department_code text, region_code text,
				parent_kind text, parent_code text, longitude double precision, latitude double precision,
				population integer, postcodes text[], previous_slug text
			)
		`;

		const aliases = await tx`
			INSERT INTO directory.place_slug_aliases (place_id, country, department_code, slug)
			SELECT p.id, p.country, CASE WHEN p.kind IN ('commune', 'arrondissement') THEN p.department_code END,
				r.previous_slug
			FROM import_places r
			JOIN directory.places p ON p.country = ${country} AND p.kind = r.kind AND p.code = r.code
			WHERE r.previous_slug IS NOT NULL
			ON CONFLICT DO NOTHING
		`;

		const upserted = await tx<{ id: number; inserted: boolean }[]>`
			INSERT INTO directory.places AS p (
				country, kind, code, name, slug, department_code, region_code, centroid, population,
				postcodes, source_hash, removed_at, updated_at
			)
			SELECT ${country}, r.kind, r.code, r.name, r.slug, r.department_code, r.region_code,
				CASE WHEN r.longitude IS NULL THEN NULL
					ELSE ST_SetSRID(ST_MakePoint(r.longitude, r.latitude), 4326)::geography END,
				r.population, coalesce(r.postcodes, '{}'), r.source_hash, NULL, now()
			FROM import_places r
			ON CONFLICT (country, kind, code) DO UPDATE SET
				name = excluded.name,
				slug = excluded.slug,
				department_code = excluded.department_code,
				region_code = excluded.region_code,
				centroid = excluded.centroid,
				population = excluded.population,
				postcodes = excluded.postcodes,
				source_hash = excluded.source_hash,
				removed_at = NULL,
				updated_at = now()
			WHERE p.source_hash IS DISTINCT FROM excluded.source_hash OR p.removed_at IS NOT NULL
			RETURNING p.id, (xmax = 0) AS inserted
		`;

		await tx`
			UPDATE directory.places p SET parent_id = parent.id
			FROM import_places r
			JOIN directory.places parent ON parent.country = ${country} AND parent.kind = r.parent_kind
				AND parent.code = r.parent_code
			WHERE p.country = ${country} AND p.kind = r.kind AND p.code = r.code
				AND p.parent_id IS DISTINCT FROM parent.id
		`;

		// Departments and regions: centroid of their communes, summed population.
		await tx`
			WITH agg AS (
				SELECT d.id,
					ST_Centroid(ST_Collect(c.centroid::geometry))::geography AS centroid,
					sum(c.population)::integer AS population
				FROM directory.places d
				JOIN directory.places c ON c.country = d.country AND c.kind = 'commune'
					AND c.department_code = d.code AND c.removed_at IS NULL
				WHERE d.country = ${country} AND d.kind = 'department'
				GROUP BY d.id
			)
			UPDATE directory.places d SET centroid = agg.centroid, population = agg.population
			FROM agg
			WHERE d.id = agg.id AND (d.population IS DISTINCT FROM agg.population OR d.centroid IS NULL)
		`;
		await tx`
			WITH agg AS (
				SELECT r.id,
					ST_Centroid(ST_Collect(c.centroid::geometry))::geography AS centroid,
					sum(c.population)::integer AS population
				FROM directory.places r
				JOIN directory.places c ON c.country = r.country AND c.kind = 'commune'
					AND c.region_code = r.code AND c.removed_at IS NULL
				WHERE r.country = ${country} AND r.kind = 'region'
				GROUP BY r.id
			)
			UPDATE directory.places r SET centroid = agg.centroid, population = agg.population
			FROM agg
			WHERE r.id = agg.id AND (r.population IS DISTINCT FROM agg.population OR r.centroid IS NULL)
		`;

		const removed = await tx<{ id: number }[]>`
			UPDATE directory.places p SET removed_at = now(), updated_at = now()
			WHERE p.country = ${country} AND p.removed_at IS NULL
				AND NOT EXISTS (SELECT 1 FROM import_places r WHERE r.kind = p.kind AND r.code = p.code)
			RETURNING p.id
		`;

		const changedIds = [...upserted.map((row) => row.id), ...removed.map((row) => row.id)];
		if (changedIds.length > 0) {
			await tx`
				SELECT directory.enqueue_tags(${runId}, array_agg('place:' || id))
				FROM unnest(${changedIds}::integer[]) AS id
			`;
		}

		return {
			regions: counts.regions,
			departments: rows.filter((row) => row.kind === "department").length,
			communes: counts.communes,
			arrondissements: counts.arrondissements,
			inserted: upserted.filter((row) => row.inserted).length,
			updated: upserted.filter((row) => !row.inserted).length,
			removed: removed.length,
			aliases: aliases.count,
		};
	});
}
