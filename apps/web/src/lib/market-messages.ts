import {
	allAtListingSlugs,
	allChListingSlugs,
	allCzListingSlugs,
	allDeTaxonomySlugs,
	allEeTaxonomySlugs,
	allEsTaxonomySlugs,
	allGbListingSlugs,
	allItListingSlugs,
	allListingSlugs,
	allPlListingSlugs,
} from "@apercura/core/taxonomy";
import type { MarketCountry } from "~/i18n/locales";

type Messages = Record<string, unknown>;

const isObject = (value: unknown): value is Messages =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** The listing and profession slugs of each market's taxonomy. */
const MARKET_SLUGS: Readonly<Record<MarketCountry, ReadonlySet<string>>> = {
	FR: allListingSlugs(),
	AT: allAtListingSlugs(),
	GB: allGbListingSlugs(),
	CZ: allCzListingSlugs(),
	// Spain also names its kinds of centre in the singular (`consultorio-local`).
	ES: allEsTaxonomySlugs(),
	IT: allItListingSlugs(),
	// Germany names its kinds of facility in the singular too (`krankenhaus`, `apotheke`).
	DE: allDeTaxonomySlugs(),
	CH: allChListingSlugs(),
	// Estonia names its kinds of provider in the singular (`perearstikeskus`, `apteek`).
	EE: allEeTaxonomySlugs(),
	PL: allPlListingSlugs(),
};

/** The `taxonomy` groups keyed by listing or profession slug. */
const SLUG_GROUPS = ["listing", "profession"] as const;

/**
 * The messages a client island of `market` receives, without the labels of the other markets'
 * listings and professions (`taxonomy.listing.*`, `taxonomy.profession.*`): a market's pages only
 * ever name its own, so no market's page weight grows when another one opens. A label no market
 * owns is kept.
 */
export function forMarket(messages: Messages, market: MarketCountry): Messages {
	const taxonomy = messages.taxonomy;
	if (!isObject(taxonomy)) return messages;
	const own = MARKET_SLUGS[market];
	const others = new Set<string>();
	for (const [country, slugs] of Object.entries(MARKET_SLUGS)) {
		if (country === market) continue;
		for (const slug of slugs) if (!own.has(slug)) others.add(slug);
	}
	const pruned: Messages = { ...taxonomy };
	for (const group of SLUG_GROUPS) {
		const labels = taxonomy[group];
		if (!isObject(labels)) continue;
		pruned[group] = Object.fromEntries(
			Object.entries(labels).filter(([slug]) => !others.has(slug)),
		);
	}
	return { ...messages, taxonomy: pruned };
}
