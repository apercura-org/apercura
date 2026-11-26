/**
 * Switzerland's places from two open federal sources:
 * - the Federal Statistical Office's official commune register (Amtliches Gemeindeverzeichnis,
 *   "Open use"), read on the day of the import from its API as one CSV: the 26 cantons (level 1),
 *   the districts (level 2: Bezirke, districts, distretti, Verwaltungskreise, and a stand-in
 *   "Kanton Zug" for each canton without districts) and the communes (level 3), with their BFS
 *   numbers and official names;
 * - swisstopo's official directory of localities with their postcodes ("Amtliches
 *   Ortschaftenverzeichnis mit Postleitzahl und Perimeter", free geodata with the source), in
 *   WGS 84: each part of a postcode's locality in a commune, with a point and its share of the
 *   addresses.
 *
 * Cantons are regions (code: the abbreviation, `ZH`), districts departments (their BFS number),
 * communes communes (their BFS number). A place keeps its official name in every language of
 * the market ("Genève", "Biel/Bienne", "Bern / Berne"); a canton's slug is its first name
 * (`bern`, `valais`), umlauts spelled out (`zuerich`). A commune's point is that of its largest
 * part in the postcode directory; districts and cantons take the centre of their communes'.
 * Facilities are located with the same directory (`ChLocator`): by postcode and locality, at the
 * locality's point. Run once, then each January (`etl:places --country ch`).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { slugifyDe } from "@apercura/core";
import { CH_CANTONS } from "@apercura/core/country";
import type { Sql } from "../../lib/db";
import { downloadFile } from "../../lib/files";
import { type ExistingPlace, type PlaceRow, type PlacesStats, writePlaces } from "../../lib/places";
import { parseQuotedRecord } from "../../lib/text";
import { readZipEntries } from "../../lib/zip";
import { localityKey } from "./names";
import { CH_COMMUNES_FILE, CH_POSTCODES, chCommunesUrl } from "./sources";

export type ChCanton = { code: string; number: string; name: string };
export type ChDistrict = { code: string; name: string; canton: string };
export type ChCommune = { code: string; name: string; district: string; canton: string };

export type ChCommuneRegister = {
	cantons: ChCanton[];
	districts: ChDistrict[];
	communes: ChCommune[];
};

/** A part of a postcode's locality in one commune (swisstopo's directory). */
export type ChPostcodePart = {
	postcode: string;
	locality: string;
	communeCode: string;
	communeName: string;
	canton: string;
	/** Share of the postcode's addresses in this part, 0–100. */
	share: number;
	longitude: number;
	latitude: number;
};

/** The columns read from the commune register. */
const REGISTER_COLUMNS = ["HistoricalCode", "BfsCode", "Level", "Parent", "Name", "ShortName"];
/** The columns read from the postcode directory. */
const POSTCODE_COLUMNS = [
	"Ortschaftsname",
	"PLZ4",
	"Gemeindename",
	"BFS-Nr",
	"Kantonskürzel",
	"Adressenanteil",
	"E",
	"N",
];

/** The header's index of each column; throws naming the missing ones. */
function columnsOf(header: readonly string[], wanted: readonly string[], file: string) {
	const index = new Map<string, number>();
	const missing: string[] = [];
	for (const column of wanted) {
		const at = header.findIndex((cell) => cell.trim() === column);
		if (at < 0) missing.push(column);
		else index.set(column, at);
	}
	if (missing.length > 0) throw new Error(`${file}: missing columns ${missing.join(", ")}`);
	return (cells: readonly string[], column: string) =>
		(cells[index.get(column) ?? -1] ?? "").trim();
}

const linesOf = (text: string) =>
	text
		.replace(/^\ufeff/, "")
		.split(/\r?\n/)
		.filter((line) => line.trim() !== "");

/**
 * Reads the commune register's snapshot (CSV): cantons, districts and communes. A district's
 * `Parent` is its canton's historical code, a commune's its district's (historical codes are
 * unique within a level only).
 */
export function parseCommuneRegister(text: string): ChCommuneRegister {
	const [headerLine, ...lines] = linesOf(text);
	const cell = columnsOf(parseQuotedRecord(headerLine ?? "", ",") ?? [], REGISTER_COLUMNS, "BFS");
	const cantonsByHistorical = new Map<string, ChCanton>();
	const districtRows: { historical: string; code: string; name: string; parent: string }[] = [];
	const communeRows: { code: string; name: string; parent: string }[] = [];
	for (const line of lines) {
		const cells = parseQuotedRecord(line, ",");
		if (!cells) continue;
		const level = cell(cells, "Level");
		const historical = cell(cells, "HistoricalCode");
		const code = cell(cells, "BfsCode");
		const name = cell(cells, "Name");
		if (level === "1") {
			const abbreviation = cell(cells, "ShortName").toUpperCase();
			if (CH_CANTONS[abbreviation]) {
				cantonsByHistorical.set(historical, { code: abbreviation, number: code, name });
			}
		} else if (level === "2") {
			districtRows.push({ historical, code, name, parent: cell(cells, "Parent") });
		} else if (level === "3") {
			communeRows.push({ code, name, parent: cell(cells, "Parent") });
		}
	}
	const districtsByHistorical = new Map<string, ChDistrict>();
	for (const row of districtRows) {
		const canton = cantonsByHistorical.get(row.parent);
		if (!canton || !/^\d+$/.test(row.code)) continue;
		districtsByHistorical.set(row.historical, {
			code: row.code,
			name: row.name,
			canton: canton.code,
		});
	}
	const communes: ChCommune[] = [];
	for (const row of communeRows) {
		const district = districtsByHistorical.get(row.parent);
		if (!district || !/^\d+$/.test(row.code)) continue;
		communes.push({
			code: row.code,
			name: row.name,
			district: district.code,
			canton: district.canton,
		});
	}
	if (cantonsByHistorical.size !== 26) {
		throw new Error(`BFS: ${cantonsByHistorical.size} cantons, 26 expected`);
	}
	return {
		cantons: [...cantonsByHistorical.values()],
		districts: [...districtsByHistorical.values()],
		communes,
	};
}

/**
 * Reads swisstopo's postcode directory (the CSV of its WGS 84 ZIP, `;`-separated): the parts of
 * Swiss localities; Liechtenstein's (no canton) and the territories outside a commune are left
 * out.
 */
export function parsePostcodeDirectory(archive: Buffer): ChPostcodePart[] {
	const [entry] = readZipEntries(archive, (name) => /\.csv$/i.test(name));
	if (!entry) throw new Error("postcode directory: no CSV in the archive");
	const [headerLine, ...lines] = linesOf(entry.data.toString("utf8"));
	const cell = columnsOf(parseQuotedRecord(headerLine ?? "", ";") ?? [], POSTCODE_COLUMNS, "PLZ");
	const parts: ChPostcodePart[] = [];
	for (const line of lines) {
		const cells = parseQuotedRecord(line, ";");
		if (!cells) continue;
		const canton = cell(cells, "Kantonskürzel").toUpperCase();
		const communeCode = cell(cells, "BFS-Nr");
		const postcode = cell(cells, "PLZ4");
		const longitude = Number(cell(cells, "E"));
		const latitude = Number(cell(cells, "N"));
		if (!CH_CANTONS[canton] || !/^\d+$/.test(communeCode) || !/^[1-9]\d{3}$/.test(postcode))
			continue;
		if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;
		parts.push({
			postcode,
			locality: cell(cells, "Ortschaftsname"),
			communeCode,
			communeName: cell(cells, "Gemeindename"),
			canton,
			share: Number(cell(cells, "Adressenanteil").replace(/[^\d.]/g, "")) || 0,
			longitude,
			latitude,
		});
	}
	return parts;
}

export type ChPlaceSources = { register: ChCommuneRegister; postcodes: ChPostcodePart[] };

/** Reads both files from `--source-dir` (`bfs-gemeinden.csv`, `plz.zip`). */
export async function readChPlaceSources(dir: string): Promise<ChPlaceSources> {
	return {
		register: parseCommuneRegister(await readFile(join(dir, CH_COMMUNES_FILE), "utf8")),
		postcodes: parsePostcodeDirectory(await readFile(join(dir, CH_POSTCODES.file))),
	};
}

/** `DD-MM-YYYY` of a day, as the register's API asks for it. */
export const registerDay = (day: string) => day.split("-").reverse().join("-");

/** Downloads the register (on `day`, `YYYY-MM-DD`) and the postcode directory to `dir`. */
export async function fetchChPlaceSources(
	dir: string,
	day: string,
	urls: { communes?: string; postcodes?: string } = {},
): Promise<ChPlaceSources> {
	const register = await downloadFile({
		key: "ch-bfs-gemeinden",
		url: urls.communes || chCommunesUrl(registerDay(day)),
		path: join(dir, CH_COMMUNES_FILE),
		text: true,
	});
	if (register.bytes < 10_000) throw new Error(`BFS commune register: ${register.bytes} bytes`);
	const postcodes = await downloadFile({
		key: "ch-swisstopo-plz",
		url: urls.postcodes || CH_POSTCODES.url,
		path: join(dir, CH_POSTCODES.file),
		text: false,
	});
	if (postcodes.bytes < CH_POSTCODES.minBytes) {
		throw new Error(`swisstopo's postcode directory: ${postcodes.bytes} bytes`);
	}
	return readChPlaceSources(dir);
}

type Point = { longitude: number; latitude: number };

const centre = (points: readonly Point[]): Point | null =>
	points.length === 0
		? null
		: {
				longitude: points.reduce((sum, point) => sum + point.longitude, 0) / points.length,
				latitude: points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
			};

/** A canton's slug: its first official name (`Bern / Berne` → `bern`), umlauts spelled out. */
export const cantonSlug = (name: string) => slugifyDe(name.split("/")[0] ?? name);

/**
 * The place rows of Switzerland. Existing slugs are kept; a renamed place gets a new slug and
 * keeps the old one as an alias, as in the other markets. Cantons and districts share one slug
 * space; a commune's slug is unique within its district (`-{code}` on a collision).
 */
export function buildChPlaceRows(sources: ChPlaceSources, existing: ExistingPlace[]): PlaceRow[] {
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
	const topSlug = (kind: PlaceRow["kind"], code: string, name: string, base: string) =>
		keep(kind, code, name, () => {
			const slug = topTaken.has(base) ? `${base}-${code.toLowerCase()}` : base;
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

	// A commune's point: its largest part of the postcode directory; its postcodes: all of them.
	const parts = new Map<string, ChPostcodePart[]>();
	for (const part of sources.postcodes) {
		const list = parts.get(part.communeCode) ?? [];
		list.push(part);
		parts.set(part.communeCode, list);
	}
	const communePoint = new Map<string, Point>();
	for (const [code, list] of parts) {
		const largest = [...list].sort(
			(a, b) => b.share - a.share || a.postcode.localeCompare(b.postcode),
		)[0];
		if (largest)
			communePoint.set(code, { longitude: largest.longitude, latitude: largest.latitude });
	}

	const register = sources.register;
	const byNumber = (a: { code: string }, b: { code: string }) => Number(a.code) - Number(b.code);
	const communes = [...register.communes].sort(byNumber);
	const pointsOf = (filter: (commune: ChCommune) => boolean) =>
		communes.filter(filter).flatMap((commune) => {
			const point = communePoint.get(commune.code);
			return point ? [point] : [];
		});

	const rows: PlaceRow[] = [];
	const row = (
		kind: PlaceRow["kind"],
		code: string,
		name: string,
		slug: { slug: string; previous: string | null },
		department: string | null,
		region: string,
		parent: { kind: string; code: string } | null,
		point: Point | null | undefined,
		postcodes: string[] = [],
	): PlaceRow => ({
		kind,
		code,
		name,
		slug: slug.slug,
		department_code: department,
		region_code: region,
		parent_kind: parent?.kind ?? null,
		parent_code: parent?.code ?? null,
		longitude: point?.longitude ?? null,
		latitude: point?.latitude ?? null,
		population: null,
		postcodes,
		previous_slug: slug.previous,
	});
	const cantons = [...register.cantons].sort((a, b) => Number(a.number) - Number(b.number));
	for (const canton of cantons) {
		rows.push(
			row(
				"region",
				canton.code,
				canton.name,
				topSlug(
					"region",
					canton.code,
					canton.name,
					cantonSlug(canton.name) || canton.code.toLowerCase(),
				),
				null,
				canton.code,
				null,
				centre(pointsOf((commune) => commune.canton === canton.code)),
			),
		);
	}
	const districts = [...register.districts].sort(byNumber);
	const known = new Set<string>();
	for (const district of districts) {
		known.add(district.code);
		rows.push(
			row(
				"department",
				district.code,
				district.name,
				topSlug(
					"department",
					district.code,
					district.name,
					slugifyDe(district.name) || district.code,
				),
				district.code,
				district.canton,
				{ kind: "region", code: district.canton },
				centre(pointsOf((commune) => commune.district === district.code)),
			),
		);
	}
	for (const commune of communes) {
		if (!known.has(commune.district)) continue;
		const postcodes = [
			...new Set((parts.get(commune.code) ?? []).map((part) => part.postcode)),
		].sort();
		rows.push(
			row(
				"commune",
				commune.code,
				commune.name,
				localSlug(commune.code, commune.name, commune.district),
				commune.district,
				commune.canton,
				{ kind: "department", code: commune.district },
				communePoint.get(commune.code),
				postcodes,
			),
		);
	}
	return rows;
}

/** Upserts Switzerland's places (country `CH`); no other market's are read or touched. */
export async function importChPlaces(
	sql: Sql,
	sources: ChPlaceSources,
	runId: number,
): Promise<PlacesStats> {
	let communes = 0;
	const stats = await writePlaces(
		sql,
		"CH",
		(existing) => {
			const rows = buildChPlaceRows(sources, existing);
			communes = rows.filter((row) => row.kind === "commune").length;
			return rows;
		},
		runId,
		{ regions: sources.register.cantons.length, communes: 0, arrondissements: 0 },
	);
	return { ...stats, communes };
}

export type ChLocation = {
	communeCode: string;
	canton: string;
	postcode: string;
	locality: string;
	point: Point;
	/** `address` for the list's own coordinates, `city` for the locality's point. */
	precision: "address" | "city";
	/** How the commune was found. */
	by: "commune" | "postcode" | "locality" | "point" | "neighbour";
};

const distance = (a: Point, b: Point) => {
	const dx = (a.longitude - b.longitude) * Math.cos((a.latitude * Math.PI) / 180);
	const dy = a.latitude - b.latitude;
	return dx * dx + dy * dy;
};

/**
 * Locates a facility with swisstopo's postcode directory: its commune, and its point (its list's
 * own, else its locality's).
 * - a list that gives the commune number (Basel-Landschaft's homes): that commune, at the part
 *   of its postcode in it;
 * - a postcode: the part whose locality or commune is the list's locality, else the part
 *   nearest the list's point, else the postcode's largest part;
 * - a postcode the directory does not know (a post-office box's, `5401 Baden`, `3000 Bern 60`):
 *   the part of the list's canton whose locality or commune is the list's locality (its box
 *   number dropped), nearest the list's point or largest;
 * - no postcode (Geneva's hospitals): the part nearest the list's point in the list's canton;
 * - else a postcode of its own (`8058 Zürich-Flughafen`): the largest part of the canton's
 *   postcodes that share its first three digits.
 */
export class ChLocator {
	private readonly byPostcode = new Map<string, ChPostcodePart[]>();
	private readonly byCanton = new Map<string, ChPostcodePart[]>();

	constructor(parts: readonly ChPostcodePart[]) {
		for (const part of parts) {
			const list = this.byPostcode.get(part.postcode) ?? [];
			list.push(part);
			this.byPostcode.set(part.postcode, list);
			const canton = this.byCanton.get(part.canton) ?? [];
			canton.push(part);
			this.byCanton.set(part.canton, canton);
		}
	}

	locate(facility: {
		postcode: string | null;
		locality: string;
		communeCode: string | null;
		cantonCode: string;
		latitude: number | null;
		longitude: number | null;
	}): ChLocation | null {
		const own =
			facility.latitude !== null && facility.longitude !== null
				? { latitude: facility.latitude, longitude: facility.longitude }
				: null;
		const at = (part: ChPostcodePart, by: ChLocation["by"]): ChLocation => ({
			communeCode: part.communeCode,
			canton: part.canton,
			postcode: part.postcode,
			locality: part.locality,
			point: own ?? { longitude: part.longitude, latitude: part.latitude },
			precision: own ? "address" : "city",
			by,
		});
		const nearest = (list: readonly ChPostcodePart[], point: Point) =>
			[...list].sort((a, b) => distance(a, point) - distance(b, point))[0];
		const parts = facility.postcode ? (this.byPostcode.get(facility.postcode) ?? []) : [];
		if (facility.communeCode) {
			const inCommune = parts.filter((part) => part.communeCode === facility.communeCode);
			const part = own && inCommune.length > 1 ? nearest(inCommune, own) : inCommune[0];
			if (part) return at(part, "commune");
		}
		if (parts.length > 0) {
			const key = localityKey(facility.locality);
			const named = key
				? parts.filter(
						(part) => localityKey(part.locality) === key || localityKey(part.communeName) === key,
					)
				: [];
			const candidates = named.length > 0 ? named : parts;
			const part = own
				? nearest(candidates, own)
				: [...candidates].sort((a, b) => b.share - a.share)[0];
			if (part) return at(part, "postcode");
		}
		const inCanton = this.byCanton.get(facility.cantonCode) ?? [];
		const bare = localityKey(facility.locality.replace(/\s+\d+$/, ""));
		if (bare) {
			const named = inCanton.filter(
				(part) => localityKey(part.locality) === bare || localityKey(part.communeName) === bare,
			);
			const part = own ? nearest(named, own) : [...named].sort((a, b) => b.share - a.share)[0];
			if (part) return at(part, "locality");
		}
		if (own) {
			const part = nearest(inCanton, own);
			if (part) return at(part, "point");
		}
		// A postcode of its own (an airport's, a large company's): its neighbours' largest part.
		if (facility.postcode) {
			const prefix = facility.postcode.slice(0, 3);
			const part = inCanton
				.filter((candidate) => candidate.postcode.startsWith(prefix))
				.sort((a, b) => b.share - a.share)[0];
			if (part) return at(part, "neighbour");
		}
		return null;
	}
}
