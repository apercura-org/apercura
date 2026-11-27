/**
 * The Ministry of Health's lists of state facilities (data.gov.cy, CC BY 4.0), run since 2019 by
 * the State Health Services Organisation (ΟΚΥπΥ):
 * - "Κατάλογος Κρατικών Νοσοκομείων Κύπρου": one CSV row per state hospital, with its name, its
 *   address, its telephone number, a web page and its point (latitude, longitude);
 * - "Κατάλογος Κρατικών Κέντρων Υγείας Κύπρου": one row per state health centre, with its name,
 *   telephone numbers and fax. No address: the centre is placed by the place its name gives
 *   (`Κέντρο Υγείας Κοφίνου`, in the genitive) in the district its number's area code says.
 * Both files date from 2018 (the lists say so on the data page). The web pages they link to are
 * the Ministry's former ones and are not read, nor are the fax numbers.
 *
 * Neither list numbers its facilities: a facility is keyed by ten hexadecimal digits of a hash
 * of its kind and its name's key, so a run over the same list keeps every page.
 */
import { createHash } from "node:crypto";
import { normalizeCyPostcode, toE164Cy } from "@apercura/core";
import { CY_HEALTH_CENTRE, CY_HOSPITAL } from "@apercura/core/taxonomy";
import { clean, columnsOf, csvRecords, nameKey } from "./text";
import { type CySourceId, emptyResult, type ParseResult, quarantine, skip } from "./types";

/** The key of a state facility: ten hex digits of a hash of its kind and name (`3fa9c01b2e`). */
export function stateKey(professionCode: string, name: string): string {
	return createHash("sha256")
		.update(`${professionCode}|${nameKey(name)}`)
		.digest("hex")
		.slice(0, 10);
}

/** The district a fixed line's area code names (`22` Nicosia … `26` Paphos), by its name. */
const AREA_DISTRICTS: Readonly<Record<string, string>> = {
	"22": "Λευκωσία",
	"23": "Αμμόχωστος",
	"24": "Λάρνακα",
	"25": "Λεμεσός",
	"26": "Πάφος",
};

/** The district of a Cypriot fixed line (`+35724…` → `Λάρνακα`), if any. */
export function districtOfPhone(e164: string | null): string | null {
	const area = /^\+357(2[2-6])/.exec(e164 ?? "")?.[1];
	return area ? (AREA_DISTRICTS[area] ?? null) : null;
}

/** True when a point lies in Cyprus (a typo of the list would put a hospital in the sea). */
function inCyprus(latitude: number, longitude: number): boolean {
	return latitude > 34.5 && latitude < 35.75 && longitude > 32.2 && longitude < 34.65;
}

/**
 * A hospital's address split into its street, postcode and town:
 * `Κορυτσάς 6, 2012 Στρόβολος Λευκωσία` → `Κορυτσάς 6`, `2012`, `Στρόβολος Λευκωσία`;
 * `Χρίστου Κκέλη 25, Παραλίμνι` → `Χρίστου Κκέλη 25`, none, `Παραλίμνι`; `Κυπερούντα Λεμεσός`
 * → no street, `Κυπερούντα Λεμεσός`.
 */
export function splitAddress(address: string): {
	street: string | null;
	postcode: string | null;
	town: string | null;
} {
	const text = clean(address);
	const match = /(?:^|[\s,])([1-9]\d{3})(?=[\s,]|$)/.exec(text);
	if (match) {
		const before = text.slice(0, match.index).replace(/[\s,]+$/, "");
		const after = text.slice(match.index + match[0].length).replace(/^[\s,]+/, "");
		return {
			street: before || null,
			postcode: normalizeCyPostcode(match[1]),
			town: after || null,
		};
	}
	const parts = text
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
	if (parts.length <= 1) return { street: null, postcode: null, town: parts[0] ?? null };
	return { street: parts.slice(0, -1).join(", "), postcode: null, town: parts.at(-1) ?? null };
}

const HOSPITAL_COLUMNS = {
	name: ["Hospital", "Νοσοκομείο", "Name", "Όνομα"],
	address: ["Address", "Διεύθυνση"],
	phone: ["Tel", "Telephone", "Τηλέφωνο"],
	latitude: ["latitude", "lat", "Y"],
	longitude: ["longitude", "lon", "lng", "X"],
} as const;

const CENTRE_COLUMNS = {
	name: ["Name", "Όνομα", "Κέντρο Υγείας"],
	phone: ["Tel", "Telephone", "Τηλέφωνο"],
} as const;

/** What a health centre's name says before its place (`Κέντρο Υγείας`), dropped to find it. */
const CENTRE_PREFIX = /^κ[εέ]ντρο\s+υγε[ιί]ας\s*/i;

/** Reads the state hospitals' list. Throws when it is not the list. */
export function parseHospitals(data: Buffer): ParseResult {
	return parseState("nosokomeia", data);
}

/** Reads the state health centres' list. Throws when it is not the list. */
export function parseHealthCentres(data: Buffer): ParseResult {
	return parseState("kentra", data);
}

function parseState(source: Extract<CySourceId, "nosokomeia" | "kentra">, data: Buffer) {
	const result = emptyResult(source);
	const hospital = source === "nosokomeia";
	const label = hospital ? "list of state hospitals" : "list of state health centres";
	const [header, ...records] = csvRecords(data);
	if (!header) throw new Error(`not the ${label}: empty file`);
	const professionCode = hospital ? CY_HOSPITAL : CY_HEALTH_CENTRE;
	const seen = new Set<string>();
	const hospitalColumns = hospital ? columnsOf(header.fields, HOSPITAL_COLUMNS, label) : null;
	const centreColumns = hospital ? null : columnsOf(header.fields, CENTRE_COLUMNS, label);
	for (const { lineNo, fields } of records) {
		result.lines++;
		const name = clean(fields[(hospitalColumns ?? centreColumns)?.name ?? 0]);
		if (!name) {
			quarantine(result, lineNo, "no name", String(lineNo));
			continue;
		}
		const nationalId = stateKey(professionCode, name);
		if (seen.has(nationalId)) {
			skip(result, "duplicate");
			continue;
		}
		seen.add(nationalId);
		const rawPhone = clean(fields[(hospitalColumns ?? centreColumns)?.phone ?? 0]);
		const phone = toE164Cy(rawPhone);
		if (rawPhone && !phone) result.counters.invalidPhones++;
		if (hospitalColumns) {
			const address = splitAddress(fields[hospitalColumns.address] ?? "");
			const latitude = Number(clean(fields[hospitalColumns.latitude]));
			const longitude = Number(clean(fields[hospitalColumns.longitude]));
			const located =
				Number.isFinite(latitude) && Number.isFinite(longitude) && inCyprus(latitude, longitude);
			if (!address.town && !address.postcode && !located) {
				quarantine(result, lineNo, "no address", nationalId);
				continue;
			}
			result.rows.push({
				source,
				lineNo,
				nationalId,
				professionCode,
				name,
				location: {
					...address,
					district: districtOfPhone(phone),
					point: located ? { latitude, longitude } : null,
					phone,
				},
			});
			continue;
		}
		const place = name.replace(CENTRE_PREFIX, "").trim();
		result.rows.push({
			source,
			lineNo,
			nationalId,
			professionCode,
			name,
			location: {
				street: null,
				postcode: null,
				town: place && place !== name ? place : null,
				district: districtOfPhone(phone),
				point: null,
				phone,
			},
		});
	}
	if (result.lines === 0) throw new Error(`not the ${label}: no row`);
	return result;
}
