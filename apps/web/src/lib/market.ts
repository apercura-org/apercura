import { austria } from "@apercura/core/country";
import {
	AT_PROFESSIONS,
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

/** The profession slug of either market's profession code (`10` → `medecin`, `ARZT` → `aerzte`). */
export function professionSlugOf(code: string): string {
	return professionFor(code)?.slug ?? AT_PROFESSIONS[code]?.slug ?? "";
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
