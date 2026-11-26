import { austria, czechia, spain, unitedKingdom } from "@apercura/core/country";
import {
	AT_PROFESSIONS,
	CZ_PROFESSIONS,
	ES_PROFESSIONS,
	GB_PROFESSIONS,
	hasBillingSectors,
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
 * `GB_GP` → `gp-practices`, `CZ_GP` → `prakticky-lekar`, `ES_PHARMACY` → `farmacias`).
 */
export function professionSlugOf(code: string): string {
	return (
		professionFor(code)?.slug ??
		AT_PROFESSIONS[code]?.slug ??
		GB_PROFESSIONS[code]?.slug ??
		CZ_PROFESSIONS[code]?.slug ??
		ES_PROFESSIONS[code]?.slug ??
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

/**
 * The open-data sources of a page in a market whose licences require their attribution
 * (Austria's and Czechia's CC BY 4.0, the UK's OGL, Spain's Ministry of Health and IGN); empty
 * for France, whose provenance line is the catalog's. `sourceDate` dates Spain's REGCESS line.
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
	return [];
}
