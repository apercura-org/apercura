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
import { type ExistingPlace, type PlaceRow, type PlacesStats, writePlaces } from "../../lib/places";

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

export type { ExistingPlace, PlaceRow, PlacesStats } from "../../lib/places";

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

/** Upserts the French places (see `writePlaces`). */
export async function importPlaces(
	sql: Sql,
	sources: PlaceSources,
	runId: number,
): Promise<PlacesStats> {
	return writePlaces(sql, "FR", (existing) => buildPlaceRows(sources, existing), runId, {
		regions: sources.regions.length,
		communes: sources.communes.length,
		arrondissements: sources.arrondissements.length,
	});
}
