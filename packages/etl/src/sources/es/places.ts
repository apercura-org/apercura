/**
 * Spanish places from the IGN (Instituto Geográfico Nacional, CNIG), under CC BY 4.0 (Orden
 * FOM/2807/2015: "Obra derivada de <producto> <fecha> CC-BY 4.0 ign.es"), read from the IGN's
 * OGC API Features (https://api-features.ign.es):
 * - `administrativeunit` (Líneas Límite Municipales, INSPIRE administrative units): every
 *   autonomous community, province and municipality with its name and `nationalcode`
 *   (`34` + community + province + INE municipality code: `34132828079` is Madrid);
 * - `nuc` (IGR Poblaciones, the INE's population centres): every population centre with its
 *   INE code (municipality code first), population, point and whether it is the municipality's
 *   capital.
 *
 * The register publishes no coordinates, so a municipality is located at its capital population
 * centre (else its most populous one), and a centre at its municipality's point: city precision.
 * Boundaries are not read.
 *
 * Mapped onto the four kinds of `directory.places`:
 * - the 17 autonomous communities and Ceuta and Melilla are regions (INE code `01`–`19`), with no
 *   listing of their own;
 * - the 52 provinces are departments (INE code `01`–`52`);
 * - every municipality is a commune of its province (INE code, five digits, `28079`).
 * The IGN's shared territories (condominios, province `53`) and the territories outside any
 * community are left out: no centre is registered there.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { slugify } from "@apercura/core";
import { ES_COMMUNITIES, ES_PROVINCE_COMMUNITIES } from "@apercura/core/country";
import type { Sql } from "../../lib/db";
import { fetchJson } from "../../lib/files";
import { type ExistingPlace, type PlaceRow, type PlacesStats, writePlaces } from "../../lib/places";

/** File names in `--source-dir`: one GeoJSON FeatureCollection per collection, geometry optional. */
export const ES_PLACES_FILES = {
	units: "ign-unidades-administrativas.json",
	centres: "ign-nucleos.json",
} as const;

/** The IGN's OGC API Features. */
export const DEFAULT_ES_PLACES_BASE = "https://api-features.ign.es";

/** First page of a collection's items, as JSON without geometry (the points are properties). */
export function esPlacesUrl(base: string, collection: "administrativeunit" | "nuc"): string {
	return `${base.replace(/\/+$/, "")}/collections/${collection}/items?f=json&limit=10000&skipGeometry=true`;
}

/** Spain's extent with the Canary Islands, Ceuta and Melilla, with a margin. */
const BOUNDS = { minLat: 27.4, maxLat: 44.0, minLng: -18.3, maxLng: 4.5 };

export type EsUnit = { code: string; name: string };

export type EsPlaceSources = {
	communities: EsUnit[];
	/** Provinces, with their community. */
	provinces: (EsUnit & { community: string })[];
	/** Municipalities, with their province and community, point and population when known. */
	municipalities: (EsUnit & {
		province: string;
		community: string;
		longitude: number | null;
		latitude: number | null;
		/** Where the point comes from: the capital population centre, the most populous one, none. */
		pointFrom: "capital" | "largest" | null;
		population: number | null;
	})[];
};

type Feature = { properties?: Record<string, unknown> | null };
type Collection = { features?: Feature[]; links?: { rel?: string; href?: string }[] };

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const num = (value: unknown) =>
	typeof value === "number" && Number.isFinite(value)
		? value
		: typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))
			? Number(value)
			: null;

/**
 * Reads the administrative units and population centres into communities, provinces and
 * municipalities. Throws when either holds none (another file, a changed format).
 */
export function parseEsPlaces(units: Collection, centres: Collection): EsPlaceSources {
	const communities: EsPlaceSources["communities"] = [];
	const provinces: EsPlaceSources["provinces"] = [];
	const municipalities = new Map<string, EsPlaceSources["municipalities"][number]>();
	for (const feature of units.features ?? []) {
		const properties = feature.properties ?? {};
		const code = str(properties.nationalcode);
		const name = str(properties.nameunit);
		const level = str(properties.nationallevel);
		const levelName = str(properties.nationallevelname);
		if (!/^34\d{9}$/.test(code) || !name) continue;
		const community = code.slice(2, 4);
		const province = code.slice(4, 6);
		if (level.endsWith("/2ndOrder") && ES_COMMUNITIES[community]) {
			communities.push({ code: community, name });
		} else if (level.endsWith("/3rdOrder") && ES_PROVINCE_COMMUNITIES[province] === community) {
			provinces.push({ code: province, name, community });
		} else if (
			level.endsWith("/4thOrder") &&
			levelName === "Municipio" &&
			ES_PROVINCE_COMMUNITIES[province] === community
		) {
			const municipality = code.slice(6, 11);
			if (municipality.startsWith(province)) {
				municipalities.set(municipality, {
					code: municipality,
					name,
					province,
					community,
					longitude: null,
					latitude: null,
					pointFrom: null,
					population: null,
				});
			}
		}
	}
	// The population centres: the capital's point, else the most populous centre's.
	type Best = { capital: boolean; population: number; longitude: number; latitude: number };
	const best = new Map<string, Best>();
	const population = new Map<string, number>();
	for (const feature of centres.features ?? []) {
		const properties = feature.properties ?? {};
		const code = str(properties.codine);
		if (!/^\d{11}$/.test(code)) continue;
		const municipality = code.slice(0, 5);
		if (!municipalities.has(municipality)) continue;
		const inhabitants = num(properties.habitantes) ?? 0;
		population.set(municipality, (population.get(municipality) ?? 0) + inhabitants);
		const longitude = num(properties.longitud);
		const latitude = num(properties.latitud);
		if (
			longitude === null ||
			latitude === null ||
			latitude < BOUNDS.minLat ||
			latitude > BOUNDS.maxLat ||
			longitude < BOUNDS.minLng ||
			longitude > BOUNDS.maxLng
		) {
			continue;
		}
		// `capital`: six flags (state, community, province, …, municipality at the fourth).
		const capital = str(properties.capital).charAt(3) === "1";
		const current = best.get(municipality);
		const better =
			!current ||
			(capital && !current.capital) ||
			(capital === current.capital && inhabitants > current.population);
		if (better) best.set(municipality, { capital, population: inhabitants, longitude, latitude });
	}
	for (const [code, municipality] of municipalities) {
		const point = best.get(code);
		if (point) {
			municipality.longitude = point.longitude;
			municipality.latitude = point.latitude;
			municipality.pointFrom = point.capital ? "capital" : "largest";
		}
		municipality.population = population.has(code) ? (population.get(code) ?? null) : null;
	}
	if (communities.length === 0 || provinces.length === 0 || municipalities.size === 0) {
		throw new Error(
			`not the IGN's administrative units: ${communities.length} communities, ${provinces.length} provinces, ${municipalities.size} municipalities`,
		);
	}
	if (best.size === 0) throw new Error("not the IGN's population centres: no point read");
	return { communities, provinces, municipalities: [...municipalities.values()] };
}

/** Reads both collections from `--source-dir`. */
export async function readEsPlaceSources(dir: string): Promise<EsPlaceSources> {
	const read = async (name: string) =>
		JSON.parse(await readFile(join(dir, name), "utf8")) as Collection;
	return parseEsPlaces(await read(ES_PLACES_FILES.units), await read(ES_PLACES_FILES.centres));
}

/** Every page of a collection, following the `next` links (at most `maxPages`). */
async function fetchCollection(firstUrl: string, maxPages = 20): Promise<Collection> {
	const features: Feature[] = [];
	let url: string | undefined = firstUrl;
	for (let page = 0; url && page < maxPages; page++) {
		const body: Collection = await fetchJson<Collection>(url);
		features.push(...(body.features ?? []));
		url = body.links?.find((link) => link.rel === "next")?.href;
	}
	if (url) throw new Error(`${firstUrl}: more than ${maxPages} pages`);
	return { features };
}

/** Downloads both collections from the IGN's API (about 4 MB and 26 MB of JSON). */
export async function fetchEsPlaceSources(base: string): Promise<EsPlaceSources> {
	const units = await fetchCollection(esPlacesUrl(base, "administrativeunit"));
	const centres = await fetchCollection(esPlacesUrl(base, "nuc"));
	return parseEsPlaces(units, centres);
}

/**
 * A place's slug: its name's, a bilingual name's two forms once when they read the same
 * (`València/Valencia` → `valencia`, `Alacant/Alicante` → `alacant-alicante`).
 */
export function esPlaceSlug(name: string): string {
	const parts = name
		.split("/")
		.map((part) => slugify(part))
		.filter(Boolean);
	return [...new Set(parts)].join("-");
}

/**
 * The place rows of Spain. Existing slugs are kept; a renamed place gets a new slug and keeps
 * the old one as an alias, as in the other markets. Provinces and communities share one slug
 * space, provinces first (their pages are listings: `Cantabria` the province is `cantabria`,
 * the community `cantabria-06`); a municipality's slug is unique within its province
 * (`-{code}` on a collision).
 */
export function buildEsPlaceRows(sources: EsPlaceSources, existing: ExistingPlace[]): PlaceRow[] {
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
			const base = esPlaceSlug(name) || code;
			const slug = topTaken.has(base) ? `${base}-${code}` : base;
			topTaken.add(slug);
			return slug;
		});
	const localSlug = (code: string, name: string, province: string) =>
		keep("commune", code, name, () => {
			const set = localTaken.get(province) ?? new Set<string>();
			localTaken.set(province, set);
			const base = esPlaceSlug(name) || code;
			const slug = set.has(base) ? `${base}-${code}` : base;
			set.add(slug);
			return slug;
		});
	const row = (
		kind: PlaceRow["kind"],
		code: string,
		name: string,
		slug: string,
		departmentCode: string | null,
		regionCode: string,
		parent: { kind: string; code: string } | null,
		previous: string | null,
		point: { longitude: number | null; latitude: number | null } | null,
		population: number | null,
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
		population,
		postcodes: [],
		previous_slug: previous,
	});

	const rows: PlaceRow[] = [];
	const provinces = [...sources.provinces].sort((a, b) => a.code.localeCompare(b.code));
	for (const province of provinces) {
		const { slug, previous } = topSlug("department", province.code, province.name);
		rows.push(
			row(
				"department",
				province.code,
				province.name,
				slug,
				province.code,
				province.community,
				{ kind: "region", code: province.community },
				previous,
				null,
				null,
			),
		);
	}
	for (const community of [...sources.communities].sort((a, b) => a.code.localeCompare(b.code))) {
		const { slug, previous } = topSlug("region", community.code, community.name);
		rows.push(
			row(
				"region",
				community.code,
				community.name,
				slug,
				null,
				community.code,
				null,
				previous,
				null,
				null,
			),
		);
	}
	const known = new Set(provinces.map((province) => province.code));
	for (const municipality of [...sources.municipalities].sort((a, b) =>
		a.code.localeCompare(b.code),
	)) {
		if (!known.has(municipality.province)) continue;
		const { slug, previous } = localSlug(
			municipality.code,
			municipality.name,
			municipality.province,
		);
		rows.push(
			row(
				"commune",
				municipality.code,
				municipality.name,
				slug,
				municipality.province,
				municipality.community,
				{ kind: "department", code: municipality.province },
				previous,
				municipality,
				municipality.population,
			),
		);
	}
	return rows;
}

/** Upserts Spain's places (country `ES`); no other market's are read or touched. */
export async function importEsPlaces(
	sql: Sql,
	sources: EsPlaceSources,
	runId: number,
): Promise<PlacesStats & { located: number; byCapital: number }> {
	let communes = 0;
	const stats = await writePlaces(
		sql,
		"ES",
		(existing) => {
			const rows = buildEsPlaceRows(sources, existing);
			communes = rows.filter((row) => row.kind === "commune").length;
			return rows;
		},
		runId,
		{ regions: sources.communities.length, communes: 0, arrondissements: 0 },
	);
	return {
		...stats,
		communes,
		located: sources.municipalities.filter((m) => m.pointFrom !== null).length,
		byCapital: sources.municipalities.filter((m) => m.pointFrom === "capital").length,
	};
}
