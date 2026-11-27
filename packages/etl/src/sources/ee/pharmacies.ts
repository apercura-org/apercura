/**
 * The State Agency of Medicines' register of activity licences (Ravimiamet, "Ravimiameti
 * tegevuslubade register", CC0 1.0 on andmed.eesti.ee): its "Apteekide koondandmed", every
 * pharmacy and branch pharmacy on a row of its own, as the register's public search page
 * exports it (a CSV, `;`, quoted, UTF-8 with a BOM): name, address, the Land Board's address id
 * (`ADR_ID`) and object id, kind (general, hospital or veterinary pharmacy), licence number,
 * place of business code, responsible pharmacist, phone, fax, e-mail and licence holder.
 *
 * Read: the name, address, address id, kind, licence number, place of business code (the
 * page's key) and phone. Never read: the responsible pharmacist (a person), fax, e-mail and the
 * licence holder (a company, or a person). Only general pharmacies (üldapteek) are listed: a
 * hospital pharmacy serves its wards and a veterinary one animals.
 *
 * The export is the search page's own button ("Apteekide koondandmed"): `fetchPharmacies`
 * opens the page, then submits its form as a browser does, with the page's hidden fields and
 * default choices, and expects the CSV attachment. Nothing is guessed or bypassed: a changed
 * page fails the source, which keeps its pharmacies.
 */
import { writeFile } from "node:fs/promises";
import { toE164Ee } from "@apercura/core";
import { EE_PHARMACY } from "@apercura/core/taxonomy";
import { USER_AGENT } from "../../lib/files";
import { mapColumns, parseQuotedRecord } from "../../lib/text";
import { clean, firstAddress, providerName } from "./names";
import {
	type EeProvider,
	emptyResult,
	type ParseResult,
	EE_QUALIFICATION_SOURCES as Q,
	quarantine,
	skip,
} from "./types";

/** A published number shared by more pharmacies than this is a chain's, not a pharmacy's own. */
export const MAX_PHONE_OWNERS = 3;

/** The pharmacies' search page of the register (`ETL_EE_APTEEGID_URL`). */
export const DEFAULT_EE_PHARMACIES_URL =
	"https://rkav.tehik.ee/rkav/faces/pages/tegevuslubaForm/tegevuslubaOtsing.xhtml";

/** The label of the page's export button. */
const EXPORT_BUTTON = "Apteekide koondandmed";

const COLUMNS = {
	name: "Apteegi nimi",
	address: "Apteegi aadress",
	adrId: "ADR_ID",
	kind: "Apteegi liik",
	licence: "Tegevusloa number",
	code: "Tegutsemiskoha kood",
	phone: "Telefon",
} as const;

/** The kind of pharmacy listed: a general pharmacy, open to the public. */
const GENERAL_PHARMACY = "Üldapteek";

/** Reads the export. Throws when it is not one (a missing column, no row). */
export function parsePharmacies(data: Buffer | string): ParseResult {
	const textData = (typeof data === "string" ? data : data.toString("utf8")).replace(/^﻿/, "");
	const result = emptyResult("apteegid");
	const lines = textData.split(/\r?\n/);
	const header = parseQuotedRecord(lines[0] ?? "", ";");
	if (!header) throw new Error("not the pharmacies' export: no header");
	const at = mapColumns("apteekide koondandmed", header, COLUMNS);
	const phoneOwners = new Map<string, Set<string>>();
	const rows: (EeProvider & { rawPhone: string | null })[] = [];
	for (let index = 1; index < lines.length; index++) {
		const line = lines[index] ?? "";
		if (!line.trim()) continue;
		const lineNo = index + 1;
		result.lines++;
		const fields = parseQuotedRecord(line, ";");
		const value = (key: keyof typeof COLUMNS) => clean(fields?.[at[key]]);
		const code = value("code");
		if (!fields || !/^[1-9]\d{0,6}$/.test(code)) {
			quarantine(result, lineNo, "place of business code", code || "-");
			continue;
		}
		const kind = value("kind");
		if (kind !== GENERAL_PHARMACY) {
			skip(result, kind ? `${kind.toLowerCase()}` : "no kind");
			continue;
		}
		const name = providerName(value("name"));
		const address = firstAddress(value("address"));
		if (!name || !address) {
			quarantine(result, lineNo, name ? "address" : "name", code);
			continue;
		}
		const raw = value("phone");
		const phone = raw ? toE164Ee(raw) : null;
		if (raw && !phone) result.counters.invalidPhones++;
		if (phone) {
			const owners = phoneOwners.get(phone) ?? new Set<string>();
			owners.add(code);
			phoneOwners.set(phone, owners);
		}
		const licence = value("licence");
		rows.push({
			source: "apteegid",
			lineNo,
			nationalId: code,
			professionCode: EE_PHARMACY,
			name,
			locations: [{ address, adrId: /^\d+$/.test(value("adrId")) ? value("adrId") : null, phone }],
			qualifications: /^\d+$/.test(licence)
				? [{ source: Q.pharmacyLicence, code: licence, label: GENERAL_PHARMACY }]
				: [],
			rawPhone: phone,
		});
	}
	const seen = new Set<string>();
	for (const { rawPhone, ...row } of rows) {
		if (seen.has(row.nationalId)) {
			skip(result, "duplicate");
			continue;
		}
		seen.add(row.nationalId);
		const location = row.locations[0];
		if (location && rawPhone && (phoneOwners.get(rawPhone)?.size ?? 0) > MAX_PHONE_OWNERS) {
			result.counters.sharedPhones++;
			location.phone = null;
		}
		result.rows.push(row);
	}
	if (result.lines === 0) throw new Error("not the pharmacies' export: no row");
	return result;
}

/** The attributes of an HTML tag (`<input type="hidden" name="…" value="…" />`). */
function attributes(tag: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const match of tag.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) {
		out[(match[1] ?? "").toLowerCase()] = (match[2] ?? "")
			.replace(/&amp;/g, "&")
			.replace(/&quot;/g, '"')
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&#39;/g, "'");
	}
	return out;
}

/**
 * The form a page's export button submits, as a browser would send it: the form's action, its
 * hidden and text inputs with their values, each select's selected (else first) option, and the
 * button itself. Null when no form holds a submit button labelled `button`.
 */
export function exportForm(
	html: string,
	button: string = EXPORT_BUTTON,
): { action: string; fields: [string, string][] } | null {
	for (const match of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)) {
		const body = match[2] ?? "";
		const submit = [...body.matchAll(/<input\b[^>]*>/g)]
			.map((tag) => attributes(tag[0]))
			.find((input) => input.type === "submit" && input.value === button && input.name);
		if (!submit?.name) continue;
		const action = attributes(`<form ${match[1] ?? ""}>`).action;
		if (!action) continue;
		const fields: [string, string][] = [];
		for (const tag of body.matchAll(/<input\b[^>]*>/g)) {
			const input = attributes(tag[0]);
			const type = (input.type ?? "text").toLowerCase();
			if (
				!input.name ||
				["submit", "button", "checkbox", "radio", "image", "file"].includes(type)
			) {
				continue;
			}
			fields.push([input.name, input.value ?? ""]);
		}
		for (const select of body.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
			const name = attributes(`<select ${select[1] ?? ""}>`).name;
			if (!name) continue;
			const options = [...(select[2] ?? "").matchAll(/<option\b([^>]*)>/g)].map((option) =>
				attributes(`<option ${option[1] ?? ""}>`),
			);
			const chosen = options.find((option) => "selected" in option) ?? options[0];
			fields.push([name, chosen?.value ?? ""]);
		}
		fields.push([submit.name, button]);
		return { action, fields };
	}
	return null;
}

/** The cookies a response sets, as a `cookie` header. */
function cookiesOf(response: Response, jar: Map<string, string>): string {
	for (const cookie of response.headers.getSetCookie()) {
		const [pair] = cookie.split(";");
		const eq = pair?.indexOf("=") ?? -1;
		if (pair && eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
	}
	return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

/**
 * Downloads the export to `path`: opens the search page, then submits its export button's form.
 * Returns the URL the file came from. Throws when the page has no such form or the answer is
 * not a CSV attachment.
 */
export async function fetchPharmacies(pageUrl: string, path: string): Promise<string> {
	const jar = new Map<string, string>();
	const page = await fetch(pageUrl, {
		headers: { "user-agent": USER_AGENT },
		signal: AbortSignal.timeout(60_000),
	});
	if (!page.ok) throw new Error(`GET ${pageUrl} answered ${page.status}`);
	const cookie = cookiesOf(page, jar);
	const form = exportForm(await page.text());
	if (!form) throw new Error(`the register's page has no "${EXPORT_BUTTON}" form`);
	const action = new URL(form.action, page.url || pageUrl).toString();
	const answer = await fetch(action, {
		method: "POST",
		headers: {
			"user-agent": USER_AGENT,
			"content-type": "application/x-www-form-urlencoded",
			referer: page.url || pageUrl,
			...(cookie ? { cookie } : {}),
		},
		body: new URLSearchParams(form.fields).toString(),
		signal: AbortSignal.timeout(120_000),
	});
	if (!answer.ok) throw new Error(`POST ${action} answered ${answer.status}`);
	const disposition = answer.headers.get("content-disposition") ?? "";
	if (!/\.csv/i.test(disposition)) {
		throw new Error(
			`the register answered no CSV attachment (${answer.headers.get("content-type")})`,
		);
	}
	await writeFile(path, Buffer.from(await answer.arrayBuffer()));
	return action.replace(/;jsessionid=[^?]*/i, "");
}
