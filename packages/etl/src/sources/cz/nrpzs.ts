/**
 * The places of care of the National Register of Healthcare Providers (NRPZS: "Místa
 * poskytování zdravotních služeb"), published monthly by ÚZIS ČR and the Ministry of Health as
 * a CSV of 49 quoted columns under CC BY 4.0
 * (https://www.nzip.cz/data/1823-narodni-registr-poskytovatelu-zdravotnich-sluzeb-otevrena-data).
 *
 * One line is one facility (zdravotnické zařízení, `ZZ_ID`) at one place of care
 * (`ZZ_misto_poskytovani_ID`), with its kind (`ZZ_druh_kod`), fields of care, address, RÚIAN
 * codes, WGS 84 point (`POINT(lat lng)`) and its provider's details. Only what a facility page
 * needs is read: the provider's company number (IČO, also inside `ZZ_kod`), seat, professional
 * representative, e-mail, fax, data box and web address are never read into a row, so they
 * cannot be stored.
 */
import { isValidCzSourceId, normalizeCzPostcode, toE164Cz } from "@apercura/core";
import {
	CZ_SPECIALIST,
	czFieldsOf,
	czProfessionOfKind,
	primaryCzSpecialty,
} from "@apercura/core/taxonomy";
import { z } from "zod";
import { csvRecords, decodeText } from "../gb/types";
import { emptyResult, type ParseResult, quarantine, skip } from "./types";

/** The 49 columns of the export, in order (checked by name, so a reordering still reads). */
export const NRPZS_COLUMNS = [
	"poskytovatel_ICO",
	"ZZ_ID",
	"ZZ_kod",
	"PCZ",
	"PCDP",
	"ZZ_nazev",
	"ZZ_druh_kod",
	"ZZ_druh_nazev",
	"ZZ_druh_nazev_sekundarni",
	"ZZ_misto_poskytovani_ID",
	"ZZ_kraj_kod",
	"ZZ_kraj_nazev",
	"ZZ_okres_kod",
	"ZZ_okres_nazev",
	"ZZ_ORP_kod",
	"ZZ_ORP_nazev",
	"ZZ_obec",
	"ZZ_spravni_obvod",
	"ZZ_PSC",
	"ZZ_ulice",
	"ZZ_cislo_domovni_orientacni",
	"ZZ_RUIAN_kod",
	"ZZ_GPS",
	"ZZ_datum_zahajeni_cinnosti",
	"ZZ_obor_pece",
	"ZZ_forma_pece",
	"ZZ_druh_pece",
	"ZZ_rozsah_pece",
	"poskytovatel_druh",
	"poskytovatel_nazev",
	"poskytovatel_osoba_typ",
	"poskytovatel_pravni_forma_kod",
	"poskytovatel_pravni_forma_nazev",
	"poskytovatel_sidlo_kraj_kod",
	"poskytovatel_sidlo_kraj_nazev",
	"poskytovatel_sidlo_okres_kod",
	"poskytovatel_sidlo_okres_nazev",
	"poskytovatel_sidlo_obec",
	"poskytovatel_sidlo_PSC",
	"poskytovatel_sidlo_ulice",
	"poskytovatel_sidlo_cislo_domovni_orientacni",
	"poskytovatel_sidlo_RUIAN_kod",
	"poskytovatel_telefon",
	"poskytovatel_fax",
	"poskytovatel_email",
	"poskytovatel_web",
	"poskytovatel_datova_schranka",
	"poskytovatel_odborny_zastupce",
	"zrizovatel_typ",
] as const;

/** The columns a row is built from: nothing else of a line is kept. */
const READ = [
	"ZZ_ID",
	"ZZ_nazev",
	"ZZ_druh_kod",
	"ZZ_druh_nazev",
	"ZZ_misto_poskytovani_ID",
	"ZZ_kraj_kod",
	"ZZ_okres_kod",
	"ZZ_obec",
	"ZZ_PSC",
	"ZZ_ulice",
	"ZZ_cislo_domovni_orientacni",
	"ZZ_GPS",
	"ZZ_obor_pece",
	"poskytovatel_nazev",
	"poskytovatel_osoba_typ",
	"poskytovatel_telefon",
] as const;

/**
 * A published number is a facility's own when at most this many lines of the file carry it;
 * a number on more lines is a chain's head office (a pharmacy chain prints one number on its
 * 500 pharmacies), not the place's: not stored.
 */
export const MAX_PHONE_ROWS = 3;

/** Czechia's extent, with a margin: a point outside it is a publishing error, not a place. */
const BOUNDS = { minLat: 48.4, maxLat: 51.2, minLng: 11.9, maxLng: 19.0 };

const text = (value: string | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

const Row = z.object({
	ZZ_ID: z.string().refine(isValidCzSourceId, "invalid facility number"),
	ZZ_misto_poskytovani_ID: z.string().regex(/^[1-9]\d{0,9}$/, "invalid place of care number"),
	ZZ_druh_kod: z.string().regex(/^\d{1,4}$/, "invalid facility kind"),
	ZZ_kraj_kod: z.string().regex(/^CZ0\d{2}$/, "invalid region code"),
	ZZ_okres_kod: z.string().regex(/^CZ0\d{2}[0-9A-F]$/, "invalid district code"),
	ZZ_obec: z.string().min(1, "no municipality"),
	ZZ_PSC: z.string().regex(/^(?:\d{5})?$/, "invalid postcode"),
	ZZ_GPS: z.string().regex(/^(?:POINT\(-?\d+(?:\.\d+)? -?\d+(?:\.\d+)?\))?$/, "invalid point"),
});

/** The WGS 84 point of `POINT(lat lng)` (latitude first, as the register writes it), inside Czechia. */
export function parseNrpzsPoint(raw: string): { latitude: number; longitude: number } | null {
	const match = /^POINT\((-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)\)$/.exec(raw.trim());
	if (!match) return null;
	const latitude = Number(match[1]);
	const longitude = Number(match[2]);
	if (
		latitude < BOUNDS.minLat ||
		latitude > BOUNDS.maxLat ||
		longitude < BOUNDS.minLng ||
		longitude > BOUNDS.maxLng
	) {
		return null;
	}
	return { latitude, longitude };
}

/** The address line of a place of care: the street and number, else the municipality and number. */
export function nrpzsStreet(street: string, number: string, city: string): string | null {
	if (street && number) return `${street} ${number}`;
	if (street) return street;
	if (number) return `${city} ${number}`;
	return null;
}

/**
 * Parses the export. Throws when the header is not the register's (another file, a changed
 * format): the run then leaves the list out rather than guessing columns.
 */
export function parseNrpzs(data: Buffer | string): ParseResult {
	const result = emptyResult();
	const content = typeof data === "string" ? data : decodeText(data);
	const records = csvRecords(content);
	const header = records.next();
	if (header.done) throw new Error("empty file");
	const names = header.value.fields.map((name) => name.trim());
	const missing = NRPZS_COLUMNS.filter((name) => !names.includes(name));
	if (missing.length > 0) throw new Error(`not the NRPZS export: no column ${missing.join(", ")}`);
	const index = Object.fromEntries(READ.map((name) => [name, names.indexOf(name)])) as Record<
		(typeof READ)[number],
		number
	>;
	const width = names.length;

	// Every published number with the count of its lines, across the whole file: a chain's number
	// is shared by its places whatever their kind.
	const lines: { lineNo: number; fields: string[] }[] = [];
	const phoneLines = new Map<string, number>();
	for (const record of records) {
		lines.push(record);
		if (record.fields.length !== width) continue;
		const phone = toE164Cz(record.fields[index.poskytovatel_telefon]);
		if (phone) phoneLines.set(phone, (phoneLines.get(phone) ?? 0) + 1);
	}

	const seen = new Set<string>();
	for (const { lineNo, fields } of lines) {
		result.lines++;
		const id = text(fields[index.ZZ_ID]);
		if (fields.length !== width) {
			quarantine(result, lineNo, `${fields.length} columns instead of ${width}`, id);
			continue;
		}
		const get = (name: (typeof READ)[number]) => text(fields[index[name]]);
		const kind = get("ZZ_druh_kod");
		const professionCode = czProfessionOfKind(kind);
		if (!professionCode) {
			skip(result, `kind ${kind || "?"} (${get("ZZ_druh_nazev") || "no kind"})`);
			continue;
		}
		const parsed = Row.safeParse({
			ZZ_ID: id,
			ZZ_misto_poskytovani_ID: get("ZZ_misto_poskytovani_ID"),
			ZZ_druh_kod: kind,
			ZZ_kraj_kod: get("ZZ_kraj_kod"),
			ZZ_okres_kod: get("ZZ_okres_kod"),
			ZZ_obec: get("ZZ_obec"),
			ZZ_PSC: get("ZZ_PSC").replace(/\s+/g, ""),
			ZZ_GPS: get("ZZ_GPS"),
		});
		if (!parsed.success) {
			quarantine(result, lineNo, parsed.error.issues[0]?.message ?? "invalid line", id);
			continue;
		}
		const name = get("ZZ_nazev") || get("poskytovatel_nazev");
		if (!name) {
			quarantine(result, lineNo, "no name", id);
			continue;
		}
		if (seen.has(id)) {
			skip(result, "duplicate facility number");
			continue;
		}
		seen.add(id);
		const city = parsed.data.ZZ_obec;
		const point = parseNrpzsPoint(parsed.data.ZZ_GPS);
		if (!point) result.counters.withoutPoint++;
		const rawPhone = get("poskytovatel_telefon");
		let phone = toE164Cz(rawPhone);
		if (rawPhone && !phone) result.counters.invalidPhones++;
		if (phone && (phoneLines.get(phone) ?? 0) > MAX_PHONE_ROWS) {
			result.counters.sharedPhones++;
			phone = null;
		}
		const naturalPerson = /^fyzick/i.test(get("poskytovatel_osoba_typ"));
		if (naturalPerson) result.counters.naturalPersons++;
		const fieldsOfCare = czFieldsOf(get("ZZ_obor_pece"));
		result.rows.push({
			lineNo,
			nationalId: id,
			siteKey: parsed.data.ZZ_misto_poskytovani_ID,
			professionCode,
			name,
			fields: fieldsOfCare,
			specialtyCode:
				professionCode === CZ_SPECIALIST
					? primaryCzSpecialty(fieldsOfCare.map((field) => field.code))
					: null,
			street: nrpzsStreet(get("ZZ_ulice"), get("ZZ_cislo_domovni_orientacni"), city),
			postcode: normalizeCzPostcode(parsed.data.ZZ_PSC),
			city,
			districtCode: parsed.data.ZZ_okres_kod,
			regionCode: parsed.data.ZZ_kraj_kod,
			latitude: point?.latitude ?? null,
			longitude: point?.longitude ?? null,
			phone,
			naturalPerson,
		});
	}
	return result;
}
