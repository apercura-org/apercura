/**
 * Text of the Swedish lists: cells cleaned of stray spaces, municipality names compared without
 * case, hyphens or spaces, and the licences of the lists' DCAT distributions. Pure.
 */

/** A cell trimmed, its spaces (tabs, line breaks, no-break spaces) collapsed (`Apotek Hjärtat  AB` → `Apotek Hjärtat AB`). */
export function cleanText(value: string | null | undefined): string {
	return (value ?? "")
		.replace(/^\uFEFF/, "")
		.replace(/\s+/g, " ")
		.trim();
}

/** A municipality's or town's name as compared (`Upplands-Väsby`, `UPPLANDS VÄSBY` → `upplands väsby`). */
export function placeKey(value: string | null | undefined): string {
	return cleanText(value)
		.toLocaleLowerCase("sv-SE")
		.replace(/[-\u2010\u2013]/g, " ")
		.replace(/\s+kommun$/, "")
		.replace(/\s+/g, " ")
		.trim();
}

/** Thrown when a list's distribution no longer names the licence the import relies on. */
export class LicenceChangedError extends Error {
	constructor(detail: string) {
		super(`licence changed: ${detail}`);
	}
}

const DCT_LICENSE = "http://purl.org/dc/terms/license";

/**
 * Reads a DCAT distribution as EntryScape serves it (RDF/JSON: subject → predicate → objects)
 * and checks that its `dct:license` is `expected`. Throws `LicenceChangedError` otherwise.
 */
export function checkSeLicence(raw: string, expected: string): void {
	let graph: unknown;
	try {
		graph = JSON.parse(raw);
	} catch {
		throw new LicenceChangedError("the distribution's metadata is not JSON");
	}
	if (typeof graph !== "object" || graph === null) {
		throw new LicenceChangedError("the distribution's metadata is not an RDF graph");
	}
	const licences: string[] = [];
	for (const predicates of Object.values(graph as Record<string, unknown>)) {
		if (typeof predicates !== "object" || predicates === null) continue;
		const objects = (predicates as Record<string, unknown>)[DCT_LICENSE];
		if (!Array.isArray(objects)) continue;
		for (const object of objects) {
			const value = (object as { value?: unknown } | null)?.value;
			if (typeof value === "string") licences.push(value.trim());
		}
	}
	const normalise = (uri: string) => uri.replace(/^https:/, "http:").replace(/\/?$/, "/");
	if (licences.length === 0) throw new LicenceChangedError("the distribution names no licence");
	if (!licences.some((licence) => normalise(licence) === normalise(expected))) {
		throw new LicenceChangedError(`the distribution names ${licences.join(", ")}, not ${expected}`);
	}
}

/** An Excel serial day (`42248`) or an ISO date (`2015-09-01`) as `YYYY-MM-DD`, or null. */
export function excelDate(value: string): string | null {
	const text = cleanText(value);
	if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
		const iso = text.slice(0, 10);
		return Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ? null : iso;
	}
	if (!/^\d{4,5}(?:\.\d+)?$/.test(text)) return null;
	const serial = Math.floor(Number(text));
	// Excel's day 1 is 1900-01-01, counted from 1899-12-30 past its 1900 leap-year bug.
	if (serial < 20_000 || serial > 80_000) return null;
	return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000).toISOString().slice(0, 10);
}
