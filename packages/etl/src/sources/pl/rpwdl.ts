/**
 * The healthcare entities of RPWDL (Rejestr Podmiotów Wykonujących Działalność Leczniczą, kept
 * by Centrum e-Zdrowia), published daily on dane.gov.pl under CC BY 4.0 as one ZIP of
 * semicolon-separated, quoted UTF-8 CSV files (docs/data-import.md, "Poland"):
 * - `podmioty.csv`, the healthcare entities (podmioty lecznicze): their register book, legal
 *   form, name, seat and contacts;
 * - `zaklady.csv`, their establishments (zakłady lecznicze): name, kind of activity (`Rodzaj
 *   działalności`: 1 hospital, 2 other inpatient, 3 outpatient care), address with its TERYT
 *   and SIMC codes;
 * - `jednostki.csv`, the establishments' organisational units, each with its address;
 * - `komorki.csv`, the units' cells, each with its part VIII code (`kodResortVIII`), address and
 *   beds;
 * - `Info.txt`, the date and time the report was generated (the "time of production" the reuse
 *   conditions ask to state).
 * The register's other part, the professional practices of doctors, dentists, nurses and
 * midwives, is published in other files and never read.
 *
 * One page per active establishment of an active entity, with a place of care per distinct
 * address of its active units and cells. Only what a page needs is read: the entity's tax and
 * statistical numbers (NIP, REGON), register book number, seat, e-mail addresses and websites
 * are never read into a row, nor a natural person's entity name (`./names.ts`).
 */
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { normalizePlPostcode, toE164Pl } from "@apercura/core";
import { classifyPlEstablishment } from "@apercura/core/taxonomy";
import { MissingColumnsError, readQuotedRecords } from "../../lib/text";
import { zipEntries, zipEntryStream } from "../../lib/zip";
import {
	hasWords,
	isNaturalPersonForm,
	isPublicForm,
	NameVocabulary,
	personNameWords,
	withoutPersonName,
} from "./names";
import {
	emptyResult,
	type ParseResult,
	type PlCell,
	type PlEstablishment,
	type PlSite,
	quarantine,
	skip,
} from "./types";

/** The register's files in the ZIP, and the columns read from each (checked by name). */
export const RPWDL_FILES = {
	entities: "podmioty.csv",
	establishments: "zaklady.csv",
	units: "jednostki.csv",
	cells: "komorki.csv",
} as const;

export const RPWDL_INFO_FILE = "Info.txt";

const ENTITY_COLUMNS = {
	book: "ID Księgi",
	deleted: "Data wykreślenia z rejestru",
	form: "Forma organizacyjno-prawna",
	name: "Nazwa",
	ended: "Data zakończenia działalności",
	suspendedFrom: "Początek okresu zawieszenia",
	suspendedTo: "Koniec okresu zawieszenia",
} as const;

const ESTABLISHMENT_COLUMNS = {
	book: "ID Księgi",
	id: "ID ZOZ",
	kind: "Rodzaj działalności",
	name: "Nazwa",
	teryt: "Teryt",
	street: "Ulica",
	building: "Budynek",
	flat: "Lokal",
	postcode: "Kod pocztowy",
	city: "Miejscowość",
	phone: "Telefon",
	simc: "Kod SIMC",
	started: "Data rozpoczęcia działalności",
	ended: "Data zakończenia działalności",
} as const;

const UNIT_COLUMNS = {
	establishment: "ID ZOZ",
	id: "ID Jednostki",
	name: "Nazwa",
	teryt: "Teryt",
	street: "Ulica",
	building: "Budynek",
	flat: "Lokal",
	postcode: "Kodpocztowy",
	city: "Miejscowość",
	phone: "Telefon",
	simc: "Kod SIMC",
	ended: "Data zakończenia działalności JO",
	suspendedFrom: "Początek okresu zawieszenia",
	suspendedTo: "Koniec okresu zawieszenia",
} as const;

const CELL_COLUMNS = {
	establishment: "ID ZOZ",
	unit: "ID Jednostki",
	code: "kodResortVIII",
	label: "Specjalność komórki",
	teryt: "Teryt",
	street: "Ulica",
	building: "Budynek",
	flat: "Lokal",
	postcode: "Kod pocztowy",
	city: "Miejscowość",
	phone: "Telefon",
	simc: "Kod SIMC",
	beds: "Liczba łóżek ogółem",
	ended: "Data zakończenia działalności komórki",
	suspendedFrom: "Początek okresu zawieszenia",
	suspendedTo: "Koniec okresu zawieszenia",
} as const;

/**
 * A published number is a place's own when at most this many establishments carry it; a number
 * on more is a chain's call centre (a laboratory network prints one number on its hundreds of
 * collection points): not stored.
 */
export const MAX_PHONE_ESTABLISHMENTS = 3;

/** A field as published: whitespace collapsed; empty and `NULL` become null. */
export const value = (raw: string | undefined): string | null => {
	const text = (raw ?? "").replace(/\s+/g, " ").trim();
	return text === "" || text.toUpperCase() === "NULL" ? null : text;
};

/** An ISO date (`2026-11-27`, or the date part of a timestamp), or null. */
const isoDate = (raw: string | undefined) => {
	const text = value(raw);
	return text && /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
};

/** True when something ended (a date on or before `asOf`). */
const endedBy = (raw: string | undefined, asOf: string) => {
	const date = isoDate(raw);
	return date !== null && date <= asOf;
};

/** True when a suspension covers `asOf` (it began on or before it and has not ended before it). */
const suspendedOn = (from: string | undefined, to: string | undefined, asOf: string) => {
	const start = isoDate(from);
	if (!start || start > asOf) return false;
	const end = isoDate(to);
	return end === null || end >= asOf;
};

/**
 * The gmina of a TERYT code (`WWPPGGR`): the code itself, except that a town or the rural area of
 * an urban-rural gmina (`4`, `5`) is read as its gmina (`3`), and a district of Warsaw (`8`) or a
 * delegation of Kraków, Łódź, Poznań or Wrocław (`9`) as its city (`WWPP011`). Null for anything
 * that is not a seven-digit code of those kinds.
 */
export function gminaOfTeryt(raw: string | null): string | null {
	if (!raw || !/^\d{6}[1-9]$/.test(raw)) return null;
	const kind = raw.slice(6);
	if (kind === "4" || kind === "5") return `${raw.slice(0, 6)}3`;
	if (kind === "8" || kind === "9") return `${raw.slice(0, 4)}011`;
	if (kind === "1" || kind === "2" || kind === "3") return raw;
	return null;
}

/** The address line of a place of care: the street and number, else the locality and number. */
export function rpwdlStreet(
	street: string | null,
	building: string | null,
	flat: string | null,
	city: string,
): string | null {
	const number = building ? (flat ? `${building}/${flat}` : building) : null;
	if (street && number) return `${street} ${number}`;
	if (street) return street;
	if (number) return `${city} ${number}`;
	return null;
}

type Columns<T extends Record<string, string>> = Record<keyof T, number>;

function columnsOf<T extends Record<string, string>>(
	file: string,
	header: string[],
	expected: T,
): Columns<T> {
	const names = header.map((name) => name.replace(/^﻿/, "").trim());
	const missing: string[] = [];
	const index = {} as Columns<T>;
	for (const [key, name] of Object.entries(expected) as [keyof T, string][]) {
		const at = names.indexOf(name);
		if (at < 0) missing.push(name);
		index[key] = at;
	}
	if (missing.length > 0) throw new MissingColumnsError(file, missing);
	return index;
}

/** Reads one CSV of the register, record by record, with its columns by name. */
async function* records<T extends Record<string, string>>(
	path: string,
	file: string,
	expected: T,
): AsyncGenerator<{ lineNo: number; get: (key: keyof T) => string | null; width: number }> {
	let index: Columns<T> | null = null;
	let width = 0;
	for await (const record of readQuotedRecords(path, ";")) {
		if (!index) {
			index = columnsOf(file, record.fields, expected);
			width = record.fields.length;
			continue;
		}
		const fields = record.fields;
		const columns = index;
		yield {
			lineNo: record.lineNo,
			get: (key) => value(fields[columns[key]]),
			width: fields.length === width ? width : -fields.length,
		};
	}
	if (!index) throw new Error(`${file}: empty file`);
}

/**
 * Extracts the register's CSV files and `Info.txt` from the published ZIP into `dir` (the four
 * CSV files are streamed: `komorki.csv` alone is close to 200 MB). Throws when one is missing:
 * the run then fails rather than guessing.
 */
export async function extractRpwdl(archivePath: string, dir: string): Promise<string> {
	const archive = await readFile(archivePath);
	await mkdir(dir, { recursive: true });
	// The entries may sit in a folder of the archive: each is found by its base name.
	const all: string[] = [];
	for (const _entry of zipEntries(archive, (name) => {
		all.push(name);
		return false;
	})) {
		// Nothing is inflated: the walk only lists the names.
	}
	const find = (base: string) =>
		all.find((name) => name === base || name.endsWith(`/${base}`)) ?? null;
	for (const base of Object.values(RPWDL_FILES)) {
		const name = find(base);
		if (!name) throw new Error(`not the RPWDL export: no ${base} in the archive`);
		const stream = zipEntryStream(archive, name, 1024 * 1024 * 1024);
		if (!stream) throw new Error(`not the RPWDL export: no ${base} in the archive`);
		await pipeline(stream, createWriteStream(join(dir, base)));
	}
	const info = find(RPWDL_INFO_FILE);
	const infoText = info
		? [...zipEntries(archive, (name) => name === info)][0]?.data.toString("utf8")
		: undefined;
	await writeFile(join(dir, RPWDL_INFO_FILE), infoText ?? "");
	return dir;
}

/**
 * The day the report says it was generated from the register (`Info.txt`: "…z dnia 2026-11-27
 * 00:00:00", Warsaw time), `YYYY-MM-DD`: the time of production a page states. The time of day is
 * dropped, since it carries no zone and would read in the server's.
 */
export function producedAtOf(info: string): string | null {
	return /(\d{4}-\d{2}-\d{2})/.exec(info)?.[1] ?? null;
}

type Address = {
	teryt: string | null;
	street: string | null;
	building: string | null;
	flat: string | null;
	postcode: string | null;
	city: string | null;
	simc: string | null;
	phone: string | null;
	unitName: string | null;
};

const addressKey = (address: Address) =>
	[
		address.teryt ?? "",
		address.simc ?? "",
		(address.street ?? "").toLocaleLowerCase("pl").replace(/^(?:ul|al|pl|os)\.\s*/, ""),
		(address.building ?? "").toLocaleLowerCase("pl"),
		(address.flat ?? "").toLocaleLowerCase("pl"),
	].join("|");

const siteKeyOf = (establishment: string, key: string) =>
	`${establishment}:${createHash("sha256").update(key).digest("hex").slice(0, 10)}`;

/**
 * Parses the extracted register (`extractRpwdl`) as of `asOf` (an ISO date, the run's day in
 * Warsaw): an establishment, unit or cell whose activity ended on or before it, or that is
 * suspended on it, is not active; an entity struck off or whose activity ended keeps no page.
 * Throws when a file is not the register's (a missing column): the run then fails rather than
 * guessing columns.
 */
export async function parseRpwdl(dir: string, asOf: string): Promise<ParseResult> {
	const result = emptyResult();
	result.producedAt = producedAtOf(
		await readFile(join(dir, RPWDL_INFO_FILE), "utf8").catch(() => ""),
	);

	// 1. Entities: their form, whether they are active, and the words of the legal persons' names.
	const vocabulary = new NameVocabulary();
	const entities = new Map<string, { form: string | null; name: string | null; active: boolean }>();
	for await (const row of records(
		join(dir, RPWDL_FILES.entities),
		RPWDL_FILES.entities,
		ENTITY_COLUMNS,
	)) {
		const book = row.get("book");
		if (!book) continue;
		const form = row.get("form");
		const name = row.get("name");
		const active =
			row.get("deleted") === null &&
			!endedBy(row.get("ended") ?? undefined, asOf) &&
			!suspendedOn(
				row.get("suspendedFrom") ?? undefined,
				row.get("suspendedTo") ?? undefined,
				asOf,
			);
		entities.set(book, { form, name, active });
		if (name) vocabulary.add(name, isNaturalPersonForm(form));
	}

	// 2. Establishments, held until their units and cells are read.
	type Pending = {
		lineNo: number;
		id: string;
		book: string;
		kind: string | null;
		name: string;
		own: Address;
		sites: Map<string, Address>;
		cells: Map<string, string>;
		beds: number;
	};
	const pending = new Map<string, Pending>();
	for await (const row of records(
		join(dir, RPWDL_FILES.establishments),
		RPWDL_FILES.establishments,
		ESTABLISHMENT_COLUMNS,
	)) {
		result.lines++;
		const id = row.get("id") ?? "";
		if (row.width < 0) {
			quarantine(result, row.lineNo, `${-row.width} columns`, id);
			continue;
		}
		if (!/^[1-9]\d{0,9}$/.test(id)) {
			quarantine(result, row.lineNo, "invalid establishment id", id);
			continue;
		}
		const book = row.get("book") ?? "";
		const entity = entities.get(book);
		const name = row.get("name");
		if (name && entity) vocabulary.add(name, isNaturalPersonForm(entity.form));
		if (!entity) {
			quarantine(result, row.lineNo, "no entity", id);
			continue;
		}
		if (!entity.active) {
			skip(result, "entity struck off or closed");
			continue;
		}
		if (endedBy(row.get("ended") ?? undefined, asOf)) {
			skip(result, "establishment closed");
			continue;
		}
		const started = isoDate(row.get("started") ?? undefined);
		if (started && started > asOf) {
			skip(result, "establishment not yet open");
			continue;
		}
		if (!name) {
			quarantine(result, row.lineNo, "no name", id);
			continue;
		}
		if (pending.has(id)) {
			skip(result, "duplicate establishment id");
			continue;
		}
		pending.set(id, {
			lineNo: row.lineNo,
			id,
			book,
			kind: row.get("kind"),
			name,
			own: {
				teryt: row.get("teryt"),
				street: row.get("street"),
				building: row.get("building"),
				flat: row.get("flat"),
				postcode: row.get("postcode"),
				city: row.get("city"),
				simc: row.get("simc"),
				phone: row.get("phone"),
				unitName: null,
			},
			sites: new Map(),
			cells: new Map(),
			beds: 0,
		});
	}

	// 3. Units and cells: the places of care, the kinds of cells and the beds.
	const units = new Set<string>();
	const unitNames = new Map<string, string>();
	for await (const row of records(join(dir, RPWDL_FILES.units), RPWDL_FILES.units, UNIT_COLUMNS)) {
		const establishment = pending.get(row.get("establishment") ?? "");
		if (!establishment || row.width < 0) continue;
		if (
			endedBy(row.get("ended") ?? undefined, asOf) ||
			suspendedOn(row.get("suspendedFrom") ?? undefined, row.get("suspendedTo") ?? undefined, asOf)
		) {
			continue;
		}
		const unit = row.get("id");
		if (unit) {
			units.add(unit);
			const unitName = row.get("name");
			if (unitName) unitNames.set(unit, unitName);
		}
		result.counters.units++;
		const address: Address = {
			teryt: row.get("teryt"),
			street: row.get("street"),
			building: row.get("building"),
			flat: row.get("flat"),
			postcode: row.get("postcode"),
			city: row.get("city"),
			simc: row.get("simc"),
			phone: row.get("phone"),
			unitName: row.get("name"),
		};
		const key = addressKey(address);
		if (!establishment.sites.has(key)) establishment.sites.set(key, address);
	}
	for await (const row of records(join(dir, RPWDL_FILES.cells), RPWDL_FILES.cells, CELL_COLUMNS)) {
		const establishment = pending.get(row.get("establishment") ?? "");
		if (!establishment || row.width < 0) continue;
		// A cell of a closed or suspended unit is not active either.
		if (!units.has(row.get("unit") ?? "")) continue;
		if (
			endedBy(row.get("ended") ?? undefined, asOf) ||
			suspendedOn(row.get("suspendedFrom") ?? undefined, row.get("suspendedTo") ?? undefined, asOf)
		) {
			continue;
		}
		result.counters.cells++;
		const code = row.get("code");
		const label = row.get("label");
		if (code && /^\d{4}$/.test(code) && label && !establishment.cells.has(code)) {
			establishment.cells.set(code, label);
		}
		const beds = Number(row.get("beds") ?? "0");
		if (Number.isFinite(beds) && beds > 0) establishment.beds += beds;
		const address: Address = {
			teryt: row.get("teryt"),
			street: row.get("street"),
			building: row.get("building"),
			flat: row.get("flat"),
			postcode: row.get("postcode"),
			city: row.get("city"),
			simc: row.get("simc"),
			phone: row.get("phone"),
			unitName: unitNames.get(row.get("unit") ?? "") ?? null,
		};
		const key = addressKey(address);
		if (!establishment.sites.has(key)) establishment.sites.set(key, address);
	}

	// 4. Every published number with the count of its establishments: a chain's number is shared.
	const phoneEstablishments = new Map<string, Set<string>>();
	for (const establishment of pending.values()) {
		const addresses =
			establishment.sites.size > 0 ? [...establishment.sites.values()] : [establishment.own];
		for (const address of addresses) {
			const phone = toE164Pl(address.phone);
			if (!phone) continue;
			const set = phoneEstablishments.get(phone) ?? new Set<string>();
			set.add(establishment.id);
			phoneEstablishments.set(phone, set);
		}
	}

	// 5. The pages.
	for (const establishment of pending.values()) {
		const cellCodes = [...establishment.cells.keys()].sort();
		const classification = classifyPlEstablishment(establishment.kind, cellCodes);
		if (classification.professionCode === null) {
			skip(result, classification.reason);
			continue;
		}
		const entity = entities.get(establishment.book);
		const naturalPerson = isNaturalPersonForm(entity?.form);
		if (naturalPerson) result.counters.naturalPersons++;
		const addresses =
			establishment.sites.size > 0
				? [...establishment.sites.entries()]
				: [[addressKey(establishment.own), establishment.own] as const];
		const sites: PlSite[] = [];
		for (const [key, address] of addresses) {
			const city = address.city ?? establishment.own.city;
			if (!city) continue;
			const gminaCode = gminaOfTeryt(address.teryt);
			if (!gminaCode) result.counters.withoutGmina++;
			let phone = toE164Pl(address.phone);
			if (address.phone && !phone) result.counters.invalidPhones++;
			if (phone && (phoneEstablishments.get(phone)?.size ?? 0) > MAX_PHONE_ESTABLISHMENTS) {
				result.counters.sharedPhones++;
				phone = null;
			}
			sites.push({
				key: siteKeyOf(establishment.id, key),
				street: rpwdlStreet(address.street, address.building, address.flat, city),
				postcode: normalizePlPostcode(address.postcode),
				city,
				gminaCode,
				simc: address.simc && /^\d{7}$/.test(address.simc) ? address.simc : null,
				phone,
				// A unit's name says which hospital or clinic of a group a place is; a natural
				// person's units may carry their name, so theirs are never read.
				name: naturalPerson ? null : address.unitName,
			});
		}
		if (sites.length === 0) {
			quarantine(result, establishment.lineNo, "no place of care", establishment.id);
			continue;
		}
		let name = establishment.name;
		if (naturalPerson && entity?.name) {
			const words = personNameWords(entity.name, vocabulary);
			if (words.length > 0) {
				const stripped = withoutPersonName(establishment.name, words);
				if (stripped !== establishment.name.replace(/\s+/g, " ").trim()) {
					result.counters.namesStripped++;
					if (hasWords(stripped)) name = stripped;
					else {
						// The name was the person's only: the page is named after its address.
						result.counters.namedByAddress++;
						const first = sites[0] as PlSite;
						name = [first.street, first.city].filter(Boolean).join(", ");
					}
				}
			}
		}
		const cells: PlCell[] = cellCodes.map((code) => ({
			code,
			label: establishment.cells.get(code) ?? code,
		}));
		const row: PlEstablishment = {
			lineNo: establishment.lineNo,
			nationalId: establishment.id,
			professionCode: classification.professionCode,
			specialtyCode: classification.specialtyCode,
			name,
			activityKind:
				establishment.kind && /^[123]$/.test(establishment.kind) ? establishment.kind : null,
			cells,
			beds: establishment.beds,
			ownership: isPublicForm(entity?.form) ? "public" : "private",
			operator: naturalPerson ? null : (entity?.name ?? null),
			sites: sites.map((site, index) => (index === 0 ? { ...site, name: null } : site)),
			naturalPerson,
		};
		result.rows.push(row);
	}
	return result;
}
