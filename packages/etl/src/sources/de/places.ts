/**
 * German places from the statistical offices' municipalities' directory (Gemeindeverzeichnis-
 * Informationssystem GV-ISys, Statistisches Bundesamt: "Alle politisch selbständigen Gemeinden
 * mit ausgewählten Merkmalen", every quarter; "Vervielfältigung und Verbreitung, auch
 * auszugsweise, mit Quellenangabe gestattet"): one workbook whose rows are the Länder (record
 * type 10), government regions (20), Kreise (40), Gemeindeverbände (50) and Gemeinden (60), each
 * with its official key, name, and for a Gemeinde its population, the postcode of its seat and
 * its geographic centre (longitude and latitude, decimal commas).
 *
 * The hospital directory publishes no coordinates, so a hospital or clinic is located at its
 * Gemeinde's centre: city precision. Boundaries are not read.
 *
 * Mapped onto the four kinds of `directory.places`:
 * - the 16 Länder are regions (`09`), with no listing of their own;
 * - the 400 Kreise and kreisfreie Städte are departments (`09162`), named the way people say them
 *   (`München` the city, `Landkreis München`, `Kreis Dithmarschen`, `Region Hannover`);
 * - every Gemeinde is a commune of its Kreis (`09162000`). A kreisfreie Stadt is a Kreis and a
 *   Gemeinde at once (its Gemeinde part is `000`): like Paris, its city page is its Kreis's
 *   (`apps/web/src/lib/places.ts`).
 * The uninhabited areas outside any Gemeinde (gemeindefreie Gebiete: forests, lakes, the coastal
 * waters) are left out: no facility is there.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { slugifyDe } from "@apercura/core";
import { DE_STATES } from "@apercura/core/country";
import type { Sql, TransactionSql } from "../../lib/db";
import { downloadFile } from "../../lib/files";
import { type ExistingPlace, type PlaceRow, type PlacesStats, writePlaces } from "../../lib/places";
import { xlsxRows, xlsxSheets } from "../../lib/xlsx";
import { clean, municipalityName, nameKey } from "./names";

/** File name in `--source-dir`. */
export const DE_PLACES_FILE = "gemeindeverzeichnis.xlsx";

/** The latest quarter's extract of GV-ISys (`ETL_DE_PLACES_URL`). */
export const DEFAULT_DE_PLACES_URL =
	"https://www.destatis.de/DE/Themen/Laender-Regionen/Regionales/Gemeindeverzeichnis/Administrativ/Archiv/GVAuszugQ/AuszugGV4QAktuell.xlsx?__blob=publicationFile";

/** Germany's extent, with a margin. */
const BOUNDS = { minLat: 47.2, maxLat: 55.1, minLng: 5.8, maxLng: 15.1 };

export type DeUnit = { code: string; name: string };

export type DePlaceSources = {
	/** The date the directory is of (`31.12.2025`), when it says. */
	asOf: string | null;
	states: DeUnit[];
	/** Kreise, named the way people say them, with their Land. */
	districts: (DeUnit & { state: string; urban: boolean })[];
	/** Gemeinden, with their Kreis and Land, centre and population when given. */
	municipalities: (DeUnit & {
		district: string;
		state: string;
		longitude: number | null;
		latitude: number | null;
		population: number | null;
		postcode: string | null;
	})[];
};

const decimal = (value: string | undefined) => {
	const text = clean(value).replace(",", ".");
	return text !== "" && Number.isFinite(Number(text)) ? Number(text) : null;
};

/**
 * A Kreis's name the way people say it, from its name and record subtype in the directory: a
 * kreisfreie Stadt or Stadtkreis (41, 42) by its city (`München`), a Kreis (43) or Landkreis
 * (44) with the word unless its name already says it (`Rhein-Sieg-Kreis`, `Region Hannover`),
 * a Regionalverband (45) as named.
 */
export function districtName(raw: string, subtype: string): string {
	const name = municipalityName(raw);
	if (subtype === "41" || subtype === "42" || subtype === "45") return name;
	if (
		/kreis$/i.test(name) ||
		/^(?:Kreis|Landkreis|Region|Städteregion|Regionalverband)\b/.test(name)
	) {
		return name;
	}
	return `${subtype === "43" ? "Kreis" : "Landkreis"} ${name}`;
}

/**
 * Reads the directory into Länder, Kreise and Gemeinden. Throws when it holds none (another
 * file, a changed format).
 */
export async function parseDePlaces(archive: Buffer): Promise<DePlaceSources> {
	const sheets = xlsxSheets(archive);
	const sheet = sheets.find((candidate) => /gemeinden/i.test(candidate.name)) ?? sheets.at(-1);
	const sources: DePlaceSources = { asOf: null, states: [], districts: [], municipalities: [] };
	const districtSubtype = new Map<string, string>();
	let header = false;
	for await (const row of xlsxRows(archive, sheet?.name)) {
		const cells = row.cells.map((cell) => clean(cell));
		if (!header) {
			header = cells[0] === "Satzart" && cells.some((cell) => /Regionalschlüssel/.test(cell));
			continue;
		}
		const asOf = /Gebietsstand am (\d{2}\.\d{2}\.\d{4})/.exec(cells.join(" "))?.[1];
		if (asOf && !sources.asOf) sources.asOf = asOf;
		const [type, subtype = "", land = "", rb = "", kreis = "", , gemeinde = "", name = ""] = cells;
		if (!/^\d{2}$/.test(land) || !DE_STATES[land] || !name) continue;
		if (type === "10") {
			sources.states.push({ code: land, name: municipalityName(name) });
		} else if (type === "40" && /^\d$/.test(rb) && /^\d{2}$/.test(kreis)) {
			const code = `${land}${rb}${kreis}`;
			districtSubtype.set(code, subtype);
			sources.districts.push({
				code,
				name: districtName(name, subtype),
				state: land,
				urban: subtype === "41" || subtype === "42",
			});
		} else if (type === "60" && /^\d{3}$/.test(gemeinde) && subtype !== "65" && subtype !== "66") {
			const district = `${land}${rb}${kreis}`;
			let longitude = decimal(cells[14]);
			let latitude = decimal(cells[15]);
			if (
				longitude === null ||
				latitude === null ||
				latitude < BOUNDS.minLat ||
				latitude > BOUNDS.maxLat ||
				longitude < BOUNDS.minLng ||
				longitude > BOUNDS.maxLng
			) {
				longitude = null;
				latitude = null;
			}
			const population = clean(cells[9]).replace(/\s/g, "");
			const postcode = clean(cells[13]);
			sources.municipalities.push({
				code: `${district}${gemeinde}`,
				name: municipalityName(name),
				district,
				state: land,
				longitude,
				latitude,
				population: /^\d+$/.test(population) ? Number(population) : null,
				postcode: /^\d{5}$/.test(postcode) ? postcode : null,
			});
		}
	}
	const districts = new Set(sources.districts.map((district) => district.code));
	sources.municipalities = sources.municipalities.filter((m) => districts.has(m.district));
	if (
		sources.states.length === 0 ||
		sources.districts.length === 0 ||
		sources.municipalities.length === 0
	) {
		throw new Error(
			`not the municipalities' directory: ${sources.states.length} Länder, ${sources.districts.length} Kreise, ${sources.municipalities.length} Gemeinden`,
		);
	}
	return sources;
}

/**
 * The place rows of Germany. Existing slugs are kept; a renamed place gets a new slug and keeps
 * the old one as an alias, as in the other markets. Kreise and Länder share one slug space,
 * Kreise first (their pages are listings: `Berlin` the Kreis is `berlin`, the Land `berlin-11`);
 * a Gemeinde's slug is unique within its Kreis (`-{code}` on a collision).
 */
export function buildDePlaceRows(sources: DePlaceSources, existing: ExistingPlace[]): PlaceRow[] {
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
			const base = slugifyDe(name) || code;
			const slug = topTaken.has(base) ? `${base}-${code}` : base;
			topTaken.add(slug);
			return slug;
		});
	const localSlug = (code: string, name: string, district: string) =>
		keep("commune", code, name, () => {
			const set = localTaken.get(district) ?? new Set<string>();
			localTaken.set(district, set);
			const base = slugifyDe(name) || code;
			const slug = set.has(base) ? `${base}-${code}` : base;
			set.add(slug);
			return slug;
		});
	const rows: PlaceRow[] = [];
	const base = {
		parent_kind: null,
		parent_code: null,
		longitude: null,
		latitude: null,
		population: null,
		postcodes: [] as string[],
	};
	for (const district of [...sources.districts].sort((a, b) => a.code.localeCompare(b.code))) {
		const { slug, previous } = topSlug("department", district.code, district.name);
		rows.push({
			...base,
			kind: "department",
			code: district.code,
			name: district.name,
			slug,
			department_code: district.code,
			region_code: district.state,
			parent_kind: "region",
			parent_code: district.state,
			previous_slug: previous,
		});
	}
	for (const state of [...sources.states].sort((a, b) => a.code.localeCompare(b.code))) {
		const { slug, previous } = topSlug("region", state.code, state.name);
		rows.push({
			...base,
			kind: "region",
			code: state.code,
			name: state.name,
			slug,
			department_code: null,
			region_code: state.code,
			previous_slug: previous,
		});
	}
	for (const municipality of [...sources.municipalities].sort((a, b) =>
		a.code.localeCompare(b.code),
	)) {
		const { slug, previous } = localSlug(
			municipality.code,
			municipality.name,
			municipality.district,
		);
		rows.push({
			...base,
			kind: "commune",
			code: municipality.code,
			name: municipality.name,
			slug,
			department_code: municipality.district,
			region_code: municipality.state,
			parent_kind: "department",
			parent_code: municipality.district,
			longitude: municipality.longitude,
			latitude: municipality.latitude,
			population: municipality.population,
			postcodes: municipality.postcode ? [municipality.postcode] : [],
			previous_slug: previous,
		});
	}
	return rows;
}

/** Upserts Germany's places (country `DE`); no other market's are read or touched. */
export async function importDePlaces(
	sql: Sql,
	sources: DePlaceSources,
	runId: number,
): Promise<PlacesStats & { located: number; asOf: string | null }> {
	let communes = 0;
	const stats = await writePlaces(
		sql,
		"DE",
		(existing) => {
			const rows = buildDePlaceRows(sources, existing);
			communes = rows.filter((row) => row.kind === "commune").length;
			return rows;
		},
		runId,
		{ regions: sources.states.length, communes: 0, arrondissements: 0 },
	);
	return {
		...stats,
		communes,
		located: sources.municipalities.filter((m) => m.longitude !== null).length,
		asOf: sources.asOf,
	};
}

// ---------------------------------------------------------------------------
// Placing a facility
// ---------------------------------------------------------------------------

export type DeCommune = {
	id: number;
	code: string;
	name: string;
	districtCode: string;
	stateCode: string;
	longitude: number | null;
	latitude: number | null;
};

export type DePlaceIndex = {
	byCode: Map<string, DeCommune>;
	byName: Map<string, DeCommune[]>;
	communes: DeCommune[];
	/** Kreise by code: the place of a facility whose Gemeinde is unknown. */
	districts: Map<string, number>;
};

/**
 * The names a town is written with: as given, without its status or a qualifier after a comma
 * (`Oberhausen, Rheinland`), without a part in brackets (`Buckow (Märkische Schweiz)`, `Am
 * Mellensee (OT Sperenberg)`) and that part alone when it names a district (`OT Sperenberg`),
 * and each name of a bilingual or two-part one (`Cottbus/Chóśebuz`, `Petershagen/Eggersdorf`).
 */
export function townNames(raw: string): string[] {
	const names = new Set<string>();
	const add = (value: string) => {
		const key = nameKey(value);
		if (key) names.add(key);
	};
	const text = clean(raw);
	const first = clean(text.split(",")[0]);
	for (const value of [text, first]) {
		add(value);
		const bracket = /^(.*?)\s*\((.*)\)\s*$/.exec(value);
		const plain = bracket ? clean(bracket[1]) : value;
		add(plain);
		if (bracket?.[2]) add(bracket[2].replace(/^(?:OT|Ortsteil)\s+/i, ""));
		for (const part of plain.split("/")) add(part);
	}
	return [...names];
}

/** Builds the index of Germany's Gemeinden the facilities are placed with. */
export async function loadDePlaceIndex(sql: Sql | TransactionSql): Promise<DePlaceIndex> {
	const communes = await sql<DeCommune[]>`
		SELECT id, code, name, department_code AS "districtCode", region_code AS "stateCode",
			ST_X(centroid::geometry) AS longitude, ST_Y(centroid::geometry) AS latitude
		FROM directory.places
		WHERE country = 'DE' AND kind = 'commune' AND removed_at IS NULL
	`;
	const districts = await sql<{ id: number; code: string }[]>`
		SELECT id, code FROM directory.places
		WHERE country = 'DE' AND kind = 'department' AND removed_at IS NULL
	`;
	return buildDePlaceIndex(
		communes,
		districts.map((district) => [district.code, district.id]),
	);
}

export function buildDePlaceIndex(
	communes: readonly DeCommune[],
	districts: readonly [string, number][],
): DePlaceIndex {
	const byName = new Map<string, DeCommune[]>();
	for (const commune of communes) {
		for (const name of townNames(commune.name)) {
			const list = byName.get(name) ?? [];
			list.push(commune);
			byName.set(name, list);
		}
	}
	return {
		byCode: new Map(communes.map((commune) => [commune.code, commune])),
		byName,
		communes: [...communes],
		districts: new Map(districts),
	};
}

/** Distance in kilometres between two points (equirectangular: fine at a Land's scale). */
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

/** A facility's point is matched to a Gemeinde centre at most this far, when nothing else places it. */
export const NEAREST_MAX_KM = 15;

export type Placement = {
	placeId: number | null;
	placedBy: "code" | "name" | "nearest" | "district" | null;
};

/**
 * Places a facility:
 * 1. the Gemeinde of its municipality key;
 * 2. else the Gemeinde its town names, in its Land (the one nearest its point when several
 *    share the name), else anywhere in Germany when one only does (a site the directory filed
 *    under the Land of its hospital's seat: Mainz's university hospital site in Wiesbaden);
 * 3. else the Gemeinde whose centre is nearest its point, in its Land, within 15 km;
 * 4. else the Kreis of its municipality key.
 */
export function placeFacility(
	facility: {
		municipalityCode: string | null;
		city: string;
		stateCode: string;
		point: { longitude: number; latitude: number } | null;
	},
	index: DePlaceIndex,
): Placement {
	const byCode = facility.municipalityCode
		? index.byCode.get(facility.municipalityCode)
		: undefined;
	if (byCode) return { placeId: byCode.id, placedBy: "code" };
	const named = new Map<number, DeCommune>();
	for (const name of townNames(facility.city)) {
		for (const commune of index.byName.get(name) ?? []) named.set(commune.id, commune);
	}
	const inState = [...named.values()].filter((commune) => commune.stateCode === facility.stateCode);
	const point = facility.point;
	const closest = (candidates: DeCommune[]) =>
		point
			? [...candidates].sort((a, b) => distanceKm(point, a) - distanceKm(point, b))[0]
			: candidates.length === 1
				? candidates[0]
				: undefined;
	const match =
		inState.length > 0 ? closest(inState) : named.size === 1 ? [...named.values()][0] : undefined;
	if (match) return { placeId: match.id, placedBy: "name" };
	if (point) {
		const nearest = closest(
			index.communes.filter((commune) => commune.stateCode === facility.stateCode),
		);
		if (nearest && distanceKm(point, nearest) <= NEAREST_MAX_KM) {
			return { placeId: nearest.id, placedBy: "nearest" };
		}
	}
	const district = facility.municipalityCode
		? index.districts.get(facility.municipalityCode.slice(0, 5))
		: undefined;
	if (district) return { placeId: district, placedBy: "district" };
	return { placeId: null, placedBy: null };
}

/** Reads the municipalities' directory from `--source-dir`. */
export async function readDePlaceSources(dir: string): Promise<DePlaceSources> {
	return parseDePlaces(await readFile(join(dir, DE_PLACES_FILE)));
}

/** Downloads the municipalities' directory (about 2 MB) to `dir` and reads it. */
export async function fetchDePlaceSources(url: string, dir: string): Promise<DePlaceSources> {
	const file = await downloadFile({
		key: "places",
		url,
		path: join(dir, DE_PLACES_FILE),
		text: false,
	});
	return parseDePlaces(await readFile(file.path));
}
