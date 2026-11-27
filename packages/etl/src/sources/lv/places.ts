/**
 * Latvian places from the State Land Service's open data of the address register (Valsts zemes
 * dienests, "Valsts adrešu reģistra atvērtie dati", data.gov.lv, CC BY 4.0, updated daily): the
 * municipalities (novadi, `aw_novads.csv`), towns (pilsētas, `aw_pilseta.csv`) and parishes
 * (pagasti, `aw_pagasts.csv`), each with its address-register code, the code of the territory
 * above it, its ATVK code (the Central Statistical Bureau's classification, `ATRIB`) and its
 * standard name (`STD`: `Ādažu pag., Ādažu nov.`), and the places' centroids
 * (`aw_vietu_centroidi.csv`, WGS 84).
 *
 * Mapped onto the four kinds of `directory.places`, keyed by ATVK code:
 * - the five statistical regions (NUTS 3, `LV00A` Rīga…) are regions, grouping only
 *   (`LV_DEPARTMENT_REGIONS` in `@apercura/core/country`);
 * - the seven state cities (valstspilsētas, `0001000` Rīga) and the 35 municipalities of the 2021
 *   reform (`0054000` Valmieras novads) are departments;
 * - every town and parish of a municipality is a commune of it (`0054010` Valmiera, `0054…`
 *   Kocēnu pagasts); a state city is a department and a commune at once, under the same code: like
 *   Paris, its city page is its department's (`apps/web/src/lib/places.ts`).
 * Villages (ciemi) are not places of their own: a site in one is placed in its parish, and the
 * village is kept in its address.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { slugify } from "@apercura/core";
import { LV_DEPARTMENT_REGIONS, LV_REGIONS } from "@apercura/core/country";
import type { Sql, TransactionSql } from "../../lib/db";
import { downloadFile, fetchJson } from "../../lib/files";
import { type ExistingPlace, type PlaceRow, type PlacesStats, writePlaces } from "../../lib/places";
import { parseQuotedRecord } from "../../lib/text";
import { clean, shortTerritoryName, territoryKey } from "./names";

/** The address register's files the places are read from, by their name in `--source-dir`. */
export const LV_PLACE_FILES = {
	municipalities: "aw_novads.csv",
	towns: "aw_pilseta.csv",
	parishes: "aw_pagasts.csv",
	centroids: "aw_vietu_centroidi.csv",
} as const;

type PlaceFileId = keyof typeof LV_PLACE_FILES;

/** The data.gov.lv dataset of the address register's open data (`ETL_LV_PLACES_DATASET`). */
export const LV_PLACES_DATASET = "varis-atvertie-dati";

/** Latvia's extent, with a margin. */
const BOUNDS = { minLat: 55.6, maxLat: 58.1, minLng: 20.9, maxLng: 28.3 };

/** The address register's object type codes (its technical specification, annex 1). */
const TYPE = { country: "101", town: "104", parish: "105", municipality: "113" } as const;

export type LvUnit = {
	/** ATVK code. */
	code: string;
	name: string;
	/** The address register's code of the unit. */
	varCode: string;
	longitude: number | null;
	latitude: number | null;
};

export type LvPlaceSources = {
	/** State cities and municipalities, with their statistical region. */
	departments: (LvUnit & { region: string; stateCity: boolean })[];
	/** Towns and parishes of the municipalities, with their municipality's ATVK code. */
	communes: (LvUnit & { department: string; kind: "town" | "parish" })[];
};

type VarRecord = { [column: string]: string };

/** Reads one of the register's CSV files (UTF-8, a BOM, quoted fields) into records by column. */
export function readVarCsv(text: string): VarRecord[] {
	const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
	const header = parseQuotedRecord(lines[0] ?? "", ",") ?? [];
	const records: VarRecord[] = [];
	let pending: string | null = null;
	for (const line of lines.slice(1)) {
		const input: string = pending === null ? line : `${pending}\n${line}`;
		if (!input.trim()) continue;
		const fields = parseQuotedRecord(input, ",");
		if (fields === null) {
			pending = input;
			continue;
		}
		pending = null;
		const record: VarRecord = {};
		header.forEach((column, index) => {
			record[column.trim()] = fields[index] ?? "";
		});
		records.push(record);
	}
	return records;
}

const coordinate = (value: string | undefined) => {
	const number = Number(clean(value).replace(",", "."));
	return clean(value) !== "" && Number.isFinite(number) ? number : null;
};

/**
 * Reads the register's files into departments and communes. Throws when they hold none (another
 * file, a changed format), or when a state city or municipality has no statistical region in
 * `LV_DEPARTMENT_REGIONS` (a territorial reform the code must learn, never a guess).
 */
export function parseLvPlaces(files: Readonly<Partial<Record<PlaceFileId, string>>>) {
	const existing = (records: VarRecord[]) => records.filter((record) => record.STATUSS === "EKS");
	const municipalities = existing(readVarCsv(files.municipalities ?? ""));
	const towns = existing(readVarCsv(files.towns ?? ""));
	const parishes = existing(readVarCsv(files.parishes ?? ""));
	const centroids = new Map<string, { longitude: number; latitude: number }>();
	for (const record of readVarCsv(files.centroids ?? "")) {
		const latitude = coordinate(record.DD_N);
		const longitude = coordinate(record.DD_E);
		if (
			latitude === null ||
			longitude === null ||
			latitude < BOUNDS.minLat ||
			latitude > BOUNDS.maxLat ||
			longitude < BOUNDS.minLng ||
			longitude > BOUNDS.maxLng
		) {
			continue;
		}
		centroids.set(clean(record.KODS), { longitude, latitude });
	}
	const unit = (record: VarRecord, name: string): LvUnit => {
		const varCode = clean(record.KODS);
		const point = centroids.get(varCode);
		return {
			code: clean(record.ATRIB),
			name,
			varCode,
			longitude: point?.longitude ?? null,
			latitude: point?.latitude ?? null,
		};
	};
	const sources: LvPlaceSources = { departments: [], communes: [] };
	const departmentOfVar = new Map<string, string>();
	const addDepartment = (record: VarRecord, name: string, stateCity: boolean) => {
		const department = unit(record, name);
		if (!/^\d{7}$/.test(department.code)) return;
		const region = LV_DEPARTMENT_REGIONS[department.code];
		if (!region) {
			throw new Error(
				`${name} (${department.code}) has no statistical region: add it to LV_DEPARTMENT_REGIONS`,
			);
		}
		departmentOfVar.set(department.varCode, department.code);
		sources.departments.push({ ...department, region, stateCity });
	};
	for (const record of municipalities) {
		if (record.TIPS_CD === TYPE.municipality && record.VKUR_TIPS === TYPE.country) {
			addDepartment(record, clean(record.SORT_NOS) || clean(record.NOSAUKUMS), false);
		}
	}
	for (const record of towns) {
		if (record.VKUR_TIPS === TYPE.country) addDepartment(record, clean(record.NOSAUKUMS), true);
	}
	const addCommune = (record: VarRecord, name: string, kind: "town" | "parish") => {
		const department = departmentOfVar.get(clean(record.VKUR_CD));
		const commune = unit(record, name);
		if (!department || !/^\d{7}$/.test(commune.code)) return;
		sources.communes.push({ ...commune, department, kind });
	};
	for (const record of towns) {
		if (record.VKUR_TIPS === TYPE.municipality) addCommune(record, clean(record.NOSAUKUMS), "town");
	}
	for (const record of parishes) {
		if (record.VKUR_TIPS === TYPE.municipality) {
			addCommune(record, clean(record.SORT_NOS) || clean(record.NOSAUKUMS), "parish");
		}
	}
	const cities = sources.departments.filter((department) => department.stateCity).length;
	if (sources.departments.length - cities === 0 || cities === 0 || sources.communes.length === 0) {
		throw new Error(
			`not the address register's territories: ${cities} state cities, ${sources.departments.length - cities} municipalities, ${sources.communes.length} towns and parishes`,
		);
	}
	return sources;
}

/**
 * The place rows of Latvia. Existing slugs are kept; a renamed place gets a new slug and keeps
 * the old one as an alias, as in the other markets. Departments and regions share one slug space,
 * departments first (their pages are listings); a commune's slug is unique within its department
 * (`-{code}` on a collision). A state city's commune has its department's code and slug.
 */
export function buildLvPlaceRows(sources: LvPlaceSources, existing: ExistingPlace[]): PlaceRow[] {
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
			const base = slugify(name) || code.toLowerCase();
			const slug = topTaken.has(base) ? `${base}-${code.toLowerCase()}` : base;
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
	const base = {
		parent_kind: null,
		parent_code: null,
		longitude: null,
		latitude: null,
		population: null,
		postcodes: [] as string[],
	};
	const rows: PlaceRow[] = [];
	const departments = [...sources.departments].sort((a, b) => a.code.localeCompare(b.code));
	for (const department of departments) {
		const { slug, previous } = topSlug("department", department.code, department.name);
		rows.push({
			...base,
			kind: "department",
			code: department.code,
			name: department.name,
			slug,
			department_code: department.code,
			region_code: department.region,
			parent_kind: "region",
			parent_code: department.region,
			longitude: department.longitude,
			latitude: department.latitude,
			previous_slug: previous,
		});
	}
	for (const [code, name] of Object.entries(LV_REGIONS).sort(([a], [b]) => a.localeCompare(b))) {
		const { slug, previous } = topSlug("region", code, name);
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
	const communes = [
		...departments
			.filter((department) => department.stateCity)
			.map((department) => ({ ...department, department: department.code })),
		...[...sources.communes].sort((a, b) => a.code.localeCompare(b.code)),
	];
	for (const commune of communes) {
		const { slug, previous } = localSlug(commune.code, commune.name, commune.department);
		rows.push({
			...base,
			kind: "commune",
			code: commune.code,
			name: commune.name,
			slug,
			department_code: commune.department,
			region_code: LV_DEPARTMENT_REGIONS[commune.department] ?? null,
			parent_kind: "department",
			parent_code: commune.department,
			longitude: commune.longitude,
			latitude: commune.latitude,
			previous_slug: previous,
		});
	}
	return rows;
}

/** Upserts Latvia's places (country `LV`); no other market's are read or touched. */
export async function importLvPlaces(
	sql: Sql,
	sources: LvPlaceSources,
	runId: number,
): Promise<PlacesStats & { located: number }> {
	let communes = 0;
	const stats = await writePlaces(
		sql,
		"LV",
		(existing) => {
			const rows = buildLvPlaceRows(sources, existing);
			communes = rows.filter((row) => row.kind === "commune").length;
			return rows;
		},
		runId,
		{ regions: Object.keys(LV_REGIONS).length, communes: 0, arrondissements: 0 },
	);
	return {
		...stats,
		communes,
		located: sources.communes.filter((commune) => commune.longitude !== null).length,
	};
}

// ---------------------------------------------------------------------------
// Placing a site
// ---------------------------------------------------------------------------

export type LvCommune = {
	id: number;
	code: string;
	name: string;
	departmentCode: string;
	longitude: number | null;
	latitude: number | null;
};

export type LvPlaceIndex = {
	/** Communes by the register's standard name (`Sigulda, Siguldas nov.`, `Rīga`), as keys. */
	byStandardName: Map<string, LvCommune>;
	/** Departments by their standard name (`Siguldas nov.`, `Rīga`), as keys. */
	departmentsByName: Map<string, { id: number; code: string }>;
	communes: LvCommune[];
};

/**
 * The register's standard names of a commune, as the lists write them: a town with its
 * municipality (`Sigulda, Siguldas nov.`), a parish with it (`Mores pag., Siguldas nov.`), a state
 * city alone (`Rīga`).
 */
export function standardNames(
	commune: Pick<LvCommune, "code" | "name" | "departmentCode">,
	departmentName: string,
): string[] {
	if (commune.code === commune.departmentCode) return [territoryKey(commune.name)];
	return [
		territoryKey(`${shortTerritoryName(commune.name)}, ${shortTerritoryName(departmentName)}`),
	];
}

/** Builds the index of Latvia's towns, parishes and state cities the sites are placed with. */
export async function loadLvPlaceIndex(sql: Sql | TransactionSql): Promise<LvPlaceIndex> {
	const communes = await sql<LvCommune[]>`
		SELECT id, code, name, department_code AS "departmentCode",
			ST_X(centroid::geometry) AS longitude, ST_Y(centroid::geometry) AS latitude
		FROM directory.places
		WHERE country = 'LV' AND kind = 'commune' AND removed_at IS NULL
	`;
	const departments = await sql<{ id: number; code: string; name: string }[]>`
		SELECT id, code, name FROM directory.places
		WHERE country = 'LV' AND kind = 'department' AND removed_at IS NULL
	`;
	return buildLvPlaceIndex(communes, departments);
}

export function buildLvPlaceIndex(
	communes: readonly LvCommune[],
	departments: readonly { id: number; code: string; name: string }[],
): LvPlaceIndex {
	const departmentName = new Map(
		departments.map((department) => [department.code, department.name]),
	);
	const byStandardName = new Map<string, LvCommune>();
	for (const commune of communes) {
		for (const name of standardNames(commune, departmentName.get(commune.departmentCode) ?? "")) {
			byStandardName.set(name, commune);
		}
	}
	return {
		byStandardName,
		departmentsByName: new Map(
			departments.map((department) => [
				territoryKey(shortTerritoryName(department.name)),
				{ id: department.id, code: department.code },
			]),
		),
		communes: [...communes],
	};
}

/** Distance in kilometres between two points (equirectangular: fine at Latvia's scale). */
function distanceKm(
	a: { longitude: number; latitude: number },
	b: { longitude: number | null; latitude: number | null },
): number {
	if (b.longitude === null || b.latitude === null) return Number.POSITIVE_INFINITY;
	const x =
		(b.longitude - a.longitude) * Math.cos(((a.latitude + b.latitude) * Math.PI) / 360) * 111.32;
	const y = (b.latitude - a.latitude) * 110.57;
	return Math.hypot(x, y);
}

/** A site's point is matched to a commune's centroid at most this far, when its names do not place it. */
export const NEAREST_MAX_KM = 15;

export type Placement = {
	placeId: number | null;
	placedBy: "name" | "nearest" | "department" | null;
};

/**
 * Places a site by its locality (the part of its address after the street, postcode dropped:
 * `Ance, Ances pag., Ventspils nov.`, `Sigulda, Siguldas nov.`, `Rīga`):
 * 1. the commune whose standard name is the locality's longest ending (a village's parish, a
 *    town, a state city);
 * 2. else the commune whose centroid is nearest the site's point, within 15 km, in the
 *    municipality the locality names when it names one;
 * 3. else the municipality the locality names.
 */
export function placeSite(
	site: { locality: string; point: { longitude: number; latitude: number } | null },
	index: LvPlaceIndex,
): Placement {
	const parts = clean(site.locality)
		.replace(/,?\s*LV\s*-?\s*\d{4}\s*$/i, "")
		.split(",")
		.map((part) => clean(part))
		.filter(Boolean);
	for (let start = 0; start < parts.length; start++) {
		const commune = index.byStandardName.get(territoryKey(parts.slice(start).join(", ")));
		if (commune) return { placeId: commune.id, placedBy: "name" };
	}
	const department =
		parts.length > 0 ? index.departmentsByName.get(territoryKey(parts.at(-1) ?? "")) : undefined;
	const point = site.point;
	if (point) {
		const candidates = department
			? index.communes.filter((commune) => commune.departmentCode === department.code)
			: index.communes;
		const nearest = [...candidates].sort((a, b) => distanceKm(point, a) - distanceKm(point, b))[0];
		if (nearest && distanceKm(point, nearest) <= NEAREST_MAX_KM) {
			return { placeId: nearest.id, placedBy: "nearest" };
		}
	}
	if (department) return { placeId: department.id, placedBy: "department" };
	return { placeId: null, placedBy: null };
}

/** Reads the register's files from `--source-dir`. */
export async function readLvPlaceSources(dir: string): Promise<LvPlaceSources> {
	const files: Partial<Record<PlaceFileId, string>> = {};
	for (const [id, name] of Object.entries(LV_PLACE_FILES) as [PlaceFileId, string][]) {
		files[id] = await readFile(join(dir, name), "utf8");
	}
	return parseLvPlaces(files);
}

type Package = {
	result?: { license_id?: string; resources?: { name?: string; url?: string }[] };
};

/**
 * The address register's files, from its data.gov.lv dataset (CKAN `package_show`): each file's
 * current address is read from the dataset, which must still be under CC BY 4.0.
 */
export async function lvPlaceUrls(
	portalUrl: string,
	dataset = LV_PLACES_DATASET,
): Promise<Record<PlaceFileId, string>> {
	const body = await fetchJson<Package>(
		`${portalUrl.replace(/\/+$/, "")}/api/3/action/package_show?id=${dataset}`,
	);
	if (body.result?.license_id !== "CC-BY-4.0") {
		throw new Error(
			`${dataset} is not under CC BY 4.0 (${body.result?.license_id ?? "no licence"})`,
		);
	}
	const urls = {} as Record<PlaceFileId, string>;
	for (const [id, name] of Object.entries(LV_PLACE_FILES) as [PlaceFileId, string][]) {
		const resource = body.result.resources?.find((candidate) =>
			candidate.url?.endsWith(`/${name}`),
		);
		if (!resource?.url) throw new Error(`${dataset} has no ${name}`);
		urls[id] = resource.url;
	}
	return urls;
}

/** Downloads the register's four files (about 1 MB) to `dir` and reads them. */
export async function fetchLvPlaceSources(portalUrl: string, dir: string): Promise<LvPlaceSources> {
	const urls = await lvPlaceUrls(portalUrl);
	const files: Partial<Record<PlaceFileId, string>> = {};
	for (const [id, url] of Object.entries(urls) as [PlaceFileId, string][]) {
		const file = await downloadFile({
			key: `places-${id}`,
			url,
			path: join(dir, LV_PLACE_FILES[id]),
			text: true,
		});
		files[id] = await readFile(file.path, "utf8");
	}
	return parseLvPlaces(files);
}
