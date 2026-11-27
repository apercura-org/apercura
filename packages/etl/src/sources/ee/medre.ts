/**
 * The Health Board's register of healthcare providers and their activity licences (Terviseamet,
 * "Tervishoiuteenuse osutajate ning tegevuslubade andmestik", MEDRE open data kept by TEHIK,
 * CC BY-NC-SA 3.0): one XML file, `od_asutused.xml`, rebuilt every day. Its root `asutused`
 * carries the extract's time (`hetk`); each `asutus` is a provider holding at least one valid
 * licence, with its Business Register code, name, legal address, licences and the health
 * workers registered with it (field description: medre.tehik.ee, "Terviseameti registrite
 * avaandmed", updated 11.10.2023).
 *
 * Read: the name, and per licence (`tegevusluba`) its number (`L01909`), validity, kind of
 * licence and of hospital, and its places of activity (`tegevuskoht`) with their address and
 * services. Never read: the Business Register code and the legal address (a page needs
 * neither, and a sole trader's code names the person), and the health workers (`tootajad`,
 * names and registration codes of people), cut out of each record before anything else is.
 *
 * A provider is keyed by its lowest-numbered licence in force (the register's immutable
 * licence designation). A place of activity whose only services are school health (`T0001`,
 * a nurse at a school, for its pupils) or ambulance (`T0014`) is no place a patient visits, and
 * one without a county and municipality (a mobile unit: `Eesti Vabariik`) none a page can show:
 * both are left out, and a provider left with none is not listed.
 */
import { EE_LICENCE_KINDS, type EeLicence, eeProviderKind } from "@apercura/core/taxonomy";
import { decodeXml } from "../../lib/xlsx";
import { addressParts, clean, firstAddress, providerName } from "./names";
import {
	type EeLocation,
	type EeQualification,
	emptyResult,
	type ParseResult,
	EE_QUALIFICATION_SOURCES as Q,
	quarantine,
	skip,
} from "./types";

/** School health (a school nurse) and ambulance services: no place a patient visits. */
const NOT_VISITED: ReadonlySet<string> = new Set(["T0001", "T0014"]);

/** The text of the first `<tag>` child of `body`, decoded and trimmed; empty when absent or self-closed. */
function text(body: string, tag: string): string {
	const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(body);
	return match ? clean(decodeXml(match[1] ?? "")) : "";
}

/** The bodies of every `<tag>` element of `body`. */
function elements(body: string, tag: string): string[] {
	return [...body.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g"))].map(
		(match) => match[1] ?? "",
	);
}

/** A licence in force on `asOf` (`YYYY-MM-DD`): begun, not ended. */
const inForce = (from: string, to: string, asOf: string) =>
	(!from || from.slice(0, 10) <= asOf) && (!to || to.slice(0, 10) >= asOf);

type Licence = EeLicence & {
	number: string;
	kindName: string;
	hospitalKindName: string;
	places: { address: string; services: { code: string; name: string }[] }[];
};

/**
 * Reads the register. `asOf` (`YYYY-MM-DD`, today in Tallinn) decides which licences are in
 * force. Throws when the file is not the register (no `asutused` root), so a changed format
 * fails the source instead of emptying it.
 */
export function parseMedre(data: Buffer | string, asOf: string): ParseResult {
	const xml = typeof data === "string" ? data : data.toString("utf8");
	const result = emptyResult("medre");
	const root = /<asutused(?:\s+[^>]*?)?\s*(?:\/>|>)/.exec(xml);
	if (!root) throw new Error("not the Health Board's register: no <asutused> root");
	const hetk = /\bhetk="(\d{4})-(\d{2})-(\d{2})/.exec(root[0]);
	result.edition = hetk ? Number(`${hetk[1]}${hetk[2]}${hetk[3]}`) : null;
	let lineNo = 0;
	for (const match of xml.matchAll(/<asutus>([\s\S]*?)<\/asutus>/g)) {
		lineNo++;
		result.lines++;
		// The health workers registered with the provider are never read.
		const record = (match[1] ?? "").replace(/<tootajad>[\s\S]*?<\/tootajad>|<tootajad\s*\/>/g, "");
		const name = providerName(text(record, "nimi"));
		const licences: Licence[] = [];
		for (const body of elements(record, "tegevusluba")) {
			const number = text(body, "tegevusloa_number");
			if (!/^L\d{5}$/.test(number)) {
				quarantine(result, lineNo, "licence number", number || "-");
				continue;
			}
			if (!inForce(text(body, "alates"), text(body, "kuni"), asOf)) {
				skip(result, "licence not in force");
				continue;
			}
			const places = elements(body, "tegevuskoht").map((place) => ({
				address: firstAddress(text(place, "aadress")),
				services: elements(place, "teenus")
					.map((service) => ({ code: text(service, "kood"), name: text(service, "nimi") }))
					.filter((service) => service.code),
			}));
			licences.push({
				number,
				kind: text(body, "loaliik_kood"),
				kindName: text(body, "loaliik_nimi"),
				hospitalKind: text(body, "haiglaliik_kood") || null,
				hospitalKindName: text(body, "haiglaliik_nimi"),
				services: places.flatMap((place) => place.services.map((service) => service.code)),
				places,
			});
		}
		if (licences.length === 0) {
			if (!result.quarantined.some((line) => line.lineNo === lineNo)) {
				skip(result, "no licence in force");
			}
			continue;
		}
		if (!name) {
			quarantine(result, lineNo, "name", licences[0]?.number ?? "-");
			continue;
		}
		const professionCode = eeProviderKind(licences);
		if (!professionCode) {
			skip(result, "ambulance only");
			continue;
		}
		const locations = new Map<string, EeLocation>();
		const services = new Map<string, string>();
		for (const licence of licences) {
			if (licence.kind === EE_LICENCE_KINDS.ambulance) continue;
			for (const place of licence.places) {
				if (place.services.length > 0 && place.services.every((s) => NOT_VISITED.has(s.code))) {
					skip(result, "school health or ambulance place");
					continue;
				}
				if (!place.address || !addressParts(place.address)) {
					skip(result, "place without an address");
					continue;
				}
				for (const service of place.services) {
					if (!services.has(service.code)) services.set(service.code, service.name);
				}
				const key = place.address.toLocaleLowerCase("et");
				if (!locations.has(key)) {
					locations.set(key, { address: place.address, adrId: null, phone: null });
				}
			}
		}
		if (locations.size === 0) {
			skip(result, "no place a patient visits");
			continue;
		}
		const sorted = [...licences].sort((a, b) => a.number.localeCompare(b.number));
		const qualifications: EeQualification[] = [
			...sorted.map((licence) => ({
				source: Q.licence,
				code: licence.number,
				label: licence.kindName,
			})),
			...[
				...new Map(
					sorted
						.filter((licence) => licence.hospitalKind)
						.map((licence) => [licence.hospitalKind ?? "", licence.hospitalKindName]),
				),
			].map(([code, label]) => ({ source: Q.hospitalKind, code, label })),
			...[...services].map(([code, label]) => ({ source: Q.service, code, label })),
		];
		result.rows.push({
			source: "medre",
			lineNo,
			nationalId: (sorted[0]?.number ?? "").slice(1),
			professionCode,
			name,
			locations: [...locations.values()],
			qualifications,
		});
	}
	if (result.lines === 0) throw new Error("not the Health Board's register: no <asutus> record");
	return result;
}
