import { isValidRpps, type SearchQuery } from "@apercura/core";
import { type EuropeanPlace, europeanPlaceOf } from "@apercura/core/geo";
import {
	type Locale,
	MARKET_COUNTRIES,
	type MarketCountry,
	marketLocaleFor,
	marketOf,
} from "~/i18n/locales";
import type { Href } from "~/i18n/navigation";
import { listingLabel, translateSearchTerm } from "~/lib/listing-index";
import {
	type LandingTarget,
	landingTarget,
	listingHubExists,
	matchPlaces,
	type PlaceSuggestion,
	practitionerSlugByRpps,
} from "./queries/search";

/** Where a search goes: a page, in a locale (another market's when the place is there). */
export type SearchRedirect = { href: Href; locale: Locale };

/** Whether a country (ISO code) is one of the open markets. */
export function isOpenMarket(code: string): code is MarketCountry {
	return (MARKET_COUNTRIES as readonly string[]).includes(code);
}

/**
 * The European country or city "Où ?" names (`@apercura/core/geo`), when the place is typed
 * without a postcode: "Allemagne", "Austria", "Berlin", "München"… Null for anything else.
 */
export function namedEuropeanPlace(query: SearchQuery): EuropeanPlace | null {
	return query.where && !query.postcode ? europeanPlaceOf(query.where) : null;
}

/** "Où ?" as typed, with its department hint. */
function typedWhere(query: SearchQuery): string {
	return [query.where || query.postcode, query.departmentHint ? `(${query.departmentHint})` : null]
		.filter(Boolean)
		.join(" ");
}

function listingHref(target: LandingTarget): Href {
	return {
		pathname: "/[specialite]/[dept]/[[...rest]]",
		params: {
			specialite: target.listingSlug,
			dept: target.deptSlug,
			rest: target.communeSlug ? [target.communeSlug] : undefined,
		},
	};
}

function placesIn(country: MarketCountry, query: SearchQuery): Promise<PlaceSuggestion[]> {
	return matchPlaces({
		country,
		where: query.where,
		...(query.postcode ? { postcode: query.postcode } : {}),
		...(query.departmentHint ? { departmentHint: query.departmentHint } : {}),
	});
}

/**
 * The page a search query names, if any: an RPPS number goes to its
 * practitioner page, a specialty in one place to its listing page, a specialty
 * alone to its hub. Applied by the proxy (a real 307 before anything renders)
 * and again by the page for client-side navigations.
 *
 * A search runs in the market of its page (`locale`), or the one the visitor chose in the form
 * (`chosen`, the `pays` parameter). A place that market does not know is looked up in the other
 * open markets, the chosen one first, and the search moves to the first that knows it, in the
 * visitor's language when that market offers it (`marketLocaleFor`): "Qui ?" is carried over by
 * kind of care (`translateSearchTerm`), to the listing page of the place when there is one,
 * else to that market's search with the place set (and the listing, or the name typed).
 *
 * A country typed in "Où ?" (`@apercura/core/geo`) moves the search to that market when it is
 * open ("Autriche": its hub for the care asked, its search for a name, else its home); a country
 * not covered yet, or a city of one that no market knows ("Berlin"), stays on this page, whose
 * search says so and lists the open countries.
 */
export async function searchRedirect(
	query: SearchQuery,
	page: number,
	locale: Locale,
	chosen: MarketCountry | null = null,
): Promise<SearchRedirect | null> {
	const here = marketOf(locale);
	const home = chosen ?? here;
	const where = typedWhere(query);
	const elsewhere = (country: MarketCountry, who: string | null): SearchRedirect => ({
		href: {
			pathname: "/recherche",
			query: {
				...(who ? { quoi: who } : {}),
				...(where ? { ou: where } : {}),
				...(query.near ? { pres: `${query.near.lat},${query.near.lon}` } : {}),
				...(page > 1 ? { page: String(page) } : {}),
			},
		},
		locale: marketLocaleFor(country, locale),
	});
	/** "Qui ?" as the search page of `country` reads it: its listing's label, a name, or nothing. */
	const whoIn = (country: MarketCountry): string | null => {
		if (!query.who) return null;
		const term = translateSearchTerm(query.who, here, country);
		if (term?.kind === "listing") {
			return listingLabel(term.slug, marketLocaleFor(country, locale)) ?? query.who;
		}
		return term ? null : query.who;
	};

	// An RPPS number names a French practitioner only.
	if (query.rpps && home === "FR") {
		const slug = isValidRpps(query.rpps) ? await practitionerSlugByRpps(query.rpps) : null;
		if (slug) {
			return {
				href: { pathname: "/praticien/[slug]", params: { slug } },
				locale: marketLocaleFor("FR", locale),
			};
		}
		return home === here ? null : elsewhere(home, query.who);
	}
	// A later page or a search near the visitor: the chosen market's search lists them.
	if (page !== 1 || query.near) return home === here ? null : elsewhere(home, whoIn(home));

	// "Où ?" names a country. An open market is searched there, from its hub or its home
	// ("Autriche", "UK"); any other country is said not to be covered yet, on this page.
	const named = namedEuropeanPlace(query);
	if (named?.kind === "country") {
		const country = named.country.code;
		if (!isOpenMarket(country)) return null;
		const term = query.who ? translateSearchTerm(query.who, here, country) : null;
		const target = marketLocaleFor(country, locale);
		if (term?.kind === "listing" && (await listingHubExists(term.slug, country))) {
			return {
				href: { pathname: "/[specialite]", params: { specialite: term.slug } },
				locale: target,
			};
		}
		const who = whoIn(country);
		return who
			? { href: { pathname: "/recherche", query: { quoi: who } }, locale: target }
			: { href: "/", locale: target };
	}

	if (!query.where && !query.postcode) {
		const term = query.who ? translateSearchTerm(query.who, here, home) : null;
		if (term?.kind === "listing" && (await listingHubExists(term.slug, home))) {
			return {
				href: { pathname: "/[specialite]", params: { specialite: term.slug } },
				locale: marketLocaleFor(home, locale),
			};
		}
		return home === here ? null : elsewhere(home, whoIn(home));
	}

	for (const country of [home, ...MARKET_COUNTRIES.filter((other) => other !== home)]) {
		const places = await placesIn(country, query);
		if (places.length === 0) continue;
		const term = query.who ? translateSearchTerm(query.who, here, country) : null;
		const place = places.length === 1 ? places[0] : undefined;
		if (term?.kind === "listing" && place) {
			const target = await landingTarget(term.slug, place, country);
			if (target) return { href: listingHref(target), locale: marketLocaleFor(country, locale) };
		}
		// The page's own market lists what it finds (homonyms, no listing page, a name).
		return country === here ? null : elsewhere(country, whoIn(country));
	}
	// No market knows the place: this page says so when it is a city of a country not covered
	// yet ("Berlin"), else the chosen market's search does.
	if (named?.kind === "city") {
		if (!isOpenMarket(named.country.code)) return null;
		// A city of an open market its places do not know yet ("Barcelona" before Spain's places
		// are imported): that market's search says so, never "not covered".
		const country = named.country.code;
		if (country !== here) return elsewhere(country, whoIn(country));
	}
	return home === here ? null : elsewhere(home, whoIn(home));
}
