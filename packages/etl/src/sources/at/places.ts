/**
 * Austrian places from Statistik Austria's "Gemeinden – Schwerpunkte" (CC BY
 * 4.0): one point per Gemeinde, its population-weighted centre, with the
 * Gemeinde code (Gemeindekennziffer) and name; Vienna's 23 districts are
 * listed as Gemeinden 90101–92301.
 *
 * Mapped onto the four kinds of `directory.places`:
 * - the nine Bundesländer are departments (code `1`–`9`, slug `wien`,
 *   `steiermark`…), with no region above them;
 * - each Gemeinde is a commune of its Bundesland (the first digit of its code);
 * - the Gemeinde Wien (90001) is a commune whose districts are arrondissements
 *   (`/at/allgemeinmedizin/wien/alsergrund`); like Paris, its city page is its
 *   Bundesland's page.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { slugifyDe } from "@apercura/core";
import { AT_STATES, VIENNA_CODE } from "@apercura/core/country";
import { z } from "zod";
import type { Sql } from "../../lib/db";
import { fetchJson } from "../../lib/files";
import { type ExistingPlace, type PlaceRow, type PlacesStats, writePlaces } from "../../lib/places";

/** WFS layer of the Gemeinde centres, as GeoJSON in WGS 84 (one layer per year's boundaries). */
export const DEFAULT_AT_PLACES_URL =
	"https://www.statistik.gv.at/gs-open/GEODATA/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=GEODATA:STATISTIK_AUSTRIA_GEM_MP_20260101&outputFormat=application/json&srsName=EPSG:4326";

/** File name in `--source-dir`. */
export const AT_PLACES_FILE = "gemeinden.json";

const Gemeinden = z.object({
	type: z.literal("FeatureCollection"),
	features: z
		.array(
			z.object({
				geometry: z.object({
					type: z.literal("Point"),
					coordinates: z.tuple([z.number(), z.number()]),
				}),
				properties: z.object({ g_id: z.string().regex(/^[1-9]\d{4}$/), g_name: z.string().min(1) }),
			}),
		)
		.min(1),
});

export type AtGemeinde = { code: string; name: string; longitude: number; latitude: number };

/** Reads the Gemeinden of the GeoJSON; throws on anything else. */
export function parseGemeinden(json: unknown): AtGemeinde[] {
	return Gemeinden.parse(json).features.map((feature) => ({
		code: feature.properties.g_id,
		name: feature.properties.g_name.trim(),
		longitude: feature.geometry.coordinates[0],
		latitude: feature.geometry.coordinates[1],
	}));
}

export async function fetchGemeinden(url: string): Promise<AtGemeinde[]> {
	return parseGemeinden(await fetchJson<unknown>(url));
}

export async function readGemeinden(dir: string): Promise<AtGemeinde[]> {
	return parseGemeinden(JSON.parse(await readFile(join(dir, AT_PLACES_FILE), "utf8")));
}

const isViennaDistrict = (code: string) => /^9\d{2}01$/.test(code) && code !== VIENNA_CODE;

/**
 * The place rows of Austria. Existing slugs are kept; a renamed Gemeinde gets
 * a new slug and keeps the old one as an alias, as in France. A district's
 * slug drops the "Wien-" of its name (`Wien-Alsergrund` → `alsergrund`).
 */
export function buildAtPlaceRows(gemeinden: AtGemeinde[], existing: ExistingPlace[]): PlaceRow[] {
	const existingByKey = new Map(existing.map((place) => [`${place.kind}:${place.code}`, place]));
	const taken = new Map<string, Set<string>>();
	for (const place of existing) {
		if (place.kind !== "commune" && place.kind !== "arrondissement") continue;
		const set = taken.get(place.departmentCode ?? "") ?? new Set<string>();
		set.add(place.slug);
		taken.set(place.departmentCode ?? "", set);
	}
	const keep = (kind: PlaceRow["kind"], code: string, name: string, fresh: () => string) => {
		const known = existingByKey.get(`${kind}:${code}`);
		if (known && known.name === name) return { slug: known.slug, previous: null };
		const slug = fresh();
		return { slug, previous: known && known.slug !== slug ? known.slug : null };
	};
	const row = (
		kind: PlaceRow["kind"],
		code: string,
		name: string,
		slug: string,
		departmentCode: string | null,
		parent: { kind: string; code: string } | null,
		previous: string | null,
		point: { longitude: number; latitude: number } | null,
	): PlaceRow => ({
		kind,
		code,
		name,
		slug,
		department_code: departmentCode,
		region_code: null,
		parent_kind: parent?.kind ?? null,
		parent_code: parent?.code ?? null,
		longitude: point?.longitude ?? null,
		latitude: point?.latitude ?? null,
		population: null,
		postcodes: [],
		previous_slug: previous,
	});

	const rows: PlaceRow[] = [];
	for (const [code, name] of Object.entries(AT_STATES)) {
		const { slug, previous } = keep("department", code, name, () => slugifyDe(name));
		rows.push(row("department", code, name, slug, code, null, previous, null));
	}
	const localSlug = (state: string, base: string, code: string) => {
		const set = taken.get(state) ?? new Set<string>();
		taken.set(state, set);
		const slug = set.has(base) ? `${base}-${code}` : base;
		set.add(slug);
		return slug;
	};
	const sorted = [...gemeinden].sort((a, b) => a.code.localeCompare(b.code));
	const districts = sorted.filter((gemeinde) => isViennaDistrict(gemeinde.code));
	// Vienna, the city of the districts: its centre is the mean of theirs.
	if (districts.length > 0) {
		const centre = {
			longitude: districts.reduce((sum, d) => sum + d.longitude, 0) / districts.length,
			latitude: districts.reduce((sum, d) => sum + d.latitude, 0) / districts.length,
		};
		const { slug, previous } = keep("commune", VIENNA_CODE, "Wien", () =>
			localSlug("9", "wien", VIENNA_CODE),
		);
		taken.get("9")?.add(slug);
		rows.push(
			row(
				"commune",
				VIENNA_CODE,
				"Wien",
				slug,
				"9",
				{ kind: "department", code: "9" },
				previous,
				centre,
			),
		);
	}
	for (const gemeinde of sorted) {
		const state = gemeinde.code.charAt(0);
		if (!AT_STATES[state] || gemeinde.code === VIENNA_CODE) continue;
		if (isViennaDistrict(gemeinde.code)) continue;
		const { slug, previous } = keep("commune", gemeinde.code, gemeinde.name, () =>
			localSlug(state, slugifyDe(gemeinde.name) || gemeinde.code, gemeinde.code),
		);
		rows.push(
			row(
				"commune",
				gemeinde.code,
				gemeinde.name,
				slug,
				state,
				{ kind: "department", code: state },
				previous,
				gemeinde,
			),
		);
	}
	for (const district of districts) {
		const { slug, previous } = keep("arrondissement", district.code, district.name, () =>
			localSlug(
				"9",
				slugifyDe(district.name.replace(/^Wien[- ]+/, "")) || district.code,
				district.code,
			),
		);
		rows.push(
			row(
				"arrondissement",
				district.code,
				district.name,
				slug,
				"9",
				{ kind: "commune", code: VIENNA_CODE },
				previous,
				district,
			),
		);
	}
	return rows;
}

/** Upserts Austria's places (country `AT`); France's are never read or touched. */
export async function importAtPlaces(
	sql: Sql,
	gemeinden: AtGemeinde[],
	runId: number,
): Promise<PlacesStats> {
	return writePlaces(sql, "AT", (existing) => buildAtPlaceRows(gemeinden, existing), runId, {
		regions: 0,
		communes: gemeinden.filter((gemeinde) => !isViennaDistrict(gemeinde.code)).length + 1,
		arrondissements: gemeinden.filter((gemeinde) => isViennaDistrict(gemeinde.code)).length,
	});
}
