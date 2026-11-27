/**
 * Names, addresses and keys of the German facilities. The sources write names the way their
 * operators register them ("DIAKO Krankenhaus gGmbH", "Asklepios Klinik Nord – Heidberg –
 * Stationäre Behandlung"); a page prints the facility, not its company: legal forms and the
 * directory's own site labels ("Hauptstandort", "Stationäre Behandlung") are dropped, nothing is
 * re-cased or re-spelled.
 */
import { createHash } from "node:crypto";

/** Collapses whitespace and trims. */
export const clean = (value: string | null | undefined) =>
	(value ?? "").replace(/\s+/g, " ").trim();

/**
 * Legal forms at the end of a name, longest first: `gGmbH & Co. KG`, `GmbH`, `mbH`, `e.V.`,
 * `SE & Co. KG`, `AöR`… A name that is only a legal form keeps it.
 */
const LEGAL_FORM =
	/(?:[\s,]+(?:g?GmbH\s*&\s*Co\.?\s*KG(?:aA)?|SE\s*&\s*Co\.?\s*KG|AG\s*&\s*Co\.?\s*KG|g?GmbH|gemeinnützige GmbH|mbH|g?AG|SE|KGaA|KG|OHG|e\.\s?V\.|eG|gUG(?:\s*\(haftungsbeschränkt\))?|UG(?:\s*\(haftungsbeschränkt\))?|AöR|KdöR|Anstalt des öffentlichen Rechts|Körperschaft des öffentlichen Rechts))+\s*$/i;

/** A name without the legal forms it ends with (`Probe-Krankenhaus Flensburg gGmbH` → `Probe-Krankenhaus Flensburg`). */
export function withoutLegalForm(name: string): string {
	const text = clean(name);
	const stripped = text.replace(LEGAL_FORM, "").replace(/[\s,–-]+$/, "");
	return stripped || text;
}

/**
 * The directory's labels of a site that say nothing to a patient: the kind of treatment the
 * site was registered for and the main site's label.
 */
const SITE_LABELS =
	/(?:^|\s*[–—-]\s*|\s+)(?:(?:teil)?station[äa]re Behandlung|tagesklinische Behandlung|Hauptstandort|Standort)\s*$/i;

/** A site name without the directory's labels (`Campus Nord – Stationäre Behandlung` → `Campus Nord`). */
export function siteLabel(site: string): string {
	let text = clean(site);
	for (let previous = ""; previous !== text; ) {
		previous = text;
		text = text.replace(SITE_LABELS, "").replace(/[\s,–—-]+$/, "");
	}
	return withoutLegalForm(text);
}

/** Lowercase letters and digits, the way two names are compared. */
export const nameKey = (value: string) =>
	value
		.toLowerCase()
		.replace(/ß/g, "ss")
		.normalize("NFKD")
		.replace(/\p{Mark}/gu, "")
		.replace(/[^a-z0-9]+/g, "");

/**
 * The name a hospital site's page prints: the hospital's, followed by the site's when the
 * hospital has several sites and the site's name adds something (`Universitätsklinikum
 * Beispielstadt – Campus Nord`); the site's alone when it already names the hospital.
 */
export function hospitalSiteName(hospital: string, site: string, sites: number): string {
	const base = withoutLegalForm(hospital);
	const label = siteLabel(site);
	if (!label) return base;
	const baseKey = nameKey(base);
	const labelKey = nameKey(label);
	if (labelKey === baseKey || baseKey.includes(labelKey)) return base;
	if (labelKey.includes(baseKey)) return label;
	return sites > 1 ? `${base} – ${label}` : base;
}

/**
 * A Gemeinde or Kreis name of the municipalities' directory without its status
 * (`Flensburg, Stadt` → `Flensburg`, `Garching b.München, St` → `Garching b.München`), the slash
 * of a river written tight (`Lauenburg/ Elbe` → `Lauenburg/Elbe`).
 */
export function municipalityName(raw: string): string {
	return clean(raw.split(",")[0]).replace(/\s*\/\s*/g, "/");
}

/** Street and house number (`Knuthstraße`, `1` → `Knuthstraße 1`), or null without a street. */
export function streetLine(
	street: string | null | undefined,
	number?: string | null,
): string | null {
	const name = clean(street);
	if (!name) return null;
	const houseNumber = clean(number);
	return houseNumber ? `${name} ${houseNumber}` : name;
}

/**
 * A facility's derived key: ten hexadecimal digits of the SHA-256 of what it is, its municipality
 * code (or town), street, house number and names, compared without case, accents, spaces or
 * punctuation and with `Str.` read as `Straße`, so an edition that adds a dash or abbreviates a
 * street keeps the page. A renamed hospital or a moved site gets a new page.
 */
export function deSiteKey(parts: readonly (string | null | undefined)[]): string {
	const text = parts
		.map((part) => nameKey(clean(part).replace(/str\.(?=\s|\d|$)/gi, "straße")))
		.join("|");
	return createHash("sha256").update(text).digest("hex").slice(0, 10);
}
