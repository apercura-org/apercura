/**
 * Norway's places: Kartverket's administrative divisions (the `kommuneinfo` REST API,
 * "Administrative inndelinger", open data; the divisions themselves CC BY 4.0), one JSON
 * document of the counties with their municipalities (`/fylkerkommuner`), each municipality with
 * its number, Norwegian name and a point inside it (`punktIOmrade`, EPSG:4258).
 *
 * The fifteen counties (fylker) are departments and the 357 municipalities (kommuner) communes,
 * as Austria's Bundesländer and Gemeinden: a listing exists per county and per municipality.
 * Oslo is a county and a municipality (`0301`) at once: its page is the county's, like Paris.
 * Names are the Norwegian ones (`kommunenavnNorsk`: `Kautokeino` for Guovdageaidnu); the Sámi,
 * Kven and Finnish names come with the Sámi interface (ROADMAP.md). An establishment is placed by
 * the municipality number of its location address; Svalbard and Jan Mayen are no municipality
 * and are not listed.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { slugifyNo } from "@apercura/core";
import { NO_COUNTIES } from "@apercura/core/country";
import type { Sql, TransactionSql } from "../../lib/db";
import { downloadFile } from "../../lib/files";
import { type ExistingPlace, type PlaceRow, type PlacesStats, writePlaces } from "../../lib/places";

/** File name in `--source-dir`. */
export const NO_PLACES_FILE = "fylkerkommuner.json";

/** The counties with their municipalities (`ETL_NO_PLACES_URL`). */
export const DEFAULT_NO_PLACES_URL = "https://ws.geonorge.no/kommuneinfo/v1/fylkerkommuner";

export type NoCounty = { code: string; name: string };
export type NoMunicipality = {
	code: string;
	name: string;
	county: string;
	longitude: number | null;
	latitude: number | null;
};

export type NoPlaceSources = { counties: NoCounty[]; municipalities: NoMunicipality[] };

type ApiMunicipality = {
	kommunenummer?: unknown;
	kommunenavnNorsk?: unknown;
	kommunenavn?: unknown;
	punktIOmrade?: { coordinates?: unknown };
};
type ApiCounty = { fylkesnummer?: unknown; fylkesnavn?: unknown; kommuner?: unknown };

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/**
 * Reads the counties and municipalities of the document. Throws when it is not Kartverket's
 * (not an array, a county the reform does not know, too few municipalities).
 */
export function parseNoPlaces(json: string): NoPlaceSources {
	const data: unknown = JSON.parse(json);
	if (!Array.isArray(data)) throw new Error("not Kartverket's counties: not an array");
	const sources: NoPlaceSources = { counties: [], municipalities: [] };
	for (const entry of data as ApiCounty[]) {
		const code = text(entry.fylkesnummer);
		const name = text(entry.fylkesnavn);
		if (!/^\d{2}$/.test(code) || !name)
			throw new Error(`unreadable county ${JSON.stringify(code)}`);
		if (!NO_COUNTIES[code]) {
			throw new Error(`county ${code} ${name} is not one of NO_COUNTIES (packages/core)`);
		}
		sources.counties.push({ code, name });
		for (const municipality of (Array.isArray(entry.kommuner)
			? entry.kommuner
			: []) as ApiMunicipality[]) {
			const number = text(municipality.kommunenummer);
			const label = text(municipality.kommunenavnNorsk) || text(municipality.kommunenavn);
			if (!/^\d{4}$/.test(number) || number.slice(0, 2) !== code || !label) {
				throw new Error(`unreadable municipality ${JSON.stringify(number)} in county ${code}`);
			}
			const coordinates = municipality.punktIOmrade?.coordinates;
			const [longitude, latitude] = Array.isArray(coordinates) ? coordinates : [];
			const located = typeof longitude === "number" && typeof latitude === "number";
			sources.municipalities.push({
				code: number,
				name: label,
				county: code,
				longitude: located ? longitude : null,
				latitude: located ? latitude : null,
			});
		}
	}
	if (sources.counties.length === 0 || sources.municipalities.length === 0) {
		throw new Error("not Kartverket's counties: no county or municipality");
	}
	return sources;
}

/**
 * The rows of `directory.places`: counties as departments (slug `vestland`), municipalities as
 * communes, their slug unique within their county (`-{code}` on a collision). A known place
 * keeps its slug; a renamed one gets a new slug and keeps the old one as an alias.
 */
export function buildNoPlaceRows(sources: NoPlaceSources, existing: ExistingPlace[]): PlaceRow[] {
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
	for (const county of [...sources.counties].sort((a, b) => a.code.localeCompare(b.code))) {
		const { slug, previous } = keep("department", county.code, county.name, () =>
			unique("", slugifyNo(county.name) || county.code, county.code),
		);
		rows.push({
			...base,
			kind: "department",
			code: county.code,
			name: county.name,
			slug,
			department_code: county.code,
			parent_kind: null,
			parent_code: null,
			longitude: null,
			latitude: null,
			previous_slug: previous,
		});
	}
	for (const municipality of [...sources.municipalities].sort((a, b) =>
		a.code.localeCompare(b.code),
	)) {
		const { slug, previous } = keep("commune", municipality.code, municipality.name, () =>
			unique(
				municipality.county,
				slugifyNo(municipality.name) || municipality.code,
				municipality.code,
			),
		);
		rows.push({
			...base,
			kind: "commune",
			code: municipality.code,
			name: municipality.name,
			slug,
			department_code: municipality.county,
			parent_kind: "department",
			parent_code: municipality.county,
			longitude: municipality.longitude,
			latitude: municipality.latitude,
			previous_slug: previous,
		});
	}
	return rows;
}

/** Upserts Norway's places (country `NO`); no other market's are read or touched. */
export async function importNoPlaces(
	sql: Sql,
	sources: NoPlaceSources,
	runId: number,
): Promise<PlacesStats & { located: number }> {
	const stats = await writePlaces(
		sql,
		"NO",
		(existing) => buildNoPlaceRows(sources, existing),
		runId,
		{ regions: 0, communes: sources.municipalities.length, arrondissements: 0 },
	);
	return {
		...stats,
		located: sources.municipalities.filter((municipality) => municipality.longitude !== null)
			.length,
	};
}

/** Reads the counties and municipalities from `--source-dir`. */
export async function readNoPlaceSources(dir: string): Promise<NoPlaceSources> {
	return parseNoPlaces(await readFile(join(dir, NO_PLACES_FILE), "utf8"));
}

/** Downloads the counties and municipalities (about 270 kB) to `dir` and reads them. */
export async function fetchNoPlaceSources(url: string, dir: string): Promise<NoPlaceSources> {
	const file = await downloadFile({
		key: "places",
		url,
		path: join(dir, NO_PLACES_FILE),
		text: true,
	});
	return parseNoPlaces(await readFile(file.path, "utf8"));
}

/** A municipality as the merge places an establishment in it. */
export type NoMunicipalityPlace = { id: number; code: string; name: string; hasCentroid: boolean };

/** The municipalities by number. */
export async function loadNoPlaceIndex(
	sql: Sql | TransactionSql,
): Promise<Map<string, NoMunicipalityPlace>> {
	const rows = await sql<NoMunicipalityPlace[]>`
		SELECT id, code, name, (centroid IS NOT NULL) AS "hasCentroid" FROM directory.places
		WHERE country = 'NO' AND kind = 'commune' AND removed_at IS NULL
	`;
	return new Map(rows.map((row) => [row.code, row]));
}
