/**
 * The Federal Office of Public Health's "Kennzahlen der Schweizer Spitäler" (opendata.swiss,
 * "Open use. Must provide the source."), the 2023 edition: one workbook (`kzp23_data.xlsx`) whose
 * sheet `KZ2023_KZP23` gives every hospital (Betrieb) with its canton, address, the Federal
 * Statistical Office's type (`Typ`, K111–K235), legal form group (`RForm`), activity types
 * (`Akt`), specific services (`SL`: emergency department, intensive care) and offer (`LA`), and
 * whose sheet `Standorte_KZ2023_KZP23` lists the sites of each hospital with their canton,
 * name, address and offer.
 *
 * A page is a site: what a patient goes to. A site inherits its hospital's type, activity types,
 * services and legal form, shown as its hospital's; its operator's name is shown when it is not
 * the site's own. The figures give no number to a hospital or a site, so a site's key is derived
 * from its canton, hospital, name and postcode (`derivedKeyCh`). The figures (costs, staff, case
 * mix) are not read: a page needs none of them. The figures publish no coordinates, no phone and
 * no person.
 */
import { CH_CANTONS } from "@apercura/core/country";
import { CH_HOSPITAL_TYPES, chHospitalKindOf } from "@apercura/core/taxonomy";
import { xlsxRows, xlsxSheets } from "../../lib/xlsx";
import {
	cleanText,
	derivedKeyCh,
	facilityNameCh,
	nameMatchKeyCh,
	splitPostcodeLocality,
	streetCh,
} from "./names";
import {
	CH_ACTIVITY_SOURCE,
	CH_LEGAL_FORM_SOURCE,
	CH_OFFER_SOURCE,
	CH_OPERATOR_SOURCE,
	CH_SERVICE_SOURCE,
	CH_TYPE_SOURCE,
	type ChFacility,
	type ChQualification,
	emptyResult,
	type ParseResult,
	quarantine,
	skip,
} from "./types";

/** The columns read from the hospitals' sheet, by header. */
export const BAG_HOSPITAL_COLUMNS = [
	"JAHR",
	"KT",
	"Inst",
	"Adr",
	"Ort",
	"Typ",
	"RForm",
	"Akt",
	"SL",
	"LA",
] as const;

/** The columns read from the sites' sheet, by header. */
export const BAG_SITE_COLUMNS = [
	"JAHR",
	"KT",
	"Inst",
	"Adr",
	"Ort",
	"KT_Standort",
	"Standort",
	"Adr_Standort",
	"Ort_Standort",
	"LA_Standort",
] as const;

/** The activity types of the figures (`Akt`), as the figures name them in German. */
export const BAG_ACTIVITIES: Readonly<Record<string, string>> = {
	A: "Akutsomatik",
	P: "Psychiatrie",
	R: "Rehabilitation",
	B: "Geburtshaus",
};

/** The specific services of the figures (`SL`) a page shows. */
export const BAG_SERVICES: Readonly<Record<string, string>> = {
	NF: "Notfallstation",
	IPS: "Intensivstation",
};

/** The offer of a hospital or a site (`LA`, `LA_Standort`). */
export const BAG_OFFERS: Readonly<Record<string, string>> = {
	AMB: "ambulant",
	STAT: "stationär",
};

/** The legal form groups of the figures (`RForm`). */
export const BAG_LEGAL_FORMS: Readonly<Record<string, string>> = {
	R1: "AG / GmbH",
	R2: "Verein / Stiftung",
	R3: "Einzelfirma / Gesellschaft",
	R4: "Öffentliches Unternehmen",
};

/**
 * A site that is a hospital's administration, not a place patients go to ("Brig - Verwaltung
 * SZO", "Direzione Generale EOC", "Zentrale Bereiche"): not a page.
 */
const ADMINISTRATIVE =
	/\b(?:verwaltung\w*|admin\.?\w*|direzione generale|zentrale bereiche|centrale servizi|si[eè]ge administratif)/i;

/** Words that make a site's name a facility's name on its own (`Spital`, `Clinique`, `Ambulatorium`…). */
const FACILITY_WORD =
	/spital|klinik|clini|h[oô]pital|ospedal|ambulator|zentrum|center|centre|centro|haus|maison|casa|praxis|permanence|station|unit[eé]|home|reha|psychiat|geburts|naissance|institut|cabinet|tagesk|therap|wohn|poli|sanatori|pflege|residen|r[eé]sidence|sant[eé]|gesundheit|medic|chirurg|dialys/i;

/**
 * The name a site's page prints: the site's own when it names a facility or shares a word with
 * its hospital's ("LUKS Sursee" of "LUKS Spitalbetriebe AG"), else the hospital's and the site's
 * ("Réseau hospitalier neuchâtelois RHNe – Le Locle" for a site the figures call "Le Locle").
 */
export function pageName(site: string, operator: string): string {
	if (!operator || site === operator || FACILITY_WORD.test(site)) return site;
	const words = (value: string) =>
		new Set(
			value
				.toLowerCase()
				.split(/[^\p{L}\p{N}]+/u)
				.filter((word) => word.length > 2),
		);
	const own = words(operator);
	if ([...words(site)].some((word) => own.has(word))) return site;
	return `${operator} – ${site}`;
}

type Hospital = {
	canton: string;
	name: string;
	street: string;
	place: string;
	type: string;
	legalForm: string;
	activities: string[];
	services: string[];
};

/** The codes of a list field (`A, P, R`, `NF, IPS`, `Amb, Stat`), upper-cased. */
const codes = (value: string | undefined): string[] =>
	(value ?? "")
		.split(/[,;/]/)
		.map((code) => code.trim().toUpperCase())
		.filter(Boolean);

/** The header row's index of each wanted column, or the columns missing. */
function indexColumns<Key extends string>(
	header: readonly string[],
	wanted: readonly Key[],
): Record<Key, number> | Key[] {
	const index = {} as Record<Key, number>;
	const missing: Key[] = [];
	for (const column of wanted) {
		const at = header.findIndex((cell) => cell.trim() === column);
		if (at < 0) missing.push(column);
		else index[column] = at;
	}
	return missing.length > 0 ? missing : index;
}

/** The key of a hospital in both sheets: its canton, name, street and place as the sheets write them. */
const hospitalKey = (canton: string, name: string, street: string, place: string) =>
	[canton, name, street, place].map((part) => cleanText(part)).join("|");

/**
 * The sheets of a year's workbook: `KZ{year}_…` for the hospitals and `Standorte_…` for their
 * sites (the 2023 edition names them `KZ2023_KZP23` and `Standorte_KZ2023_KZP23`).
 */
export function bagSheetNames(
	archive: Buffer,
	year: number,
): { hospitals: string | null; sites: string | null } {
	const names = xlsxSheets(archive).map((sheet) => sheet.name);
	return {
		hospitals: names.find((name) => name.startsWith(`KZ${year}`)) ?? null,
		sites: names.find((name) => name.startsWith("Standorte") && name.includes(`${year}`)) ?? null,
	};
}

/**
 * Reads the figures' workbook into one row per site. A site whose canton is not a canton, whose
 * postcode cannot be read, or whose hospital is not in the hospitals' sheet is quarantined; the
 * total line ("Alle Betriebe") and exact repeats are skipped.
 */
export async function parseBag(archive: Buffer, year: number): Promise<ParseResult> {
	const result = emptyResult("bag");
	const sheets = bagSheetNames(archive, year);
	if (!sheets.hospitals || !sheets.sites) {
		throw new Error(
			`the workbook has no sheets for ${year} (KZ${year}_…, Standorte_…): ${xlsxSheets(archive)
				.map((sheet) => sheet.name)
				.join(", ")}`,
		);
	}

	const hospitals = new Map<string, Hospital>();
	let columns: Record<(typeof BAG_HOSPITAL_COLUMNS)[number], number> | null = null;
	for await (const { rowNo, cells } of xlsxRows(archive, sheets.hospitals)) {
		if (!columns) {
			const found = indexColumns(cells, BAG_HOSPITAL_COLUMNS);
			if (Array.isArray(found))
				throw new Error(`hospitals' sheet: missing columns ${found.join(", ")}`);
			columns = found;
			continue;
		}
		const cell = (column: (typeof BAG_HOSPITAL_COLUMNS)[number]) =>
			cells[columns?.[column] ?? -1] ?? "";
		const canton = cell("KT").trim().toUpperCase();
		if (!canton) {
			// The total line ("Alle Betriebe - Tous les établissements - Tutti gli stabilimenti").
			if (cell("Inst").trim()) skip(result, "total");
			continue;
		}
		if (!CH_CANTONS[canton]) {
			quarantine(result, rowNo, "unknown canton", canton);
			continue;
		}
		const key = hospitalKey(canton, cell("Inst"), cell("Adr"), cell("Ort"));
		hospitals.set(key, {
			canton,
			name: cell("Inst"),
			street: cell("Adr"),
			place: cell("Ort"),
			type: cell("Typ").trim().toUpperCase(),
			legalForm: cell("RForm").trim().toUpperCase(),
			activities: codes(cell("Akt")),
			services: codes(cell("SL")),
		});
	}
	if (!columns) throw new Error("hospitals' sheet: no header row");

	let siteColumns: Record<(typeof BAG_SITE_COLUMNS)[number], number> | null = null;
	const seen = new Set<string>();
	for await (const { rowNo, cells } of xlsxRows(archive, sheets.sites)) {
		if (!siteColumns) {
			const found = indexColumns(cells, BAG_SITE_COLUMNS);
			if (Array.isArray(found))
				throw new Error(`sites' sheet: missing columns ${found.join(", ")}`);
			siteColumns = found;
			continue;
		}
		const cell = (column: (typeof BAG_SITE_COLUMNS)[number]) =>
			cells[siteColumns?.[column] ?? -1] ?? "";
		if (cells.every((value) => !value.trim())) continue;
		result.lines++;
		const hospitalCanton = cell("KT").trim().toUpperCase();
		const hospital = hospitals.get(
			hospitalKey(hospitalCanton, cell("Inst"), cell("Adr"), cell("Ort")),
		);
		const label = cleanText(cell("Standort")).slice(0, 12);
		if (!hospital) {
			quarantine(result, rowNo, "site of no hospital of the sheet", label);
			continue;
		}
		const canton = cell("KT_Standort").trim().toUpperCase() || hospital.canton;
		if (!CH_CANTONS[canton]) {
			quarantine(result, rowNo, "unknown canton", canton);
			continue;
		}
		const place = splitPostcodeLocality(cell("Ort_Standort"));
		if (!place) {
			quarantine(result, rowNo, "no postcode", label);
			continue;
		}
		const professionCode = chHospitalKindOf(hospital.type, hospital.activities.join(","));
		if (!professionCode) {
			quarantine(result, rowNo, "unknown hospital type", hospital.type || "-");
			continue;
		}
		const siteName = facilityNameCh(cell("Standort") || hospital.name);
		const operator = facilityNameCh(hospital.name);
		if (ADMINISTRATIVE.test(siteName.name)) {
			skip(result, "administrative site");
			continue;
		}
		// The key is the site's as the figures write it, whatever name the page prints.
		const key = derivedKeyCh([canton, operator.name, siteName.name, place.postcode]);
		if (seen.has(key)) {
			skip(result, "repeated site");
			continue;
		}
		seen.add(key);
		if (siteName.shortened || operator.shortened) result.counters.namesShortened++;
		const name = pageName(siteName.name, operator.name);

		const qualifications: ChQualification[] = [];
		const type = CH_HOSPITAL_TYPES[hospital.type];
		if (type) qualifications.push({ source: CH_TYPE_SOURCE, code: hospital.type, label: type.de });
		for (const activity of hospital.activities) {
			const name = BAG_ACTIVITIES[activity];
			if (name) qualifications.push({ source: CH_ACTIVITY_SOURCE, code: activity, label: name });
		}
		for (const service of hospital.services) {
			const name = BAG_SERVICES[service];
			if (name) qualifications.push({ source: CH_SERVICE_SOURCE, code: service, label: name });
		}
		for (const offer of codes(cell("LA_Standort"))) {
			const name = BAG_OFFERS[offer];
			if (name) qualifications.push({ source: CH_OFFER_SOURCE, code: offer, label: name });
		}
		const legalForm = BAG_LEGAL_FORMS[hospital.legalForm];
		if (legalForm) {
			qualifications.push({
				source: CH_LEGAL_FORM_SOURCE,
				code: hospital.legalForm,
				label: legalForm,
			});
		}
		if (operator.name && operator.name !== name && !name.startsWith(`${operator.name} – `)) {
			qualifications.push({ source: CH_OPERATOR_SOURCE, code: "", label: operator.name });
		}

		const row: ChFacility<"bag"> = {
			source: "bag",
			lineNo: rowNo,
			idScheme: "CH-BAG",
			nationalId: key,
			professionCode,
			name,
			qualifications,
			street: streetCh(cell("Adr_Standort")),
			postcode: place.postcode,
			locality: place.locality,
			cantonCode: canton,
			communeCode: null,
			latitude: null,
			longitude: null,
			phone: null,
			website: null,
			matchKeys: [nameMatchKeyCh(siteName.name), nameMatchKeyCh(name)],
		};
		result.rows.push(row);
	}
	if (!siteColumns) throw new Error("sites' sheet: no header row");
	return result;
}
