import "server-only";

import { countryAdapter } from "@apercura/core/country";
import type { MarketCountry } from "~/i18n/locales";
import { sourceLine } from "~/lib/home";
import { getSwissCoverage } from "./swiss-coverage";

/**
 * The sources a market's home credits (its figures and its specimen page): the registries of
 * its practitioners or facilities, Switzerland's only where a list was imported. Null for
 * France, whose register the catalog names ("Annuaire Santé, Agence du numérique en santé").
 */
export async function getHomeSources(country: MarketCountry): Promise<string | null> {
	if (country === "FR") return null;
	const coverage = country === "CH" ? await getSwissCoverage() : null;
	return sourceLine(country, countryAdapter(country).registries, coverage?.registries);
}
