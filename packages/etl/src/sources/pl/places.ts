/**
 * Polish places from the official territorial division and its boundaries:
 * - TERC, the territorial division register of TERYT (Główny Urząd Statystyczny, the official
 *   file, "urzędowy"): every voivodeship, powiat and gmina with its code and name, and the kind
 *   of each gmina (urban, rural, urban-rural) and of the city parts it lists; free for all users,
 *   CC BY 4.0 on the GUS portal. One small ZIP (a CSV and an XML), served by eTERYT's download
 *   form (`fetchTerc`).
 * - PRG, the State Register of Boundaries (Główny Urząd Geodezji i Kartografii): the boundaries
 *   of the gminas (`A03_Granice_gmin`, a polygon shapefile in ETRS89 degrees, keyed by the same
 *   seven-digit TERYT code), from which each gmina's interior point is computed. Material of the
 *   State Geodetic and Cartographic Resource, free under the geodetic law (art. 40a ust. 2 pkt 1
 *   lit. a), CC BY 4.0 on dane.gov.pl, credited with the statement that law asks for (art. 40c
 *   ust. 3).
 *
 * Mapped onto the four kinds of `directory.places`:
 * - the 16 voivodeships are regions (`12`), with listings of their own (migration 0030);
 * - the 380 powiats are departments (`1206`), named the way people say them (`powiat
 *   krakowski`), the 66 cities with powiat rights by their city (`Kraków`, `1261`);
 * - the 2,479 gminas are communes of their powiat (`1206022`, the TERYT code with its kind). A
 *   city with powiat rights is a powiat and a gmina at once (`1261011`): like Paris, its city page
 *   is its powiat's (`apps/web/src/lib/places.ts`). A rural gmina named like the town it surrounds
 *   (`Bolesławiec`, urban and rural) is told apart by its kind (`Bolesławiec (gmina wiejska)`).
 * Warsaw's districts and the delegations of Kraków, Łódź, Poznań and Wrocław are not places: two
 * thirds of the register's Warsaw units carry the city's code only, so every unit of a city is
 * placed in it.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { slugifyPl } from "@apercura/core";
import { PL_VOIVODESHIPS } from "@apercura/core/country";
import type { Sql } from "../../lib/db";
import { downloadFile, USER_AGENT } from "../../lib/files";
import { type ExistingPlace, type PlaceRow, type PlacesStats, writePlaces } from "../../lib/places";
import { readDbf, readShpPolygons, type ShpRing } from "../../lib/shapefile";
import { parseQuotedRecord } from "../../lib/text";
import { readZipEntries } from "../../lib/zip";

/** File names in `--source-dir`: TERC (its ZIP or its CSV) and PRG's administrative units. */
export const PL_TERC_FILES = ["terc.zip", "terc.csv"] as const;
export const PL_PRG_FILE = "prg-jednostki-administracyjne.zip";

/** eTERYT's page of the full files, whose form serves the official TERC file (`ETL_PL_TERC_URL`). */
export const DEFAULT_PL_TERC_URL =
	"https://eteryt.stat.gov.pl/eTeryt/rejestr_teryt/udostepnianie_danych/baza_teryt/uzytkownicy_indywidualni/pobieranie/pliki_pelne.aspx";

/** PRG's administrative units, the shapefiles (about 380 MB, weekly; `ETL_PL_PRG_URL`). */
export const DEFAULT_PL_PRG_URL =
	"https://opendata.geoportal.gov.pl/prg/granice/00_jednostki_administracyjne.zip";

/** Poland's extent, with a margin. */
const BOUNDS = { minLat: 48.9, maxLat: 55.0, minLng: 14.0, maxLng: 24.3 };

type Point = { x: number; y: number };

export type PlUnit = { code: string; name: string };

export type PlPlaceSources = {
	/** The date TERC is of (`2026-01-01`), when it says. */
	asOf: string | null;
	voivodeships: PlUnit[];
	/** Powiats, named the way people say them, with their voivodeship; a city with powiat rights is `urban`. */
	powiats: (PlUnit & { voivodeship: string; urban: boolean })[];
	/** Gminas (seven-digit codes, kinds 1, 2, 3), with their powiat and voivodeship and point. */
	gminas: (PlUnit & {
		powiat: string;
		voivodeship: string;
		kind: "1" | "2" | "3";
		longitude: number | null;
		latitude: number | null;
	})[];
};

/** The words of a gmina's kind, as TERC's `NAZWA_DOD` writes them. */
const GMINA_KINDS: Readonly<Record<string, "1" | "2" | "3">> = {
	"1": "1",
	"2": "2",
	"3": "3",
};

const clean = (value: string | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

/**
 * A powiat's name the way people say it: a city with powiat rights by its city (`Kraków`), any
 * other powiat with the word (`powiat krakowski`), as TERC writes the word apart.
 */
export function powiatName(name: string, kind: string): string {
	const text = clean(name);
	if (/na prawach powiatu/i.test(kind)) return text;
	return /^powiat\b/i.test(text) ? text : `powiat ${text}`;
}

/** Reads TERC's CSV (`WOJ;POW;GMI;RODZ;NAZWA;NAZWA_DOD;STAN_NA`). Throws on any other file. */
export function parseTerc(csv: string): Omit<PlPlaceSources, "gminas"> & {
	gminas: (PlUnit & { powiat: string; voivodeship: string; kind: "1" | "2" | "3" })[];
} {
	const lines = csv.replace(/^﻿/, "").split(/\r?\n/);
	const header = (parseQuotedRecord(lines[0] ?? "", ";") ?? []).map((name) => clean(name));
	const at = (name: string) => header.indexOf(name);
	const columns = ["WOJ", "POW", "GMI", "RODZ", "NAZWA", "NAZWA_DOD", "STAN_NA"].map(at);
	if (columns.some((index) => index < 0)) {
		throw new Error(`not TERC: header ${header.join(";")}`);
	}
	const [woj, pow, gmi, rodz, nazwa, dod, stan] = columns as [
		number,
		number,
		number,
		number,
		number,
		number,
		number,
	];
	const result: ReturnType<typeof parseTerc> = {
		asOf: null,
		voivodeships: [],
		powiats: [],
		gminas: [],
	};
	for (const line of lines.slice(1)) {
		if (!line.trim()) continue;
		const fields = parseQuotedRecord(line, ";");
		if (!fields) continue;
		const w = clean(fields[woj]);
		const p = clean(fields[pow]);
		const g = clean(fields[gmi]);
		const r = clean(fields[rodz]);
		const name = clean(fields[nazwa]);
		const kind = clean(fields[dod]);
		const date = clean(fields[stan]);
		if (!result.asOf && /^\d{4}-\d{2}-\d{2}$/.test(date)) result.asOf = date;
		if (!/^\d{2}$/.test(w) || !PL_VOIVODESHIPS[w] || !name) continue;
		if (!p) {
			result.voivodeships.push({ code: w, name: PL_VOIVODESHIPS[w] });
		} else if (/^\d{2}$/.test(p) && !g) {
			result.powiats.push({
				code: `${w}${p}`,
				name: powiatName(name, kind),
				voivodeship: w,
				urban: /na prawach powiatu/i.test(kind),
			});
		} else if (/^\d{2}$/.test(p) && /^\d{2}$/.test(g) && GMINA_KINDS[r]) {
			result.gminas.push({
				code: `${w}${p}${g}${r}`,
				name,
				powiat: `${w}${p}`,
				voivodeship: w,
				kind: GMINA_KINDS[r] as "1" | "2" | "3",
			});
		}
	}
	if (
		result.voivodeships.length === 0 ||
		result.powiats.length === 0 ||
		result.gminas.length === 0
	) {
		throw new Error(
			`not TERC: ${result.voivodeships.length} voivodeships, ${result.powiats.length} powiats, ${result.gminas.length} gminas`,
		);
	}
	return result;
}

/** The CSV of TERC from its ZIP (`TERC_Urzedowy_2026-11-27.zip`), or the CSV itself. */
export function tercCsv(data: Buffer): string {
	if (data.readUInt32LE(0) !== 0x04034b50) return data.toString("utf8");
	const [entry] = readZipEntries(data, (name) => /\.csv$/i.test(name));
	if (!entry) throw new Error("not TERC: no CSV in the archive");
	return entry.data.toString("utf8");
}

/** Twice the signed area of a ring. */
function ringArea(ring: ShpRing): number {
	let area = 0;
	for (let index = 0; index < ring.length - 1; index++) {
		const a = ring[index];
		const b = ring[index + 1];
		if (a && b) area += a.x * b.y - b.x * a.y;
	}
	return area;
}

function ringCentroid(ring: ShpRing): Point | null {
	const doubleArea = ringArea(ring);
	if (doubleArea === 0) return null;
	let x = 0;
	let y = 0;
	for (let index = 0; index < ring.length - 1; index++) {
		const a = ring[index];
		const b = ring[index + 1];
		if (!a || !b) continue;
		const cross = a.x * b.y - b.x * a.y;
		x += (a.x + b.x) * cross;
		y += (a.y + b.y) * cross;
	}
	return { x: x / (3 * doubleArea), y: y / (3 * doubleArea) };
}

/** Where a horizontal line crosses the edges of every ring of a polygon (x values, sorted). */
function crossings(rings: readonly ShpRing[], y: number): number[] {
	const xs: number[] = [];
	for (const ring of rings) {
		for (let index = 0; index < ring.length - 1; index++) {
			const a = ring[index];
			const b = ring[index + 1];
			if (!a || !b) continue;
			if (a.y > y !== b.y > y) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
		}
	}
	return xs.sort((p, q) => p - q);
}

/**
 * A point inside a gmina: the centroid of its largest ring when it lies inside the gmina (its
 * holes counted: a rural gmina often surrounds the town of the same name, whose centre is the
 * hole's), else the middle of the widest stretch of the gmina on the centroid's latitude.
 */
export function gminaPoint(rings: readonly ShpRing[]): Point | null {
	let largest: ShpRing | null = null;
	let largestArea = 0;
	for (const ring of rings) {
		const area = Math.abs(ringArea(ring));
		if (area > largestArea) {
			largest = ring;
			largestArea = area;
		}
	}
	if (!largest) return null;
	const centroid = ringCentroid(largest);
	if (!centroid) return null;
	const xs = crossings(rings, centroid.y);
	let inside = false;
	for (const x of xs) if (x < centroid.x) inside = !inside;
	if (inside) return centroid;
	let best: Point | null = null;
	let width = 0;
	for (let index = 0; index + 1 < xs.length; index += 2) {
		const from = xs[index] ?? 0;
		const to = xs[index + 1] ?? 0;
		if (to - from > width) {
			width = to - from;
			best = { x: (from + to) / 2, y: centroid.y };
		}
	}
	return best ?? centroid;
}

/**
 * The interior point of every gmina of PRG's administrative units (`A03_Granice_gmin`), by its
 * TERYT code, in ETRS89 degrees (WGS 84 within a metre). Throws when the layer is missing.
 */
export function parsePrgGminas(
	archive: Buffer,
): Map<string, { longitude: number; latitude: number }> {
	const entries = readZipEntries(archive, (name) =>
		/(?:^|\/)A03_Granice_gmin\.(?:dbf|shp)$/i.test(name),
	);
	const dbf = entries.find((entry) => /\.dbf$/i.test(entry.name));
	const shp = entries.find((entry) => /\.shp$/i.test(entry.name));
	if (!dbf || !shp) throw new Error("not PRG's administrative units: no A03_Granice_gmin layer");
	const { records } = readDbf(dbf.data);
	const shapes = readShpPolygons(shp.data);
	if (records.length !== shapes.length) {
		throw new Error(`PRG: ${records.length} gminas but ${shapes.length} shapes`);
	}
	if (records[0] && !("JPT_KOD_JE" in records[0])) {
		throw new Error("not PRG's administrative units: no JPT_KOD_JE column");
	}
	const points = new Map<string, { longitude: number; latitude: number }>();
	records.forEach((record, index) => {
		const code = clean(record.JPT_KOD_JE);
		const rings = shapes[index];
		const point = rings ? gminaPoint(rings) : null;
		if (
			!/^\d{7}$/.test(code) ||
			!point ||
			point.y < BOUNDS.minLat ||
			point.y > BOUNDS.maxLat ||
			point.x < BOUNDS.minLng ||
			point.x > BOUNDS.maxLng
		) {
			return;
		}
		points.set(code, { longitude: point.x, latitude: point.y });
	});
	return points;
}

/** TERC's gminas with PRG's points. */
export function combinePlPlaces(
	terc: ReturnType<typeof parseTerc>,
	points: ReadonlyMap<string, { longitude: number; latitude: number }>,
): PlPlaceSources {
	return {
		...terc,
		gminas: terc.gminas.map((gmina) => {
			const point = points.get(gmina.code);
			return { ...gmina, longitude: point?.longitude ?? null, latitude: point?.latitude ?? null };
		}),
	};
}

/**
 * The name of each gmina: TERC's, and its kind after it for a rural gmina named like another
 * gmina of its powiat (`Bolesławiec (gmina wiejska)`), so two places never read the same.
 */
export function gminaNames(gminas: PlPlaceSources["gminas"]): Map<string, string> {
	const byPowiat = new Map<string, Map<string, number>>();
	for (const gmina of gminas) {
		const counts = byPowiat.get(gmina.powiat) ?? new Map<string, number>();
		counts.set(gmina.name, (counts.get(gmina.name) ?? 0) + 1);
		byPowiat.set(gmina.powiat, counts);
	}
	const names = new Map<string, string>();
	for (const gmina of gminas) {
		const shared = (byPowiat.get(gmina.powiat)?.get(gmina.name) ?? 0) > 1;
		names.set(
			gmina.code,
			shared && gmina.kind === "2" ? `${gmina.name} (gmina wiejska)` : gmina.name,
		);
	}
	return names;
}

/**
 * The place rows of Poland. Existing slugs are kept; a renamed place gets a new slug and keeps
 * the old one as an alias, as in the other markets. Powiats and voivodeships share one slug
 * space (their pages are listings: `krakow` the city, `powiat-krakowski`, `malopolskie`), powiats
 * first; a gmina's slug is unique within its powiat (`-{code}` on a collision).
 */
export function buildPlPlaceRows(sources: PlPlaceSources, existing: ExistingPlace[]): PlaceRow[] {
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
	const topSlug = (kind: PlaceRow["kind"], code: string, name: string, slugName = name) =>
		keep(kind, code, name, () => {
			const base = slugifyPl(slugName) || code;
			const slug = topTaken.has(base) ? `${base}-${code}` : base;
			topTaken.add(slug);
			return slug;
		});
	const localSlug = (code: string, name: string, powiat: string) =>
		keep("commune", code, name, () => {
			const set = localTaken.get(powiat) ?? new Set<string>();
			localTaken.set(powiat, set);
			const base = slugifyPl(name) || code;
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
	for (const powiat of [...sources.powiats].sort((a, b) => a.code.localeCompare(b.code))) {
		const { slug, previous } = topSlug("department", powiat.code, powiat.name);
		rows.push({
			...base,
			kind: "department",
			code: powiat.code,
			name: powiat.name,
			slug,
			department_code: powiat.code,
			region_code: powiat.voivodeship,
			parent_kind: "region",
			parent_code: powiat.voivodeship,
			previous_slug: previous,
		});
	}
	for (const voivodeship of [...sources.voivodeships].sort((a, b) =>
		a.code.localeCompare(b.code),
	)) {
		// Named in full (`województwo małopolskie`), slugged by its adjective (`malopolskie`).
		const name = `województwo ${voivodeship.name}`;
		const { slug, previous } = topSlug("region", voivodeship.code, name, voivodeship.name);
		rows.push({
			...base,
			kind: "region",
			code: voivodeship.code,
			name,
			slug,
			department_code: null,
			region_code: voivodeship.code,
			previous_slug: previous,
		});
	}
	const names = gminaNames(sources.gminas);
	for (const gmina of [...sources.gminas].sort((a, b) => a.code.localeCompare(b.code))) {
		const name = names.get(gmina.code) ?? gmina.name;
		const { slug, previous } = localSlug(gmina.code, name, gmina.powiat);
		rows.push({
			...base,
			kind: "commune",
			code: gmina.code,
			name,
			slug,
			department_code: gmina.powiat,
			region_code: gmina.voivodeship,
			parent_kind: "department",
			parent_code: gmina.powiat,
			longitude: gmina.longitude,
			latitude: gmina.latitude,
			previous_slug: previous,
		});
	}
	return rows;
}

/** Upserts Poland's places (country `PL`); no other market's are read or touched. */
export async function importPlPlaces(
	sql: Sql,
	sources: PlPlaceSources,
	runId: number,
): Promise<PlacesStats & { located: number; asOf: string | null }> {
	let communes = 0;
	const stats = await writePlaces(
		sql,
		"PL",
		(existing) => {
			const rows = buildPlPlaceRows(sources, existing);
			communes = rows.filter((row) => row.kind === "commune").length;
			return rows;
		},
		runId,
		{ regions: sources.voivodeships.length, communes: 0, arrondissements: 0 },
	);
	return {
		...stats,
		communes,
		located: sources.gminas.filter((gmina) => gmina.longitude !== null).length,
		asOf: sources.asOf,
	};
}

/** Reads TERC and PRG from `--source-dir` (`terc.zip` or `terc.csv`, and PRG's ZIP). */
export async function readPlPlaceSources(dir: string): Promise<PlPlaceSources> {
	let terc: Buffer | null = null;
	for (const name of PL_TERC_FILES) {
		terc = await readFile(join(dir, name)).catch(() => null);
		if (terc) break;
	}
	if (!terc) throw new Error(`no ${PL_TERC_FILES.join(" or ")} in ${dir}`);
	const points = parsePrgGminas(await readFile(join(dir, PL_PRG_FILE)));
	return combinePlPlaces(parseTerc(tercCsv(terc)), points);
}

/**
 * TERC's official file, the way eTERYT's page serves it to its "Pobierz" button: the page is
 * read for its form state, then posted back for the TERC download. A URL that is not eTERYT's
 * page (`ETL_PL_TERC_URL` pointing at a copy) is downloaded as is.
 */
export async function fetchTerc(url: string): Promise<Buffer> {
	const headers = { "user-agent": USER_AGENT };
	const page = await fetch(url, { headers, signal: AbortSignal.timeout(60_000) });
	if (!page.ok) throw new Error(`GET ${url} answered ${page.status}`);
	const type = page.headers.get("content-type") ?? "";
	if (!type.includes("html")) return Buffer.from(await page.arrayBuffer());
	const html = await page.text();
	const form = new URLSearchParams();
	for (const match of html.matchAll(/<input\b[^>]*>/gi)) {
		const tag = match[0];
		const name = /\bname="([^"]*)"/i.exec(tag)?.[1];
		if (!name) continue;
		const typeAttribute = /\btype="([^"]*)"/i.exec(tag)?.[1]?.toLowerCase() ?? "text";
		if (typeAttribute !== "hidden" && typeAttribute !== "text") continue;
		const value = /\bvalue="([^"]*)"/i.exec(tag)?.[1] ?? "";
		// One pass over the entities, so a decoded `&amp;` is never decoded again.
		const ENTITIES: Record<string, string> = {
			"&amp;": "&",
			"&quot;": '"',
			"&#39;": "'",
			"&lt;": "<",
			"&gt;": ">",
		};
		form.set(
			name,
			value.replace(/&(?:amp|quot|#39|lt|gt);/g, (entity) => ENTITIES[entity] ?? entity),
		);
	}
	if (!form.has("__VIEWSTATE")) throw new Error(`${url}: not eTERYT's download page`);
	form.set("__EVENTTARGET", "ctl00$body$BTERCUrzedowyPobierz");
	form.set("__EVENTARGUMENT", "");
	const cookie = (page.headers.getSetCookie?.() ?? [])
		.map((value) => value.split(";")[0])
		.join("; ");
	const response = await fetch(url, {
		method: "POST",
		headers: {
			...headers,
			"content-type": "application/x-www-form-urlencoded",
			...(cookie ? { cookie } : {}),
		},
		body: form.toString(),
		signal: AbortSignal.timeout(120_000),
	});
	if (!response.ok) throw new Error(`POST ${url} answered ${response.status}`);
	const data = Buffer.from(await response.arrayBuffer());
	if (data.length < 4 || data.readUInt32LE(0) !== 0x04034b50) {
		throw new Error(`${url}: the TERC download is not a ZIP`);
	}
	return data;
}

/** Downloads TERC and PRG's administrative units (about 380 MB) to `dir` and reads them. */
export async function fetchPlPlaceSources(
	urls: { terc: string; prg: string },
	dir: string,
): Promise<PlPlaceSources> {
	const terc = await fetchTerc(urls.terc);
	const prg = await downloadFile({
		key: "prg",
		url: urls.prg,
		path: join(dir, PL_PRG_FILE),
		text: false,
	});
	return combinePlPlaces(parseTerc(tercCsv(terc)), parsePrgGminas(await readFile(prg.path)));
}
