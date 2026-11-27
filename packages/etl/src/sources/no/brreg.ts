/**
 * The Brønnøysund Register Centre's Central Coordinating Register for Legal Entities
 * (Enhetsregisteret), open data under the Norwegian Licence for Open Government Data (NLOD 2.0):
 * the full files of establishments (`underenheter`, "Last ned totalbestand av underenheter i csv
 * format") and of main entities (`enheter`), gzipped CSV, every field quoted, produced every
 * night at about 05:00.
 *
 * An establishment (underenhet) is a physical place of business with its own organisation
 * number, location address and main industry code (`naeringskode1`, SN2025); it belongs to a
 * main entity (`overordnetEnhet`), whose legal form tells a sole proprietorship from a company
 * or a public body. The establishments registered under a code the market lists are read, then
 * their owners from the entities' file, then `filters.ts` keeps the places of care. Read from
 * each record and nothing more: name, location address (street lines, postcode, post town,
 * municipality, country), industry code and description, closure date and the `telefon`
 * number; of the owner its name, legal form and whether it is bankrupt or being wound up.
 * E-mails, mobile numbers (`mobil`, often a person's), websites, postal addresses, staff
 * numbers and registration dates are never read.
 */
import { isValidNoOrgNumber, toE164No } from "@apercura/core";
import { noKindOf } from "@apercura/core/taxonomy";
import { mapColumns } from "../../lib/text";
import { gunzipFile, readCsvRecords } from "./csv";
import { displayName, displayTown, exclusionOf, PUBLIC_OWNER_FORMS, streetOf } from "./filters";
import { clean, streetKey } from "./text";
import {
	emptyResult,
	NO_QUALIFICATION_SOURCES,
	type NoEstablishment,
	type ParseResult,
	quarantine,
	skip,
} from "./types";

/** The full files (`ETL_NO_UNDERENHETER_URL`, `ETL_NO_ENHETER_URL`). */
export const DEFAULT_NO_UNDERENHETER_URL =
	"https://data.brreg.no/enhetsregisteret/api/underenheter/lastned/csv";
export const DEFAULT_NO_ENHETER_URL =
	"https://data.brreg.no/enhetsregisteret/api/enheter/lastned/csv";

const ESTABLISHMENT_COLUMNS = {
	id: "organisasjonsnummer",
	name: "navn",
	industry: "naeringskode1.kode",
	industryLabel: "naeringskode1.beskrivelse",
	phone: "telefon",
	street: "beliggenhetsadresse.adresse",
	postTown: "beliggenhetsadresse.poststed",
	postcode: "beliggenhetsadresse.postnummer",
	municipality: "beliggenhetsadresse.kommunenummer",
	country: "beliggenhetsadresse.landkode",
	owner: "overordnetEnhet",
	closed: "nedleggelsesdato",
} as const;

const ENTITY_COLUMNS = {
	id: "organisasjonsnummer",
	name: "navn",
	form: "organisasjonsform.kode",
	bankrupt: "konkurs",
	windingUp: "underAvvikling",
	forcedWindingUp: "underTvangsavviklingEllerTvangsopplosning",
} as const;

/** The first physical line of a record: a quoted organisation number. */
const RECORD_START = /^"\d{9}"/;

/** A first line that may hold a code the market reads (the code sits on a record's first line). */
const MAY_BE_LISTED = /"(?:86\.[12]\d\d|86\.230|87\.102|47\.730)"/;

/** An establishment before its owner is known. */
type Pending = {
	lineNo: number;
	id: string;
	rawName: string;
	kind: string;
	industry: string;
	industryLabel: string;
	phone: string;
	street: string;
	postTown: string;
	postcode: string;
	municipality: string;
	country: string;
	owner: string;
	closed: boolean;
};

type Owner = { name: string; form: string; windingUp: boolean };

/** How many establishments may share a published number before it is not stored. */
const MAX_PHONE_SHARE = 3;

/** `true` as the register writes a flag. */
const flag = (value: string | undefined) => clean(value).toLowerCase() === "true";

/**
 * Reads the establishments the market lists from the two files (paths of the gzipped CSVs).
 * Throws when a file is not the register's (a missing column).
 */
export async function parseBrreg(
	establishmentsPath: string,
	entitiesPath: string,
): Promise<ParseResult> {
	const result = emptyResult("brreg");
	const pending: Pending[] = [];
	let at: Record<keyof typeof ESTABLISHMENT_COLUMNS, number> | null = null;
	let width = 0;
	const counter = { records: 0 };
	for await (const record of readCsvRecords(gunzipFile(establishmentsPath), {
		delimiter: ",",
		counter,
		isRecordStart: (line) => RECORD_START.test(line),
		wanted: (line) => MAY_BE_LISTED.test(line),
	})) {
		if (record.header) {
			at = mapColumns("underenheter.csv", record.fields, ESTABLISHMENT_COLUMNS);
			width = record.fields.length;
			continue;
		}
		if (!at) break;
		const fields = record.fields;
		const id = clean(fields[at.id]);
		if (fields.length !== width) {
			quarantine(result, record.lineNo, "column count", id);
			continue;
		}
		const rawName = clean(fields[at.name]);
		const industry = clean(fields[at.industry]);
		const kind = noKindOf(industry, rawName);
		if (!kind) continue;
		result.candidates++;
		if (!isValidNoOrgNumber(id)) {
			quarantine(result, record.lineNo, "organisation number", id);
			continue;
		}
		if (!rawName) {
			quarantine(result, record.lineNo, "name", id);
			continue;
		}
		pending.push({
			lineNo: record.lineNo,
			id,
			rawName,
			kind,
			industry,
			industryLabel: clean(fields[at.industryLabel]),
			phone: clean(fields[at.phone]),
			street: fields[at.street] ?? "",
			postTown: clean(fields[at.postTown]),
			postcode: clean(fields[at.postcode]),
			municipality: clean(fields[at.municipality]),
			country: clean(fields[at.country]),
			owner: clean(fields[at.owner]),
			closed: clean(fields[at.closed]) !== "",
		});
	}
	if (!at) throw new Error("not the register's establishments: empty file");
	result.lines = counter.records;

	const owners = await readOwners(
		entitiesPath,
		new Set(pending.map((row) => row.owner).filter(Boolean)),
		result,
	);

	// The filters, then one page per establishment: a second establishment of the same kind,
	// name and street in a municipality (a practice registered by its company and by its
	// partnership) is the same place of care.
	const seen = new Set<string>();
	const kept: { row: Pending; owner: Owner; street: string | null }[] = [];
	for (const row of pending.sort((a, b) => a.id.localeCompare(b.id))) {
		const owner = owners.get(row.owner) ?? null;
		const { street, careOf } = streetOf(row.street.split("\n"));
		result.counters.careOfLines += careOf;
		const reason = exclusionOf({
			name: row.rawName,
			kind: row.kind,
			ownerForm: owner?.form ?? null,
			closed: row.closed,
			ownerWindingUp: owner?.windingUp ?? false,
			hasAddress: row.country === "NO" && /^\d{4}$/.test(row.municipality),
		});
		if (reason) {
			skip(result, reason);
			continue;
		}
		const key = [
			row.kind,
			row.municipality,
			streetKey(street ?? ""),
			displayName(row.rawName).toLowerCase(),
		].join("|");
		if (seen.has(key)) {
			skip(result, "same-place");
			continue;
		}
		seen.add(key);
		kept.push({ row, owner: owner as Owner, street });
	}

	const phoneCounts = new Map<string, number>();
	const phones = new Map<string, string | null>();
	for (const { row } of kept) {
		const phone = row.phone ? toE164No(row.phone) : null;
		if (row.phone && !phone) result.counters.invalidPhones++;
		phones.set(row.id, phone);
		if (phone) phoneCounts.set(phone, (phoneCounts.get(phone) ?? 0) + 1);
	}

	for (const { row, owner, street } of kept) {
		let phone = phones.get(row.id) ?? null;
		if (phone && (phoneCounts.get(phone) ?? 0) > MAX_PHONE_SHARE) {
			result.counters.sharedPhones++;
			phone = null;
		}
		const name = displayName(row.rawName);
		const establishment: NoEstablishment = {
			source: "brreg",
			lineNo: row.lineNo,
			nationalId: row.id,
			professionCode: row.kind,
			name,
			address: {
				street,
				postcode: /^\d{4}$/.test(row.postcode) ? row.postcode : null,
				postTown: displayTown(row.postTown),
				municipality: row.municipality,
			},
			phone,
			qualifications: [],
		};
		if (row.industry) {
			establishment.qualifications.push({
				source: NO_QUALIFICATION_SOURCES.industry,
				code: row.industry,
				label: row.industryLabel,
			});
		}
		// The owner is named when it is a public body or a foundation (a health trust, a
		// municipality, a county), never a company that could be a person's.
		const ownerName = displayName(owner.name);
		if (PUBLIC_OWNER_FORMS.has(owner.form) && ownerName && ownerName !== name) {
			establishment.qualifications.push({
				source: NO_QUALIFICATION_SOURCES.owner,
				code: row.owner,
				label: ownerName,
			});
		}
		result.rows.push(establishment);
	}
	return result;
}

/** The owners of the establishments kept for now, from the entities' file. */
async function readOwners(
	path: string,
	wanted: ReadonlySet<string>,
	result: ParseResult,
): Promise<Map<string, Owner>> {
	const owners = new Map<string, Owner>();
	let at: Record<keyof typeof ENTITY_COLUMNS, number> | null = null;
	const counter = { records: 0 };
	for await (const record of readCsvRecords(gunzipFile(path), {
		delimiter: ",",
		counter,
		isRecordStart: (line) => RECORD_START.test(line),
		wanted: (line) => wanted.has(line.slice(1, 10)),
	})) {
		if (record.header) {
			at = mapColumns("enheter.csv", record.fields, ENTITY_COLUMNS);
			continue;
		}
		if (!at) break;
		const fields = record.fields;
		const id = clean(fields[at.id]);
		if (!wanted.has(id)) continue;
		owners.set(id, {
			name: clean(fields[at.name]),
			form: clean(fields[at.form]),
			windingUp:
				flag(fields[at.bankrupt]) || flag(fields[at.windingUp]) || flag(fields[at.forcedWindingUp]),
		});
	}
	if (!at) throw new Error("not the register's entities: empty file");
	result.entityLines = counter.records;
	return owners;
}
