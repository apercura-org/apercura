import {
	austria,
	czechia,
	DE_PHARMACY_STATES,
	DE_STATES,
	germany,
	italy,
	spain,
	unitedKingdom,
} from "@apercura/core/country";
import {
	AT_PROFESSIONS,
	CZ_PROFESSIONS,
	DE_PHARMACY,
	DE_PROFESSIONS,
	ES_PROFESSIONS,
	GB_PROFESSIONS,
	hasBillingSectors,
	IT_PROFESSIONS,
	listingHasBillingSectors,
	professionFor,
} from "@apercura/core/taxonomy";
import { type Locale, marketOf } from "~/i18n/locales";
import { marketAdapter } from "./practitioner-key";

/*
 * What the pages of a locale's market can show. France's pages carry the Assurance Maladie
 * facts (agreement sectors, Carte Vitale) and online booking; Austria's sources publish no
 * such facts and the market has no booking.
 */

/** True when `slug` is a listing page of the locale's market (its own taxonomy). */
export function isMarketListingSlug(locale: Locale, slug: string): boolean {
	return marketAdapter(locale).taxonomy.isListingSlug(slug);
}

/** True when the market's pages show the French Assurance Maladie facts (sectors, Carte Vitale). */
export function showsBillingFacts(locale: Locale): boolean {
	return marketOf(locale) === "FR";
}

/** Fees of a listing are stated as sectors (France, physicians), or as agreements, or not at all. */
export function listingFees(locale: Locale, listingSlug: string): "sector" | "other" {
	return showsBillingFacts(locale) && listingHasBillingSectors(listingSlug) ? "sector" : "other";
}

/** Same as {@link listingFees}, for one practitioner's profession. */
export function professionFees(locale: Locale, professionCode: string): boolean {
	return showsBillingFacts(locale) && hasBillingSectors(professionCode);
}

/** True when the market supports online booking (feature by market, ADR 0002 section 3). */
export function marketBooks(locale: Locale): boolean {
	return marketAdapter(locale).features.booking;
}

/**
 * The profession slug of any market's profession code (`10` → `medecin`, `ARZT` → `aerzte`,
 * `GB_GP` → `gp-practices`, `CZ_GP` → `prakticky-lekar`, `ES_PHARMACY` → `farmacias`,
 * `IT_PHARMACY` → `farmacie`, `DE_PHARMACY` → `apotheken`).
 */
export function professionSlugOf(code: string): string {
	return (
		professionFor(code)?.slug ??
		AT_PROFESSIONS[code]?.slug ??
		GB_PROFESSIONS[code]?.slug ??
		CZ_PROFESSIONS[code]?.slug ??
		ES_PROFESSIONS[code]?.slug ??
		IT_PROFESSIONS[code]?.slug ??
		DE_PROFESSIONS[code]?.slug ??
		""
	);
}

/**
 * The sources a practitioner's page is built from, by the activities' source (`at-wien`…),
 * with their licence attribution word for word: what the Austrian page prints as its
 * provenance (CC BY 4.0 requires it). Empty for French sources, whose provenance line is the
 * catalog's.
 */
export function austrianSourcesOf(
	activitySources: readonly (string | undefined)[],
): { name: string; attribution: string }[] {
	const ids = new Set(activitySources.filter(Boolean));
	return austria.registries
		.filter((registry) => ids.has(registry.id) && registry.attribution)
		.map((registry) => ({ name: registry.name, attribution: registry.attribution ?? "" }));
}

/** The UK registry of a site source: a branch surgery comes from the ODS GP practices' reports. */
const GB_REGISTRY_OF_SOURCE: Readonly<Record<string, string>> = { "gb-ods-branch": "gb-ods-gp" };

/**
 * The sources a UK practice's page is built from, with their Open Government Licence
 * attribution word for word: the practice's list (`gb-ods-gp`, `gb-phs-gp`…) and, when one of
 * its places is located by its postcode (Great Britain only: Northern Irish postcodes are not
 * in Code-Point Open), Ordnance Survey's Code-Point Open.
 */
export function ukSourcesOf(
	activities: readonly {
		source?: string;
		site?: { postcode: string | null; geoPrecision: string | null } | null;
	}[],
): { name: string; attribution: string }[] {
	const ids = new Set<string>();
	for (const activity of activities) {
		if (!activity.source) continue;
		ids.add(GB_REGISTRY_OF_SOURCE[activity.source] ?? activity.source);
		const site = activity.site;
		if (site?.postcode && !site.postcode.startsWith("BT") && site.geoPrecision === "street") {
			ids.add("gb-postcodes");
		}
	}
	return unitedKingdom.registries
		.filter((registry) => ids.has(registry.id) && registry.attribution)
		.map((registry) => ({ name: registry.name, attribution: registry.attribution ?? "" }));
}

/**
 * The sources a Czech facility's page is built from, with their CC BY 4.0 attribution word for
 * word: the NRPZS (its name, address, kind and fields of care) and RÚIAN (ČÚZK), whose regions,
 * districts and municipalities place it.
 */
export function czechSourcesOf(): { name: string; attribution: string }[] {
	return czechia.registries
		.filter((registry) => registry.attribution)
		.map((registry) => ({ name: registry.name, attribution: registry.attribution ?? "" }));
}

/** The REGCESS source of Spain's centres: its attribution takes the date of the data. */
export const REGCESS_SOURCE_ID = "es-regcess";

/**
 * The attribution of a Spanish source, word for word: the Ministry of Health's legal notice
 * asks for the source and the date of its last update ("Fuente: Ministerio de Sanidad, REGCESS,
 * actualizado 1 de diciembre de 2026"), so REGCESS's line takes the date of the import the page
 * is built from, written in Spanish whatever the interface. Without a date (no import recorded)
 * the line is the source alone.
 */
export function spanishAttribution(sourceId: string, updatedAt: string | null): string {
	const registry = spain.registries.find((source) => source.id === sourceId);
	const attribution = registry?.attribution ?? "";
	if (sourceId !== REGCESS_SOURCE_ID || !updatedAt) return attribution;
	const date = new Intl.DateTimeFormat("es-ES", {
		dateStyle: "long",
		timeZone: "UTC",
	}).format(new Date(`${updatedAt.slice(0, 10)}T00:00:00Z`));
	return `${attribution}, actualizado ${date}`;
}

/**
 * The sources a Spanish centre's page is built from, with the attribution each requires word for
 * word: REGCESS (Ministerio de Sanidad: its name, kind, care units and address), dated by
 * `updatedAt` (the last Spanish import, `YYYY-MM-DD`), and the IGN (CC BY 4.0), whose
 * communities, provinces and municipalities place it.
 */
export function spanishSourcesOf(
	updatedAt: string | null,
): { name: string; attribution: string }[] {
	return spain.registries
		.filter((registry) => registry.attribution)
		.map((registry) => ({
			name: registry.name,
			attribution: spanishAttribution(registry.id, updatedAt),
		}));
}

/** The ISTAT boundaries that place Italy's sites (no date: they are a year's, named in the line). */
export const ISTAT_SOURCE_ID = "it-istat";

/**
 * The file key of an Italian list in `directory.etl_runs.files` (`farmacie`), by its source id
 * (`it-farmacie`, also its sites' source).
 */
export const IT_FILE_OF_SOURCE: Readonly<Record<string, string>> = {
	"it-farmacie": "farmacie",
	"it-parafarmacie": "parafarmacie",
	"it-posti-letto": "posti-letto",
};

/**
 * The date of an Italian list's data (`YYYY-MM-DD`): the publication date of the file the last
 * Italian import read (its `Last-Modified`), else the day of that import; null before any.
 */
export function italianSourceDate(
	sourceId: string | undefined,
	status: { importedAt: string; files: Readonly<Record<string, string>> } | null,
): string | null {
	if (!status) return null;
	const file = sourceId ? IT_FILE_OF_SOURCE[sourceId] : undefined;
	return (file ? status.files[file] : undefined) ?? status.importedAt;
}

/**
 * The attribution of an Italian source, word for word: the Italian Open Data Licence asks for
 * the source and the licensor, and the Ministry of Health's lists are cited with the date of
 * their data ("Fonte: Ministero della Salute, Farmacie, IODL 2.0, aggiornato al 26 novembre
 * 2026"), written in Italian whatever the interface. Without a date (no import recorded) the
 * line is the source alone; ISTAT's names the year of its boundaries itself.
 */
export function italianAttribution(sourceId: string, updatedAt: string | null): string {
	const registry = italy.registries.find((source) => source.id === sourceId);
	const attribution = registry?.attribution ?? "";
	if (sourceId === ISTAT_SOURCE_ID || !updatedAt || !attribution) return attribution;
	const date = new Intl.DateTimeFormat("it-IT", { dateStyle: "long", timeZone: "UTC" }).format(
		new Date(`${updatedAt.slice(0, 10)}T00:00:00Z`),
	);
	return `${attribution}, aggiornato al ${date}`;
}

/**
 * The sources an Italian page is built from, with the attribution each requires word for word:
 * the ministry's list of the place (pharmacies, parapharmacies or hospital bed counts), dated by
 * `updatedAt` (`YYYY-MM-DD`), and ISTAT's boundaries (CC BY 4.0), whose municipalities place it.
 */
export function italianSourcesOf(
	activitySources: readonly (string | undefined)[],
	updatedAt: string | null,
): { name: string; attribution: string }[] {
	const ids = new Set([...activitySources.filter(Boolean), ISTAT_SOURCE_ID]);
	return italy.registries
		.filter((registry) => ids.has(registry.id) && registry.attribution)
		.map((registry) => ({
			name: registry.name,
			attribution: italianAttribution(registry.id, updatedAt),
		}));
}

/**
 * The German registry of a site source: a prevention or rehabilitation clinic comes from the
 * same directory as the hospitals (Destatis publishes both in one workbook).
 */
const DE_REGISTRY_OF_SOURCE: Readonly<Record<string, string>> = {
	"de-destatis-rhv": "de-destatis-khv",
};

/** The Destatis municipalities' directory, which places every German facility. */
const DE_PLACES_REGISTRY = "de-destatis-gv";

/**
 * The sources a German facility's page is built from, with the attribution each requires word
 * for word: the facility's list (the Destatis directory, Thuringia's or Brandenburg's pharmacies)
 * and Destatis's municipalities' directory, which places it.
 */
export function germanSourcesOf(
	activitySources: readonly (string | undefined)[],
): { name: string; attribution: string }[] {
	const ids = new Set<string>();
	for (const source of activitySources) {
		if (source) ids.add(DE_REGISTRY_OF_SOURCE[source] ?? source);
	}
	if (ids.size === 0) return [];
	ids.add(DE_PLACES_REGISTRY);
	return germany.registries
		.filter((registry) => ids.has(registry.id) && registry.attribution)
		.map((registry) => ({ name: registry.name, attribution: registry.attribution ?? "" }));
}

/**
 * The open-data sources of a page in a market whose licences require their attribution
 * (Austria's and Czechia's CC BY 4.0, the UK's OGL, Spain's Ministry of Health and IGN, Italy's
 * IODL 2.0 and CC BY 4.0, Germany's Destatis, CC BY 4.0 and dl-de/by-2-0 sources); empty for
 * France, whose provenance line is the catalog's. `sourceDate` dates Spain's REGCESS line and
 * Italy's list.
 */
export function openDataSourcesOf(
	country: string,
	activities: Parameters<typeof ukSourcesOf>[0],
	sourceDate: string | null = null,
): { name: string; attribution: string }[] {
	if (country === "AT") return austrianSourcesOf(activities.map((activity) => activity.source));
	if (country === "GB") return ukSourcesOf(activities);
	if (country === "CZ") return activities.length > 0 ? czechSourcesOf() : [];
	if (country === "ES") return activities.length > 0 ? spanishSourcesOf(sourceDate) : [];
	if (country === "IT") {
		return activities.length > 0
			? italianSourcesOf(
					activities.map((activity) => activity.source),
					sourceDate,
				)
			: [];
	}
	if (country === "DE") return germanSourcesOf(activities.map((activity) => activity.source));
	return [];
}

/**
 * The Länder whose pharmacies a German listing covers, in the locale's words ("Thüringen und
 * Brandenburg"), when the listing is Germany's pharmacies: no other Land publishes a current
 * list of its pharmacies as open data. Null for any other listing.
 */
export function pharmacyCoverageOf(locale: Locale, listingSlug: string): string | null {
	if (marketOf(locale) !== "DE" || listingSlug !== DE_PROFESSIONS[DE_PHARMACY]?.slug) return null;
	return new Intl.ListFormat(locale, { type: "conjunction" }).format(
		DE_PHARMACY_STATES.map((code) => DE_STATES[code] ?? code),
	);
}
