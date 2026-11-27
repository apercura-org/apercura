/**
 * Cyprus's places, from two open tables on data.gov.cy (both CC BY 4.0):
 * - the Statistical Service's (CYSTAT) 2021 census, "Κατοικίες, Νοικοκυριά, Ιδρύματα και
 *   Πληθυσμός που Καταγράφηκαν κατά Επαρχία, Δήμο/Κοινότητα και Ενορία" (table 1891164G of its
 *   PxWeb database, read as JSON-stat 2.0): every municipality and community it counted, by its
 *   four-digit code (`1000` Λευκωσία, `5000` Λεμεσός) and Greek name, with its population. The
 *   census was taken in the areas the Government of the Republic controls; the municipalities
 *   and communities of the areas where it does not exercise effective control are not in it,
 *   and so have no place here: no open source lists a facility there.
 * - Cyprus Post's table of postcodes by municipality, community and district ("Ταχυδρομικοί
 *   Κώδικες ανά Δήμο, Κοινότητα και Επαρχία", Department of Postal Services, its workbook "ΤΚ Δήμοι
 *   και Κοινότητες Vs LAU Codes"): every postcode with the municipality's or community's LAU code
 *   (CYSTAT's code), its official Latin name and its centre.
 *
 * Mapped onto `directory.places`: the five districts are departments (`1` Λευκωσία, `3`
 * Αμμόχωστος, `4` Λάρνακα, `5` Λεμεσός, `6` Πάφος; named "Επαρχία Λευκωσίας"…), every municipality
 * and community counted a commune of its district (the district is its code's first digit), with
 * its census population, its postcodes and its centre; its slug is its official Latin name
 * (`strovolos`, `agia-napa`). Run once, then when the tables change
 * (`etl:places --country cy`).
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { slugify, slugifyEl } from "@apercura/core";
import { CY_DISTRICTS } from "@apercura/core/country";
import type { Sql, TransactionSql } from "../../lib/db";
import { downloadFile, USER_AGENT } from "../../lib/files";
import { type ExistingPlace, type PlaceRow, type PlacesStats, writePlaces } from "../../lib/places";
import { xlsxRows } from "../../lib/xlsx";
import { clean, nameKey, stems } from "./text";

/** File names in `--source-dir`. */
export const CY_PLACE_FILES = { census: "apografi-2021.json", postcodes: "tk-lau.xlsx" } as const;

/** CYSTAT's census table of municipalities and communities (`ETL_CY_CENSUS_URL`, a PxWeb table). */
export const DEFAULT_CY_CENSUS_URL =
	"https://cystatdb.cystat.gov.cy/api/v1/el/8.CYSTAT-DB/Population/Census%20of%20Population%20and%20Housing%202021/Population/Population%20-%20Place%20of%20Residence/1891164G.px";

/** Cyprus Post's postcodes by municipality and community, with their LAU codes (`ETL_CY_POSTCODES_URL`). */
export const DEFAULT_CY_POSTCODES_URL =
	"https://www.data.gov.cy/sites/default/files/%CE%A4%CE%9A_%CE%94%CE%AE%CE%BC%CE%BF%CE%B9%20%CE%BA%CE%B1%CE%B9%20%CE%9A%CE%BF%CE%B9%CE%BD%CF%8C%CF%84%CE%B7%CF%84%CE%B5%CF%82%20Vs%20LAU%20Codes%20-%20%CE%91%CE%BD%CF%84%CE%B9%CF%83%CF%84%CE%BF%CE%AF%CF%87%CE%B7%CF%83%CE%B7%202021.xlsx";

/** The census table's variable of the counts, and its total population's value. */
const CENSUS_MEASURE = "ΚΑΤΟΙΚΙΕΣ, ΝΟΙΚΟΚΥΡΙΑ, ΙΔΡΥΜΑΤΑ, ΠΛΗΘΥΣΜΟΣ";
const CENSUS_POPULATION = "7";

/** The PxWeb query of the census table: the total population of every unit, as JSON-stat 2.0. */
export const CY_CENSUS_QUERY = {
	query: [{ code: CENSUS_MEASURE, selection: { filter: "item", values: [CENSUS_POPULATION] } }],
	response: { format: "json-stat2" },
};

/** The Cyprus Post workbook's sheet of postcodes and LAU codes. */
const POSTCODE_SHEET = (name: string) => /postal codes vs lau2 codes/i.test(name.trim());

export type CyMunicipality = {
	/** CYSTAT's four-digit code (`1012`). */
	code: string;
	/** Its Greek name (`Στρόβολος`). */
	name: string;
	/** Its official Latin name (`Strovolos`), when Cyprus Post's table gives it. */
	latin: string | null;
	/** The district's code: the code's first digit. */
	district: string;
	population: number | null;
	longitude: number | null;
	latitude: number | null;
	postcodes: string[];
};

export type CyPlaceSources = {
	/** When the census table was last updated (`2025-04-16`). */
	censusUpdated: string | null;
	municipalities: CyMunicipality[];
	/** Postcodes of the table whose municipality or community the census did not count. */
	postcodesLeftOut: number;
};

/** A name as a page prints it: `Λευκωσία - Σύνολο` → `Λευκωσία`, `Λατσιά ή Λακκιά` → `Λατσιά`. */
export function placeName(value: string): string {
	return clean(value)
		.replace(/\s+-\s+Σύνολο$/u, "")
		.replace(/\s+ή\s+.*$/u, "")
		.replace(/^'(\p{L})/u, (_, letter: string) => `${letter}\u0301`.normalize("NFC"))
		.trim();
}

/** An official Latin name as a slug reads it: `Aglantzia or Aglangia` → `Aglantzia`. */
function latinName(value: string): string | null {
	const text = clean(value).replace(/\s+or\s+.*$/i, "");
	return /[a-z]/i.test(text) ? text : null;
}

type JsonStat = {
	id?: string[];
	updated?: string;
	dimension?: Record<
		string,
		{ category?: { index?: Record<string, number> | string[]; label?: Record<string, string> } }
	>;
	value?: (number | null)[] | Record<string, number | null>;
};

/** Reads the census table (JSON-stat 2.0): every municipality and community, with its population. */
export function parseCensus(data: Buffer): {
	updated: string | null;
	units: Map<string, { name: string; population: number | null }>;
} {
	const table = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data)) as JsonStat;
	const [areaId] = table.id ?? [];
	const category = areaId ? table.dimension?.[areaId]?.category : undefined;
	if (!category?.index || !category.label || !table.value) {
		throw new Error("not the census table: no areas or values (JSON-stat 2.0 expected)");
	}
	const index = Array.isArray(category.index)
		? Object.fromEntries(category.index.map((code, position) => [code, position]))
		: category.index;
	const values = table.value;
	const units = new Map<string, { name: string; population: number | null }>();
	for (const [code, position] of Object.entries(index)) {
		if (!/^[1-9]\d{3}$/.test(code)) continue;
		const raw = Array.isArray(values) ? values[position] : values[String(position)];
		units.set(code, {
			name: placeName(category.label[code] ?? ""),
			population: typeof raw === "number" && Number.isFinite(raw) ? raw : null,
		});
	}
	if (units.size === 0) throw new Error("not the census table: no municipality or community");
	return { updated: table.updated?.slice(0, 10) ?? null, units };
}

/** Reads Cyprus Post's table: every postcode with its unit's code, Latin name and centre. */
export async function parsePostcodeTable(archive: Buffer): Promise<
	Map<
		string,
		{
			name: string;
			latin: string | null;
			longitude: number | null;
			latitude: number | null;
			postcodes: string[];
		}
	>
> {
	const units = new Map<
		string,
		{
			name: string;
			latin: string | null;
			longitude: number | null;
			latitude: number | null;
			postcodes: string[];
		}
	>();
	let columns: Record<string, number> | null = null;
	for await (const { cells } of xlsxRows(archive, POSTCODE_SHEET)) {
		if (!columns) {
			const header = cells.map((cell) =>
				clean(cell)
					.toLowerCase()
					.replace(/[\s_]+/g, " "),
			);
			const find = (name: string) => header.indexOf(name);
			const found = {
				postcode: find("postal code"),
				code: find("lau2 code"),
				name: find("lau2 name gr"),
				latin: find("lau2 name en"),
				latitude: find("lau2 latitude"),
				longitude: find("lau2 longitude"),
			};
			if (Object.values(found).some((index) => index < 0)) {
				if (header.includes("postal code")) {
					throw new Error("not the postcodes' table: a column is missing");
				}
				continue;
			}
			columns = found;
			continue;
		}
		const postcode = clean(cells[columns.postcode ?? -1]);
		const code = clean(cells[columns.code ?? -1]);
		if (!/^[1-9]\d{3}$/.test(postcode) || !/^[1-9]\d{3}$/.test(code)) continue;
		const latitude = Number(clean(cells[columns.latitude ?? -1]));
		const longitude = Number(clean(cells[columns.longitude ?? -1]));
		const located = latitude > 34.5 && latitude < 35.75 && longitude > 32.2 && longitude < 34.65;
		const unit = units.get(code) ?? {
			name: placeName(cells[columns.name ?? -1] ?? ""),
			latin: latinName(cells[columns.latin ?? -1] ?? ""),
			latitude: located ? Math.round(latitude * 1e5) / 1e5 : null,
			longitude: located ? Math.round(longitude * 1e5) / 1e5 : null,
			postcodes: [],
		};
		if (!unit.postcodes.includes(postcode)) unit.postcodes.push(postcode);
		units.set(code, unit);
	}
	if (!columns || units.size === 0) throw new Error("not the postcodes' table: no postcode");
	return units;
}

/** Both tables, joined: the municipalities and communities the census counted. */
export async function parseCyPlaceSources(
	census: Buffer,
	postcodes: Buffer,
): Promise<CyPlaceSources> {
	const counted = parseCensus(census);
	const table = await parsePostcodeTable(postcodes);
	const municipalities: CyMunicipality[] = [];
	for (const [code, unit] of counted.units) {
		const district = code.slice(0, 1);
		if (!CY_DISTRICTS[district]) continue;
		const post = table.get(code);
		municipalities.push({
			code,
			name: unit.name || post?.name || code,
			latin: post?.latin ?? null,
			district,
			population: unit.population,
			longitude: post?.longitude ?? null,
			latitude: post?.latitude ?? null,
			postcodes: [...(post?.postcodes ?? [])].sort(),
		});
	}
	let postcodesLeftOut = 0;
	for (const [code, unit] of table) {
		if (!counted.units.has(code)) postcodesLeftOut += unit.postcodes.length;
	}
	if (municipalities.length === 0) throw new Error("no Cypriot municipality or community");
	return { censusUpdated: counted.updated, municipalities, postcodesLeftOut };
}

/**
 * The place rows of Cyprus. Existing slugs are kept; a renamed place gets a new slug and keeps
 * the old one as an alias, as in the other markets. A district's slug is its Greek name in Latin
 * letters (`eparchia-lefkosias`); a municipality's or community's its official Latin name, unique
 * within its district (`-{code}` on a collision).
 */
export function buildCyPlaceRows(sources: CyPlaceSources, existing: ExistingPlace[]): PlaceRow[] {
	const existingByKey = new Map(existing.map((place) => [`${place.kind}:${place.code}`, place]));
	const keep = (kind: PlaceRow["kind"], code: string, name: string, fresh: () => string) => {
		const known = existingByKey.get(`${kind}:${code}`);
		if (known && known.name === name) return { slug: known.slug, previous: null };
		const slug = fresh();
		return { slug, previous: known && known.slug !== slug ? known.slug : null };
	};
	const taken = new Map<string, Set<string>>();
	for (const place of existing) {
		if (place.kind !== "commune") continue;
		const set = taken.get(place.departmentCode ?? "") ?? new Set<string>();
		set.add(place.slug);
		taken.set(place.departmentCode ?? "", set);
	}
	const base = {
		region_code: null,
		parent_kind: null,
		parent_code: null,
		longitude: null,
		latitude: null,
		population: null,
		postcodes: [] as string[],
	};
	const rows: PlaceRow[] = [];
	for (const [code, name] of Object.entries(CY_DISTRICTS)) {
		const { slug, previous } = keep("department", code, name, () => slugifyEl(name));
		rows.push({
			...base,
			kind: "department",
			code,
			name,
			slug,
			department_code: code,
			previous_slug: previous,
		});
	}
	for (const unit of [...sources.municipalities].sort((a, b) => a.code.localeCompare(b.code))) {
		const { slug, previous } = keep("commune", unit.code, unit.name, () => {
			const set = taken.get(unit.district) ?? new Set<string>();
			taken.set(unit.district, set);
			const fresh = (unit.latin ? slugify(unit.latin) : "") || slugifyEl(unit.name) || unit.code;
			const slug = set.has(fresh) ? `${fresh}-${unit.code}` : fresh;
			set.add(slug);
			return slug;
		});
		rows.push({
			...base,
			kind: "commune",
			code: unit.code,
			name: unit.name,
			slug,
			department_code: unit.district,
			parent_kind: "department",
			parent_code: unit.district,
			longitude: unit.longitude,
			latitude: unit.latitude,
			population: unit.population,
			postcodes: unit.postcodes,
			previous_slug: previous,
		});
	}
	return rows;
}

/** Upserts Cyprus's places (country `CY`); no other market's are read or touched. */
export async function importCyPlaces(
	sql: Sql,
	sources: CyPlaceSources,
	runId: number,
): Promise<
	PlacesStats & { located: number; censusUpdated: string | null; postcodesLeftOut: number }
> {
	const stats = await writePlaces(
		sql,
		"CY",
		(existing) => buildCyPlaceRows(sources, existing),
		runId,
		{ regions: 0, communes: sources.municipalities.length, arrondissements: 0 },
	);
	return {
		...stats,
		located: sources.municipalities.filter((unit) => unit.longitude !== null).length,
		censusUpdated: sources.censusUpdated,
		postcodesLeftOut: sources.postcodesLeftOut,
	};
}

/** Reads both tables from `--source-dir`. */
export async function readCyPlaceSources(dir: string): Promise<CyPlaceSources> {
	return parseCyPlaceSources(
		await readFile(join(dir, CY_PLACE_FILES.census)),
		await readFile(join(dir, CY_PLACE_FILES.postcodes)),
	);
}

/** Asks the census table for every unit's population (a PxWeb query, POST) and saves the answer. */
export async function fetchCensus(url: string, path: string): Promise<void> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			const response = await fetch(url, {
				method: "POST",
				headers: { "user-agent": USER_AGENT, "content-type": "application/json" },
				body: JSON.stringify(CY_CENSUS_QUERY),
				signal: AbortSignal.timeout(120_000),
			});
			if (!response.ok) throw new Error(`POST ${url} answered ${response.status}`);
			await writeFile(path, Buffer.from(await response.arrayBuffer()));
			return;
		} catch (error) {
			lastError = error;
			if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 2_000 * attempt));
		}
	}
	throw new Error(
		`The census table could not be read: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
	);
}

/** Downloads both tables to `dir` and reads them. */
export async function fetchCyPlaceSources(
	urls: { census: string; postcodes: string },
	dir: string,
): Promise<CyPlaceSources> {
	const census = join(dir, CY_PLACE_FILES.census);
	await fetchCensus(urls.census, census);
	const postcodes = await downloadFile({
		key: "postcodes",
		url: urls.postcodes,
		path: join(dir, CY_PLACE_FILES.postcodes),
		text: false,
	});
	return parseCyPlaceSources(await readFile(census), await readFile(postcodes.path));
}

// ---------------------------------------------------------------------------
// Placing a facility
// ---------------------------------------------------------------------------

export type CyPlace = {
	id: number;
	code: string;
	name: string;
	districtCode: string;
	postcodes: readonly string[];
	longitude: number | null;
	latitude: number | null;
};

export type CyPlaceIndex = {
	byPostcode: Map<string, CyPlace>;
	byCode: Map<string, CyPlace>;
	byDistrict: Map<string, CyPlace[]>;
};

/** The district code of a district's name as the lists write it (`Λευκωσία`, `ΛΕΜΕΣΟΣ`). */
const DISTRICT_CODES: Readonly<Record<string, string>> = {
	[nameKey("Λευκωσία")]: "1",
	[nameKey("Αμμόχωστος")]: "3",
	[nameKey("Λάρνακα")]: "4",
	[nameKey("Λεμεσός")]: "5",
	[nameKey("Πάφος")]: "6",
};

export function districtCodeOf(name: string | null): string | null {
	return name ? (DISTRICT_CODES[nameKey(name)] ?? null) : null;
}

/**
 * Places named, in a health centre's name, by what is not their own name as the census writes
 * it: a quarter of a town (Καϊμακλί, Λινόπετρα), a shorter name (Έγκωμη for Έγκωμη Λευκωσίας), an ancient name (Ιδάλιον for Δάλι), the town's
 * former hospital, a village of two parts (Πλάτρες, Λεύκαρα), a name shared by several villages
 * (Κάμπος). Keyed by the name's key, each gives the code of the municipality or community it
 * is in, whatever the district its number's area code says (Κάτω Πύργος, in Nicosia's
 * district, dials Paphos's).
 */
const PLACE_ALIASES: Readonly<Record<string, string>> = {
	[nameKey("Καϊμακλίου")]: "1000",
	[nameKey("Έγκωμης")]: "1011",
	[nameKey("Παλαιού Νοσ. Λευκωσίας")]: "1000",
	[nameKey("Παλαιού Νοσ. Λάρνακας")]: "4000",
	[nameKey("Λινόπετρας")]: "5000",
	[nameKey("Ιδαλίου")]: "1107",
	[nameKey("Κάμπου")]: "1427",
	[nameKey("Πύργου Τυλληρίας")]: "1457",
	[nameKey("Πλατρών")]: "5351",
	[nameKey("Λευκάρων")]: "4311",
	[nameKey("Παναγιάς")]: "6230",
};

export function buildCyPlaceIndex(places: readonly CyPlace[]): CyPlaceIndex {
	const index: CyPlaceIndex = { byPostcode: new Map(), byCode: new Map(), byDistrict: new Map() };
	for (const place of places) {
		index.byCode.set(place.code, place);
		for (const postcode of place.postcodes) index.byPostcode.set(postcode, place);
		const list = index.byDistrict.get(place.districtCode) ?? [];
		list.push(place);
		index.byDistrict.set(place.districtCode, list);
	}
	return index;
}

/** Builds the index of Cyprus's municipalities and communities the facilities are placed in. */
export async function loadCyPlaceIndex(sql: Sql | TransactionSql): Promise<CyPlaceIndex> {
	const places = await sql<CyPlace[]>`
		SELECT id, code, name, department_code AS "districtCode", postcodes,
			ST_X(centroid::geometry) AS longitude, ST_Y(centroid::geometry) AS latitude
		FROM directory.places
		WHERE country = 'CY' AND kind = 'commune' AND removed_at IS NULL
	`;
	return buildCyPlaceIndex(places);
}

/**
 * The places whose name a text names, word stems compared: the longest name first, then the
 * one named first (`Στρόβολος Λευκωσία` is in Στρόβολος: an address names its district last).
 */
function placesNamed(text: string, candidates: readonly CyPlace[]): CyPlace[] {
	const words = stems(text);
	if (words.length === 0) return [];
	const scored: { place: CyPlace; length: number; start: number }[] = [];
	for (const place of candidates) {
		const own = stems(place.name);
		if (own.length === 0 || own.length > words.length) continue;
		// The place's whole name, its words in order, somewhere in the text.
		for (let start = 0; start + own.length <= words.length; start++) {
			if (own.every((word, offset) => words[start + offset] === word)) {
				scored.push({ place, length: own.length, start });
				break;
			}
		}
	}
	const longest = Math.max(0, ...scored.map((entry) => entry.length));
	const first = Math.min(
		...scored.filter((entry) => entry.length === longest).map((entry) => entry.start),
	);
	return scored
		.filter((entry) => entry.length === longest && entry.start === first)
		.map((entry) => entry.place);
}

/** Squared distance in degrees, longitude scaled at Cyprus's latitude: enough to rank. */
function distance(place: CyPlace, point: { longitude: number; latitude: number }): number {
	if (place.longitude === null || place.latitude === null) return Number.POSITIVE_INFINITY;
	const dx = (place.longitude - point.longitude) * Math.cos((35 * Math.PI) / 180);
	const dy = place.latitude - point.latitude;
	return dx * dx + dy * dy;
}

export type CyPlacement = {
	place: CyPlace;
	/** How the place was told. */
	placedBy: "postcode" | "name" | "point";
};

/**
 * Places a facility in its municipality or community: by its postcode (Cyprus Post's table),
 * else by an alias of the place its name gives (`PLACE_ALIASES`), else by the place its town or
 * name names in its district (`Κοφίνου` meets `Κόφινου`, `Αγίας
 * Νάπας` meets `Αγία Νάπα`, the most specific name winning: `Κάτω Πολεμίδια Λεμεσός` is in Κάτω
 * Πολεμίδια), else, for a hospital, at the unit whose centre is nearest its point in its
 * district. Null when none fits, or when a name fits several places alike.
 */
export function placeFacility(
	location: {
		postcode: string | null;
		town: string | null;
		district: string | null;
		point: { longitude: number; latitude: number } | null;
	},
	index: CyPlaceIndex,
): CyPlacement | null {
	const district = districtCodeOf(location.district);
	// Cyprus Post's postcode wins over the district a list names (a pharmacy of Mosfiloti, in
	// Larnaca's district, is listed under Nicosia's).
	const byPostcode = location.postcode ? index.byPostcode.get(location.postcode) : undefined;
	if (byPostcode) return { place: byPostcode, placedBy: "postcode" };
	const aliased = location.town ? PLACE_ALIASES[nameKey(location.town)] : undefined;
	const alias = aliased ? index.byCode.get(aliased) : undefined;
	if (alias) return { place: alias, placedBy: "name" };
	const candidates = district
		? (index.byDistrict.get(district) ?? [])
		: [...index.byDistrict.values()].flat();
	if (location.town) {
		const named = placesNamed(location.town, candidates);
		if (named.length === 1 && named[0]) return { place: named[0], placedBy: "name" };
	}
	if (location.point && district) {
		const point = location.point;
		const nearest = [...candidates].sort((a, b) => distance(a, point) - distance(b, point))[0];
		if (nearest && distance(nearest, point) < 0.15 * 0.15) {
			return { place: nearest, placedBy: "point" };
		}
	}
	return null;
}
