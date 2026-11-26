/**
 * Czech places from RÚIAN, the register of territorial identification (ČÚZK): the monthly
 * state file of the basic data set (`{YYYYMMDD}_ST_UZSZ.xml.zip`, exchange format VFR 3.1,
 * open data under CC BY 4.0, „ČÚZK, [rok]“). It names every region (VÚSC), district (okres),
 * municipality (obec) and Prague administrative district (správní obvod) with its code and
 * definition point (EPSG:5514, S-JTSK / Krovak East North), but no boundary.
 *
 * Mapped onto the four kinds of `directory.places`:
 * - the 14 regions (kraje) are regions, coded by NUTS 3 (`CZ010`), with no listing of their own;
 * - the 76 districts (okresy) are departments, coded by LAU 1 (`CZ0201`), and Prague, which has
 *   no district in RÚIAN, is the department `CZ0100` ("Praha") the register and statistics use;
 * - every municipality is a commune of its district (RÚIAN code, `582786`);
 * - Prague's 22 administrative districts (`Praha 1`…`Praha 22`) are arrondissements of the
 *   municipality of Prague (554782), whose city page, like Paris's, is its department's page.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { slugify } from "@apercura/core";
import { PRAGUE_CODE, PRAGUE_DISTRICT_CODE } from "@apercura/core/country";
import type { Sql } from "../../lib/db";
import { downloadFile } from "../../lib/files";
import { type ExistingPlace, type PlaceRow, type PlacesStats, writePlaces } from "../../lib/places";
import { readZipEntries } from "../../lib/zip";

/** File names in `--source-dir`: the XML itself (fixtures) or the published ZIP. */
export const CZ_PLACES_FILES = ["ruian-st-uzsz.xml", "ruian-st-uzsz.xml.zip"] as const;

const RUIAN_BASE = "https://vdp.cuzk.gov.cz/vymenny_format/soucasna/";

/**
 * The state file of the last day of the month before `now`, then of the month before that (the
 * file of a month is published in the night of the 1st): `20261031_ST_UZSZ.xml.zip`.
 */
export function defaultCzPlacesUrls(now: Date = new Date()): string[] {
	const urls: string[] = [];
	for (const back of [0, 1]) {
		const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 0));
		const stamp = `${last.getUTCFullYear()}${String(last.getUTCMonth() + 1).padStart(2, "0")}${String(last.getUTCDate()).padStart(2, "0")}`;
		urls.push(`${RUIAN_BASE}${stamp}_ST_UZSZ.xml.zip`);
	}
	return urls;
}

type Point = { x: number; y: number };

export type CzUnit = {
	code: string;
	name: string;
	/** Definition point, EPSG:5514. */
	point: Point | null;
};

export type CzPlaceSources = {
	/** Regions by RÚIAN code (`19`), with their NUTS code. */
	regions: (CzUnit & { ruianCode: string })[];
	/** Districts, with their NUTS code and their region's RÚIAN code. */
	districts: (CzUnit & { ruianCode: string; regionRuianCode: string })[];
	/** Municipalities, with their district's RÚIAN code (none for Prague). */
	municipalities: (CzUnit & { districtRuianCode: string | null })[];
	/** Prague's administrative districts, with their municipality's code. */
	pragueDistricts: (CzUnit & { municipality: string })[];
	/** Date of the file (`vf:Datum`), when given. */
	date: string | null;
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

const decode = (value: string) =>
	value
		.replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => ENTITIES[name] ?? "")
		.replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
		.trim();

const first = (body: string, pattern: RegExp): string | null => {
	const match = pattern.exec(body);
	return match?.[1] !== undefined ? decode(match[1]) : null;
};

const pointOf = (body: string): Point | null => {
	const match = /<gml:pos>(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)<\/gml:pos>/.exec(body);
	if (!match) return null;
	const x = Number(match[1]);
	const y = Number(match[2]);
	return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
};

/** The bodies of the elements `<vf:{tag} gml:id="…">…</vf:{tag}>`. */
function* elements(xml: string, tag: string): Generator<string> {
	const pattern = new RegExp(`<vf:${tag} gml:id="[^"]*">([\\s\\S]*?)</vf:${tag}>`, "g");
	for (const match of xml.matchAll(pattern)) yield match[1] ?? "";
}

/**
 * Reads the regions, districts, municipalities and Prague districts of a VFR state file.
 * Throws when the file holds none of them (another file, a changed format).
 */
export function parseRuianState(xml: string): CzPlaceSources {
	const regions: CzPlaceSources["regions"] = [];
	for (const body of elements(xml, "Vusc")) {
		const ruianCode = first(body, /<vci:Kod>(\d+)<\/vci:Kod>/);
		const code = first(body, /<vci:NutsLau>(CZ0\d{2})<\/vci:NutsLau>/);
		const name = first(body, /<vci:Nazev>([^<]*)<\/vci:Nazev>/);
		if (ruianCode && code && name) regions.push({ ruianCode, code, name, point: pointOf(body) });
	}
	const districts: CzPlaceSources["districts"] = [];
	for (const body of elements(xml, "Okres")) {
		const ruianCode = first(body, /<oki:Kod>(\d+)<\/oki:Kod>/);
		const code = first(body, /<oki:NutsLau>(CZ0\d{2}[0-9A-F])<\/oki:NutsLau>/);
		const name = first(body, /<oki:Nazev>([^<]*)<\/oki:Nazev>/);
		const regionRuianCode = first(body, /<oki:Vusc>\s*<vci:Kod>(\d+)<\/vci:Kod>/);
		if (ruianCode && code && name && regionRuianCode) {
			districts.push({ ruianCode, code, name, regionRuianCode, point: pointOf(body) });
		}
	}
	const municipalities: CzPlaceSources["municipalities"] = [];
	for (const body of elements(xml, "Obec")) {
		const code = first(body, /<obi:Kod>(\d+)<\/obi:Kod>/);
		const name = first(body, /<obi:Nazev>([^<]*)<\/obi:Nazev>/);
		const districtRuianCode = first(body, /<obi:Okres>\s*<oki:Kod>(\d+)<\/oki:Kod>/);
		if (code && name) municipalities.push({ code, name, districtRuianCode, point: pointOf(body) });
	}
	const pragueDistricts: CzPlaceSources["pragueDistricts"] = [];
	for (const body of elements(xml, "SpravniObvod")) {
		const code = first(body, /<spi:Kod>(\d+)<\/spi:Kod>/);
		const name = first(body, /<spi:Nazev>([^<]*)<\/spi:Nazev>/);
		const municipality = first(body, /<spi:Obec>\s*<obi:Kod>(\d+)<\/obi:Kod>/);
		if (code && name && municipality) {
			pragueDistricts.push({ code, name, municipality, point: pointOf(body) });
		}
	}
	if (regions.length === 0 || districts.length === 0 || municipalities.length === 0) {
		throw new Error(
			`not a RÚIAN state file: ${regions.length} regions, ${districts.length} districts, ${municipalities.length} municipalities`,
		);
	}
	return {
		regions,
		districts,
		municipalities,
		pragueDistricts,
		date: first(xml.slice(0, 4_000), /<vf:Datum>([^<]+)<\/vf:Datum>/),
	};
}

/** The XML of a state file: the file itself, or the one XML entry of its ZIP. */
export function ruianXml(data: Buffer): string {
	const isZip = data.length > 4 && data.readUInt32LE(0) === 0x04034b50;
	if (!isZip) return data.toString("utf8");
	const [entry] = readZipEntries(data, (name) => name.toLowerCase().endsWith(".xml"));
	if (!entry) throw new Error("the RÚIAN archive holds no XML file");
	return entry.data.toString("utf8");
}

/** Reads the state file of `--source-dir` (the XML, else the ZIP). */
export async function readCzPlaceSources(dir: string): Promise<CzPlaceSources> {
	for (const name of CZ_PLACES_FILES) {
		try {
			return parseRuianState(ruianXml(await readFile(join(dir, name))));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}
	throw new Error(`no RÚIAN state file in ${dir} (${CZ_PLACES_FILES.join(" or ")})`);
}

/** Downloads the state file, trying each URL in turn (the latest month first). */
export async function fetchCzPlaceSources(
	urls: readonly string[],
	workDir: string,
): Promise<CzPlaceSources> {
	let lastError: unknown;
	for (const url of urls) {
		try {
			const file = await downloadFile({
				key: "cz-places",
				url,
				path: join(workDir, CZ_PLACES_FILES[1]),
				text: false,
				attempts: 2,
			});
			return parseRuianState(ruianXml(await readFile(file.path)));
		} catch (error) {
			lastError = error;
		}
	}
	throw new Error(`the RÚIAN state file could not be read from ${urls.join(", ")}`, {
		cause: lastError,
	});
}

type Located = { longitude: number; latitude: number };

/** Transforms the definition points from S-JTSK (EPSG:5514) to WGS 84 in PostGIS, by key. */
async function locate(sql: Sql, points: Map<string, Point>): Promise<Map<string, Located>> {
	const located = new Map<string, Located>();
	const entries = [...points.entries()].map(([key, point]) => ({ key, x: point.x, y: point.y }));
	for (let index = 0; index < entries.length; index += 5_000) {
		const chunk = JSON.stringify(entries.slice(index, index + 5_000));
		const rows = await sql<{ key: string; longitude: number; latitude: number }[]>`
			SELECT r.key, ST_X(t.geom) AS longitude, ST_Y(t.geom) AS latitude
			FROM jsonb_to_recordset(${chunk}::text::jsonb) AS r (key text, x double precision, y double precision)
			CROSS JOIN LATERAL (
				SELECT ST_Transform(ST_SetSRID(ST_MakePoint(r.x, r.y), 5514), 4326) AS geom
			) t
		`;
		for (const row of rows) {
			located.set(row.key, { longitude: row.longitude, latitude: row.latitude });
		}
	}
	return located;
}

/**
 * The place rows of Czechia. Existing slugs are kept; a renamed place gets a new slug and keeps
 * the old one as an alias, as in the other markets. Regions and districts share one slug space;
 * a municipality's slug is unique within its district (`-{code}` on a collision).
 */
export function buildCzPlaceRows(
	sources: CzPlaceSources,
	points: ReadonlyMap<string, Located>,
	existing: ExistingPlace[],
): PlaceRow[] {
	const existingByKey = new Map(existing.map((place) => [`${place.kind}:${place.code}`, place]));
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
		regionCode: string | null,
		parent: { kind: string; code: string } | null,
		previous: string | null,
		point: Located | null | undefined,
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
		population: null,
		postcodes: [],
		previous_slug: previous,
	});

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
	const localSlug = (kind: PlaceRow["kind"], code: string, name: string, department: string) =>
		keep(kind, code, name, () => {
			const set = localTaken.get(department) ?? new Set<string>();
			localTaken.set(department, set);
			const base = slugify(name) || code;
			const slug = set.has(base) ? `${base}-${code}` : base;
			set.add(slug);
			return slug;
		});

	const rows: PlaceRow[] = [];
	const regionNuts = new Map(sources.regions.map((region) => [region.ruianCode, region.code]));
	for (const region of [...sources.regions].sort((a, b) => a.code.localeCompare(b.code))) {
		const { slug, previous } = topSlug("region", region.code, region.name);
		rows.push(
			row(
				"region",
				region.code,
				region.name,
				slug,
				null,
				region.code,
				null,
				previous,
				points.get(`r:${region.code}`),
			),
		);
	}
	const pragueRegion = regionNuts.get("19") ?? "CZ010";
	const district = new Map<string, { code: string; region: string }>();
	const departments = [
		...sources.districts.map((d) => ({
			code: d.code,
			name: d.name,
			region: regionNuts.get(d.regionRuianCode) ?? null,
			ruianCode: d.ruianCode,
		})),
		// Prague has no district in RÚIAN: the LAU 1 unit of the register and the statistics.
		{ code: PRAGUE_DISTRICT_CODE, name: "Praha", region: pragueRegion, ruianCode: null },
	].sort((a, b) => a.code.localeCompare(b.code));
	for (const department of departments) {
		if (!department.region) continue;
		if (department.ruianCode) {
			district.set(department.ruianCode, { code: department.code, region: department.region });
		}
		const { slug, previous } = topSlug("department", department.code, department.name);
		rows.push(
			row(
				"department",
				department.code,
				department.name,
				slug,
				department.code,
				department.region,
				{ kind: "region", code: department.region },
				previous,
				department.code === PRAGUE_DISTRICT_CODE
					? points.get(`c:${PRAGUE_CODE}`)
					: points.get(`d:${department.code}`),
			),
		);
	}
	for (const municipality of [...sources.municipalities].sort((a, b) =>
		a.code.localeCompare(b.code),
	)) {
		const parent =
			municipality.code === PRAGUE_CODE
				? { code: PRAGUE_DISTRICT_CODE, region: pragueRegion }
				: municipality.districtRuianCode
					? district.get(municipality.districtRuianCode)
					: undefined;
		if (!parent) continue;
		const { slug, previous } = localSlug(
			"commune",
			municipality.code,
			municipality.name,
			parent.code,
		);
		rows.push(
			row(
				"commune",
				municipality.code,
				municipality.name,
				slug,
				parent.code,
				parent.region,
				{ kind: "department", code: parent.code },
				previous,
				points.get(`c:${municipality.code}`),
			),
		);
	}
	for (const part of [...sources.pragueDistricts].sort((a, b) => Number(a.code) - Number(b.code))) {
		if (part.municipality !== PRAGUE_CODE) continue;
		const { slug, previous } = localSlug(
			"arrondissement",
			part.code,
			part.name,
			PRAGUE_DISTRICT_CODE,
		);
		rows.push(
			row(
				"arrondissement",
				part.code,
				part.name,
				slug,
				PRAGUE_DISTRICT_CODE,
				pragueRegion,
				{ kind: "commune", code: PRAGUE_CODE },
				previous,
				points.get(`a:${part.code}`),
			),
		);
	}
	return rows;
}

/** Upserts Czechia's places (country `CZ`); no other market's are read or touched. */
export async function importCzPlaces(
	sql: Sql,
	sources: CzPlaceSources,
	runId: number,
): Promise<PlacesStats> {
	const raw = new Map<string, Point>();
	for (const region of sources.regions) if (region.point) raw.set(`r:${region.code}`, region.point);
	for (const district of sources.districts) {
		if (district.point) raw.set(`d:${district.code}`, district.point);
	}
	for (const municipality of sources.municipalities) {
		if (municipality.point) raw.set(`c:${municipality.code}`, municipality.point);
	}
	for (const part of sources.pragueDistricts) {
		if (part.point) raw.set(`a:${part.code}`, part.point);
	}
	const points = await locate(sql, raw);
	let communes = 0;
	let arrondissements = 0;
	const stats = await writePlaces(
		sql,
		"CZ",
		(existing) => {
			const rows = buildCzPlaceRows(sources, points, existing);
			communes = rows.filter((row) => row.kind === "commune").length;
			arrondissements = rows.filter((row) => row.kind === "arrondissement").length;
			return rows;
		},
		runId,
		{ regions: sources.regions.length, communes: 0, arrondissements: 0 },
	);
	return { ...stats, communes, arrondissements };
}
