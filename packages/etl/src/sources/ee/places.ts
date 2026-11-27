/**
 * Estonia's places from the Land and Spatial Development Board's administrative and settlement
 * division (Maa- ja Ruumiamet, "Haldus- ja asustusjaotus", the units of Statistics Estonia's
 * EHAK classification; open data, credited "Haldus- ja asustusjaotus: Maa- ja Ruumiamet" and
 * the date of the data): `asustusyksus_shp.zip`, a polygon shapefile in L-EST97 (EPSG:3301)
 * whose every record is a settlement (asustusüksus) with its EHAK code and name, its
 * municipality's and its county's, and the date of the extract (`EKSPORT`). The attribute table
 * is in Windows-1257. Rebuilt at the start of every month.
 *
 * Mapped onto the four kinds of `directory.places`:
 * - the 15 counties (maakonnad) are regions (`0037`), with no listing of their own;
 * - the 79 municipalities (omavalitsused: vallad and linnad) are departments (`0784` Tallinn,
 *   `0793` Tartu linn), named as EHAK names them (`Rae vald`, `Tartu linn`);
 * - every settlement is a commune of its municipality: towns (`Tartu linn`, `Kuressaare
 *   linn`), small towns, boroughs and villages (`Haabneeme alevik`, `Koipsi küla`), and the
 *   districts of Tallinn and Kohtla-Järve (`Kesklinna linnaosa`). A municipality that is one
 *   town (Keila, Loksa, Maardu, Narva, Rakvere, Sillamäe, Viljandi, Võru) has that town as its
 *   only settlement, under the municipality's own code: like Paris, its city page is its
 *   municipality's (`apps/web/src/lib/places.ts`).
 * A settlement's point is an interior point of its largest ring, converted to WGS 84 in code
 * (`lest97.ts`); municipalities and counties take the centre of their settlements
 * (`lib/places.ts`). Run once, then each month or when the division changes
 * (`etl:places --country ee`).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { slugify } from "@apercura/core";
import { EE_PLACES_DATE } from "@apercura/core/country";
import type { Sql, TransactionSql } from "../../lib/db";
import { downloadFile } from "../../lib/files";
import { type ExistingPlace, type PlaceRow, type PlacesStats, writePlaces } from "../../lib/places";
import { readDbf, readShpPolygons } from "../../lib/shapefile";
import { readZipEntries } from "../../lib/zip";
import { interiorPoint } from "../it/places";
import { inEstonia, lest97ToWgs84 } from "./lest97";
import { addressParts, cityLabel, clean, nameKey } from "./names";

/** File name in `--source-dir`. */
export const EE_PLACES_FILE = "asustusyksus_shp.zip";

/** The settlements' shapefile of the current month (`ETL_EE_PLACES_URL`). */
export const DEFAULT_EE_PLACES_URL =
	"https://s3.pilw.io/rp-kemit-kataster/EHAK/asustusyksus_shp.zip";

export type EeUnit = { code: string; name: string };

export type EePlaceSources = {
	/** The date of the data (`2026-11-01`), from the `EKSPORT` field. */
	asOf: string | null;
	counties: EeUnit[];
	municipalities: (EeUnit & { county: string })[];
	settlements: (EeUnit & {
		municipality: string;
		county: string;
		longitude: number | null;
		latitude: number | null;
	})[];
};

const code4 = (value: string | undefined) => {
	const text = clean(value);
	return /^\d{1,4}$/.test(text) ? text.padStart(4, "0") : null;
};

/** Reads the settlements' shapefile. Throws when it is not one (a missing column, no record). */
export function parseEePlaces(archive: Buffer): EePlaceSources {
	const entries = readZipEntries(archive, (name) => /asustusyksus\.(dbf|shp)$/i.test(name));
	const dbf = entries.find((entry) => /\.dbf$/i.test(entry.name));
	const shp = entries.find((entry) => /\.shp$/i.test(entry.name));
	if (!dbf || !shp) throw new Error("not the settlements' shapefile: no asustusyksus.dbf/.shp");
	const { records } = readDbf(dbf.data, { encoding: "windows-1257" });
	const shapes = readShpPolygons(shp.data);
	const first = records[0];
	const columns = ["ANIMI", "AKOOD", "ONIMI", "OKOOD", "MNIMI", "MKOOD"];
	const missing = first ? columns.filter((column) => !(column in first)) : columns;
	if (missing.length > 0) {
		throw new Error(`not the settlements' shapefile: no column ${missing.join(", ")}`);
	}
	if (shapes.length !== records.length) {
		throw new Error(`${records.length} settlements but ${shapes.length} shapes`);
	}
	const sources: EePlaceSources = { asOf: null, counties: [], municipalities: [], settlements: [] };
	const counties = new Map<string, string>();
	const municipalities = new Map<string, { name: string; county: string }>();
	const seen = new Set<string>();
	records.forEach((record, index) => {
		const code = code4(record.AKOOD);
		const municipality = code4(record.OKOOD);
		const county = code4(record.MKOOD);
		const name = clean(record.ANIMI);
		if (!code || !municipality || !county || !name || seen.has(code)) return;
		seen.add(code);
		const exported = /^(\d{4})(\d{2})(\d{2})$/.exec(clean(record.EKSPORT));
		if (exported && !sources.asOf) sources.asOf = `${exported[1]}-${exported[2]}-${exported[3]}`;
		counties.set(county, clean(record.MNIMI));
		municipalities.set(municipality, { name: clean(record.ONIMI), county });
		const rings = shapes[index];
		const inner = rings ? interiorPoint(rings) : null;
		const point = inner ? lest97ToWgs84(inner.x, inner.y) : null;
		const located = point && inEstonia(point) ? point : null;
		sources.settlements.push({
			code,
			name,
			municipality,
			county,
			longitude: located?.longitude ?? null,
			latitude: located?.latitude ?? null,
		});
	});
	sources.counties = [...counties].map(([code, name]) => ({ code, name }));
	sources.municipalities = [...municipalities].map(([code, unit]) => ({ code, ...unit }));
	if (sources.counties.length === 0 || sources.settlements.length === 0) {
		throw new Error("not the settlements' shapefile: no settlement");
	}
	return sources;
}

/**
 * The place rows of Estonia. Existing slugs are kept; a renamed place gets a new slug and keeps
 * the old one as an alias, as in the other markets. Municipalities and counties share one slug
 * space, municipalities first (their pages are listings); a settlement's slug is unique within
 * its municipality (`-{code}` on a collision).
 */
export function buildEePlaceRows(sources: EePlaceSources, existing: ExistingPlace[]): PlaceRow[] {
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
			const base = slugify(name) || code;
			const slug = topTaken.has(base) ? `${base}-${code}` : base;
			topTaken.add(slug);
			return slug;
		});
	const localSlug = (code: string, name: string, municipality: string) =>
		keep("commune", code, name, () => {
			const set = localTaken.get(municipality) ?? new Set<string>();
			localTaken.set(municipality, set);
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
	const byCode = (a: EeUnit, b: EeUnit) => a.code.localeCompare(b.code);
	for (const municipality of [...sources.municipalities].sort(byCode)) {
		const { slug, previous } = topSlug("department", municipality.code, municipality.name);
		rows.push({
			...base,
			kind: "department",
			code: municipality.code,
			name: municipality.name,
			slug,
			department_code: municipality.code,
			region_code: municipality.county,
			parent_kind: "region",
			parent_code: municipality.county,
			previous_slug: previous,
		});
	}
	for (const county of [...sources.counties].sort(byCode)) {
		const { slug, previous } = topSlug("region", county.code, county.name);
		rows.push({
			...base,
			kind: "region",
			code: county.code,
			name: county.name,
			slug,
			department_code: null,
			region_code: county.code,
			previous_slug: previous,
		});
	}
	for (const settlement of [...sources.settlements].sort(byCode)) {
		const { slug, previous } = localSlug(settlement.code, settlement.name, settlement.municipality);
		rows.push({
			...base,
			kind: "commune",
			code: settlement.code,
			name: settlement.name,
			slug,
			department_code: settlement.municipality,
			region_code: settlement.county,
			parent_kind: "department",
			parent_code: settlement.municipality,
			longitude: settlement.longitude,
			latitude: settlement.latitude,
			previous_slug: previous,
		});
	}
	return rows;
}

/** Upserts Estonia's places (country `EE`); no other market's are read or touched. */
export async function importEePlaces(
	sql: Sql,
	sources: EePlaceSources,
	runId: number,
	log: (message: string) => void = () => {},
): Promise<PlacesStats & { located: number; asOf: string | null; expectedAsOf: string }> {
	if (sources.asOf !== EE_PLACES_DATE) {
		log(
			`ee places: the data is of ${sources.asOf ?? "an unknown date"}, the credit says ${EE_PLACES_DATE}: raise EE_PLACES_DATE (packages/core/src/country/ee.ts)`,
		);
	}
	const stats = await writePlaces(
		sql,
		"EE",
		(existing) => buildEePlaceRows(sources, existing),
		runId,
		{ regions: sources.counties.length, communes: sources.settlements.length, arrondissements: 0 },
	);
	return {
		...stats,
		located: sources.settlements.filter((settlement) => settlement.longitude !== null).length,
		asOf: sources.asOf,
		expectedAsOf: EE_PLACES_DATE,
	};
}

/** Reads the settlements' shapefile from `--source-dir`. */
export async function readEePlaceSources(dir: string): Promise<EePlaceSources> {
	return parseEePlaces(await readFile(join(dir, EE_PLACES_FILE)));
}

/** Downloads the settlements' shapefile (about 17 MB) to `dir` and reads it. */
export async function fetchEePlaceSources(url: string, dir: string): Promise<EePlaceSources> {
	const file = await downloadFile({
		key: "places",
		url,
		path: join(dir, EE_PLACES_FILE),
		text: false,
	});
	return parseEePlaces(await readFile(file.path));
}

// ---------------------------------------------------------------------------
// Placing a provider's place of activity
// ---------------------------------------------------------------------------

export type EeSettlement = {
	id: number;
	code: string;
	name: string;
	municipalityCode: string;
};

export type EePlaceIndex = {
	/** Municipalities by name key (`tartulinn` → `0793`). */
	municipalities: Map<string, { code: string; name: string }>;
	/** Settlements by municipality code, then name key. */
	settlements: Map<string, Map<string, EeSettlement>>;
};

export function buildEePlaceIndex(
	settlements: readonly EeSettlement[],
	municipalities: readonly { code: string; name: string }[],
): EePlaceIndex {
	const index: EePlaceIndex = { municipalities: new Map(), settlements: new Map() };
	for (const municipality of municipalities) {
		index.municipalities.set(nameKey(municipality.name), municipality);
	}
	for (const settlement of settlements) {
		const map = index.settlements.get(settlement.municipalityCode) ?? new Map();
		map.set(nameKey(settlement.name), settlement);
		index.settlements.set(settlement.municipalityCode, map);
	}
	return index;
}

/** Builds the index of Estonia's settlements the places of activity are placed with. */
export async function loadEePlaceIndex(sql: Sql | TransactionSql): Promise<EePlaceIndex> {
	const settlements = await sql<EeSettlement[]>`
		SELECT id, code, name, department_code AS "municipalityCode" FROM directory.places
		WHERE country = 'EE' AND kind = 'commune' AND removed_at IS NULL
	`;
	const municipalities = await sql<{ code: string; name: string }[]>`
		SELECT code, name FROM directory.places
		WHERE country = 'EE' AND kind = 'department' AND removed_at IS NULL
	`;
	return buildEePlaceIndex(settlements, municipalities);
}

export type EePlacement = {
	settlement: EeSettlement;
	/** The street and number (`Ülase tn 16`), or null for a settlement alone. */
	street: string | null;
	/** The place the address prints after its postcode (`Tartu`, `Haabneeme alevik`). */
	city: string;
	/** How the settlement was told: written in the address, or the municipality's own town. */
	placedBy: "settlement" | "town";
};

/**
 * Places a full address (`Tartu maakond, Tartu linn, Tartu linn, Ülase tn 16`): in the
 * settlement it names within its municipality, else in the municipality's town of the same name
 * (`Harju maakond, Keila linn, Pargi tn 2b`, a single-town municipality whose addresses name no
 * settlement); null when neither is known.
 */
export function placeAddress(address: string, index: EePlaceIndex): EePlacement | null {
	const parts = addressParts(address);
	if (!parts) return null;
	const municipality = index.municipalities.get(nameKey(parts.municipality));
	if (!municipality) return null;
	const settlements = index.settlements.get(municipality.code);
	if (!settlements) return null;
	const [first, ...after] = parts.rest;
	const named = first ? settlements.get(nameKey(first)) : undefined;
	if (named) {
		return {
			settlement: named,
			street: after.length > 0 ? after.join(", ") : null,
			city: cityLabel(named.name, municipality.name),
			placedBy: "settlement",
		};
	}
	const town = settlements.get(nameKey(municipality.name));
	if (!town) return null;
	return {
		settlement: town,
		street: parts.rest.length > 0 ? parts.rest.join(", ") : null,
		city: cityLabel(town.name, municipality.name),
		placedBy: "town",
	};
}
