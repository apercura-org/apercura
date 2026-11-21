/**
 * Places import (geo.api.gouv.fr): regions, departments, communes and the
 * municipal arrondissements of Paris, Lyon and Marseille.
 *
 * Slugs are stored once: a department is `{code}-{name}`, a commune or
 * arrondissement its name, unique within the department (`-{insee}` suffix on a
 * collision). A rename keeps the old slug as an alias (308). A commune missing
 * from the source is marked removed, never deleted.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { communeSlug, departmentSlug, regionSlug } from "@apercura/core";
import { SOURCE_DIR_FILES } from "../../config";
import type { Sql } from "../../lib/db";
import { fetchJson } from "../../lib/files";

type GeoPoint = { type: "Point"; coordinates: [number, number] };

export type GeoCommune = {
	nom: string;
	code: string;
	codesPostaux?: string[];
	centre?: GeoPoint | null;
	codeDepartement?: string | null;
	codeRegion?: string | null;
	population?: number | null;
};

export type GeoDepartment = { nom: string; code: string; codeRegion?: string | null };
export type GeoRegion = { nom: string; code: string };

export type PlaceSources = {
	regions: GeoRegion[];
	departements: GeoDepartment[];
	communes: GeoCommune[];
	arrondissements: GeoCommune[];
};

/**
 * Overseas collectivities have communes in the COG but no entry in the
 * `/departements` endpoint.
 */
const OVERSEAS_COLLECTIVITIES: Readonly<Record<string, string>> = {
	"975": "Saint-Pierre-et-Miquelon",
	"977": "Saint-Barthélemy",
	"978": "Saint-Martin",
	"984": "Terres australes et antarctiques françaises",
	"986": "Wallis-et-Futuna",
	"987": "Polynésie française",
	"988": "Nouvelle-Calédonie",
	"989": "Île de Clipperton",
};

/** The three cities split into municipal arrondissements, by department. */
const ARRONDISSEMENT_PARENTS: Readonly<Record<string, string>> = {
	"75": "75056",
	"69": "69123",
	"13": "13055",
};

const COMMUNE_FIELDS = "nom,code,codesPostaux,centre,codeDepartement,codeRegion,population";

export async function fetchPlaceSources(geoApiUrl: string): Promise<PlaceSources> {
	const base = geoApiUrl.replace(/\/$/, "");
	const [regions, departements, communes, arrondissements] = await Promise.all([
		fetchJson<GeoRegion[]>(`${base}/regions?fields=nom,code`),
		fetchJson<GeoDepartment[]>(`${base}/departements?fields=nom,code,codeRegion`),
		fetchJson<GeoCommune[]>(
			`${base}/communes?fields=${COMMUNE_FIELDS}&format=json&geometry=centre`,
		),
		fetchJson<GeoCommune[]>(
			`${base}/communes?type=arrondissement-municipal&fields=${COMMUNE_FIELDS}&format=json&geometry=centre`,
		),
	]);
	return { regions, departements, communes, arrondissements };
}

export async function readPlaceSources(dir: string): Promise<PlaceSources> {
	const read = async <T>(name: string) => JSON.parse(await readFile(join(dir, name), "utf8")) as T;
	return {
		regions: await read(SOURCE_DIR_FILES.regions),
		departements: await read(SOURCE_DIR_FILES.departements),
		communes: await read(SOURCE_DIR_FILES.communes),
		arrondissements: await read(SOURCE_DIR_FILES.arrondissements),
	};
}

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

/**
 * Builds the place rows to upsert. Existing slugs are kept; a renamed place
 * gets a new slug and keeps the old one as an alias (`previous_slug`).
 */
export function buildPlaceRows(sources: PlaceSources, existing: ExistingPlace[]): PlaceRow[] {
	const existingByKey = new Map(existing.map((place) => [`${place.kind}:${place.code}`, place]));
	const takenLocal = new Map<string, Set<string>>();
	const takenTop = new Set<string>();
	for (const place of existing) {
		if (place.kind === "region" || place.kind === "department") takenTop.add(place.slug);
		else {
			const set = takenLocal.get(place.departmentCode ?? "") ?? new Set<string>();
			set.add(place.slug);
			takenLocal.set(place.departmentCode ?? "", set);
		}
	}

	const rows: PlaceRow[] = [];
	const keep = (
		kind: PlaceRow["kind"],
		code: string,
		name: string,
		fresh: () => string,
	): { slug: string; previous: string | null } => {
		const known = existingByKey.get(`${kind}:${code}`);
		if (known && known.name === name) return { slug: known.slug, previous: null };
		const slug = fresh();
		if (known && known.slug !== slug) return { slug, previous: known.slug };
		return { slug, previous: null };
	};

	for (const region of sources.regions) {
		const { slug, previous } = keep("region", region.code, region.nom, () => {
			const candidate = regionSlug(region.nom);
			return takenTop.has(candidate) ? `${candidate}-${region.code.toLowerCase()}` : candidate;
		});
		takenTop.add(slug);
		rows.push(placeRow("region", region.code, region.nom, slug, null, null, null, null, previous));
	}

	const departments = [...sources.departements];
	const knownDepartments = new Set(departments.map((department) => department.code));
	const communeDepartments = new Set(
		sources.communes.map((commune) => commune.codeDepartement).filter(Boolean) as string[],
	);
	for (const code of [...communeDepartments].sort()) {
		if (!knownDepartments.has(code) && OVERSEAS_COLLECTIVITIES[code]) {
			departments.push({ code, nom: OVERSEAS_COLLECTIVITIES[code] ?? code, codeRegion: null });
		}
	}
	for (const department of departments) {
		const { slug, previous } = keep("department", department.code, department.nom, () =>
			departmentSlug(department.code, department.nom),
		);
		takenTop.add(slug);
		rows.push(
			placeRow(
				"department",
				department.code,
				department.nom,
				slug,
				department.code,
				department.codeRegion ?? null,
				department.codeRegion ? "region" : null,
				department.codeRegion ?? null,
				previous,
			),
		);
	}

	const local = (kind: "commune" | "arrondissement", commune: GeoCommune) => {
		const departmentCode = commune.codeDepartement ?? null;
		const taken = takenLocal.get(departmentCode ?? "") ?? new Set<string>();
		takenLocal.set(departmentCode ?? "", taken);
		const { slug, previous } = keep(kind, commune.code, commune.nom, () =>
			communeSlug(commune.nom, commune.code, taken),
		);
		taken.add(slug);
		const parentCode =
			kind === "arrondissement"
				? (ARRONDISSEMENT_PARENTS[departmentCode ?? ""] ?? null)
				: departmentCode;
		const row = placeRow(
			kind,
			commune.code,
			commune.nom,
			slug,
			departmentCode,
			commune.codeRegion ?? null,
			parentCode ? (kind === "arrondissement" ? "commune" : "department") : null,
			parentCode,
			previous,
		);
		const [longitude, latitude] = commune.centre?.coordinates ?? [null, null];
		row.longitude = longitude;
		row.latitude = latitude;
		row.population = commune.population ?? null;
		row.postcodes = [...new Set(commune.codesPostaux ?? [])].sort();
		rows.push(row);
	};
	// Communes first so a commune keeps the plain slug over an arrondissement.
	for (const commune of [...sources.communes].sort((a, b) => a.code.localeCompare(b.code))) {
		local("commune", commune);
	}
	for (const arrondissement of [...sources.arrondissements].sort((a, b) =>
		a.code.localeCompare(b.code),
	)) {
		local("arrondissement", arrondissement);
	}
	return rows;
}

function placeRow(
	kind: PlaceRow["kind"],
	code: string,
	name: string,
	slug: string,
	departmentCode: string | null,
	regionCode: string | null,
	parentKind: string | null,
	parentCode: string | null,
	previousSlug: string | null,
): PlaceRow {
	return {
		kind,
		code,
		name,
		slug,
		department_code: departmentCode,
		region_code: regionCode,
		parent_kind: parentKind,
		parent_code: parentCode,
		longitude: null,
		latitude: null,
		population: null,
		postcodes: [],
		previous_slug: previousSlug,
	};
}

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

/** Upserts places set-based (one statement over a JSON array) and links parents. */
export async function importPlaces(
	sql: Sql,
	sources: PlaceSources,
	runId: number,
): Promise<PlacesStats> {
	return sql.begin(async (tx) => {
		const existing = await tx<ExistingPlace[]>`
			SELECT kind, code, name, slug, department_code AS "departmentCode" FROM directory.places
		`;
		const rows = buildPlaceRows(sources, [...existing]);
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
			INSERT INTO directory.place_slug_aliases (place_id, department_code, slug)
			SELECT p.id, CASE WHEN p.kind IN ('commune', 'arrondissement') THEN p.department_code END,
				r.previous_slug
			FROM import_places r
			JOIN directory.places p ON p.kind = r.kind AND p.code = r.code
			WHERE r.previous_slug IS NOT NULL
			ON CONFLICT DO NOTHING
		`;

		const upserted = await tx<{ id: number; inserted: boolean }[]>`
			INSERT INTO directory.places AS p (
				kind, code, name, slug, department_code, region_code, centroid, population, postcodes,
				source_hash, removed_at, updated_at
			)
			SELECT r.kind, r.code, r.name, r.slug, r.department_code, r.region_code,
				CASE WHEN r.longitude IS NULL THEN NULL
					ELSE ST_SetSRID(ST_MakePoint(r.longitude, r.latitude), 4326)::geography END,
				r.population, coalesce(r.postcodes, '{}'), r.source_hash, NULL, now()
			FROM import_places r
			ON CONFLICT (kind, code) DO UPDATE SET
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
			JOIN directory.places parent ON parent.kind = r.parent_kind AND parent.code = r.parent_code
			WHERE p.kind = r.kind AND p.code = r.code AND p.parent_id IS DISTINCT FROM parent.id
		`;

		// Departments and regions: centroid of their communes, summed population.
		await tx`
			WITH agg AS (
				SELECT d.id,
					ST_Centroid(ST_Collect(c.centroid::geometry))::geography AS centroid,
					sum(c.population)::integer AS population
				FROM directory.places d
				JOIN directory.places c ON c.kind = 'commune' AND c.department_code = d.code
					AND c.removed_at IS NULL
				WHERE d.kind = 'department'
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
				JOIN directory.places c ON c.kind = 'commune' AND c.region_code = r.code
					AND c.removed_at IS NULL
				WHERE r.kind = 'region'
				GROUP BY r.id
			)
			UPDATE directory.places r SET centroid = agg.centroid, population = agg.population
			FROM agg
			WHERE r.id = agg.id AND (r.population IS DISTINCT FROM agg.population OR r.centroid IS NULL)
		`;

		const removed = await tx<{ id: number }[]>`
			UPDATE directory.places p SET removed_at = now(), updated_at = now()
			WHERE p.removed_at IS NULL
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
			regions: sources.regions.length,
			departments: rows.filter((row) => row.kind === "department").length,
			communes: sources.communes.length,
			arrondissements: sources.arrondissements.length,
			inserted: upserted.filter((row) => row.inserted).length,
			updated: upserted.filter((row) => !row.inserted).length,
			removed: removed.length,
			aliases: aliases.count,
		};
	});
}
