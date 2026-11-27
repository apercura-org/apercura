import { isValidRpps, type SearchQuery } from "@apercura/core";
import { type EuropeanPlace, europeanPlaceOf, isEuropeanCityOf } from "@apercura/core/geo";
import {
	type Locale,
	MARKET_COUNTRIES,
	type MarketCountry,
	marketLocaleFor,
	marketOf,
} from "~/i18n/locales";
import type { Href } from "~/i18n/navigation";
import { standoutPlace } from "~/lib/homonyms";
import { listingLabel, translateSearchTerm } from "~/lib/listing-index";
import {
	type LandingTarget,
	landingTarget,
	listingHubExists,
	matchPlaces,
	type PlaceSuggestion,
	placeSiteCounts,
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

/**
 * The place a name means among the homonyms of a market, alone, when one stands out
 * (`standoutPlace`: Vilnius the capital, not the village Vilnius in Kupiškis), counting the
 * places of care only for a main city its places' level and population do not settle; else
 * every homonym, for the search to ask which. The communes of a postcode are all kept.
 */
async function likeliestPlaces(
	country: MarketCountry,
	places: PlaceSuggestion[],
	query: SearchQuery,
): Promise<PlaceSuggestion[]> {
	if (places.length < 2 || query.postcode) return places;
	const found =
		standoutPlace(places, country, query.where) ??
		(isEuropeanCityOf(query.where, country)
			? standoutPlace(
					places,
					country,
					query.where,
					await placeSiteCounts(
						country,
						places.map((place) => place.id),
					),
				)
			: null);
	return found ? [found] : places;
}

async function placesIn(country: MarketCountry, query: SearchQuery): Promise<PlaceSuggestion[]> {
	const places = await matchPlaces({
		country,
		where: query.where,
		...(query.postcode ? { postcode: query.postcode } : {}),
		...(query.departmentHint ? { departmentHint: query.departmentHint } : {}),
	});
	return likeliestPlaces(country, places, query);
}

/**
 * The places of `country` "Où ?" names, and the name they were found by: the name as typed, else,
 * for a city of that country typed in another language ("Rome", "Milan", "Prague"), its own name
 * ("Roma", "Milano", "Praha"), which the market's places carry. Of homonyms, only the one that
 * stands out when one does (`likeliestPlaces`): several places mean the search asks which.
 */
export async function placesOfQuery(
	country: MarketCountry,
	query: SearchQuery,
): Promise<{ places: PlaceSuggestion[]; where: string }> {
	const places = await placesIn(country, query);
	if (places.length > 0 || query.postcode) return { places, where: query.where };
	const named = namedEuropeanPlace(query);
	if (named?.kind !== "city" || named.country.code !== country || !named.city) {
		return { places, where: query.where };
	}
	if (named.city.toLowerCase() === query.where.trim().toLowerCase()) {
		return { places, where: query.where };
	}
	return { places: await placesIn(country, { ...query, where: named.city }), where: named.city };
}

/** A market whose places "Où ?" names, with the listing page of the care asked there, if any. */
type PlaceMarket = {
	country: MarketCountry;
	found: { places: PlaceSuggestion[]; where: string };
	target: LandingTarget | null;
};

/** The largest population among a market's places, or null when one of them has none. */
function populationOf(found: { places: PlaceSuggestion[] }): number | null {
	let largest = 0;
	for (const place of found.places) {
		if (place.population === null) return null;
		largest = Math.max(largest, place.population);
	}
	return largest;
}

/**
 * The market a place typed in "Où ?" is searched in, among the open markets knowing a place of
 * that name ("Bergen": Norway's city and a German Gemeinde): the country whose city `named` is
 * (`@apercura/core/geo`, Europe's main cities: Bergen is Norway's), then `home`, then a market
 * with a listing page for the care asked there, then the largest place when every one carries
 * its population (most markets publish none), then the order of the markets. Null when no
 * market knows the place.
 */
async function marketOfPlace(
	query: SearchQuery,
	home: MarketCountry,
	here: MarketCountry,
	named: EuropeanPlace | null,
): Promise<PlaceMarket | null> {
	const candidate = async (country: MarketCountry): Promise<PlaceMarket | null> => {
		const found = await placesOfQuery(country, query);
		if (found.places.length === 0) return null;
		const term = query.who ? translateSearchTerm(query.who, here, country) : null;
		const place = found.places.length === 1 ? found.places[0] : undefined;
		const target =
			term?.kind === "listing" && place ? await landingTarget(term.slug, place, country) : null;
		return { country, found, target };
	};
	const markets = (
		await Promise.all([home, ...MARKET_COUNTRIES.filter((other) => other !== home)].map(candidate))
	).filter((market): market is PlaceMarket => market !== null);
	const populations = markets.map(({ found }) => populationOf(found));
	const byPopulation = populations.every((population) => population !== null);
	const city = named?.kind === "city" ? named.country.code : null;
	const ranked = markets
		.map((market, order) => ({ market, order, population: populations[order] ?? 0 }))
		.sort(
			(a, b) =>
				Number(b.market.country === city) - Number(a.market.country === city) ||
				Number(b.market.country === home) - Number(a.market.country === home) ||
				Number(b.market.target !== null) - Number(a.market.target !== null) ||
				(byPopulation ? b.population - a.population : 0) ||
				a.order - b.order,
		);
	return ranked[0]?.market ?? null;
}

/**
 * The page a search query names, if any: an RPPS number goes to its
 * practitioner page, a specialty in one place to its listing page, a specialty
 * alone to its hub. Applied by the proxy (a real 307 before anything renders)
 * and again by the page for client-side navigations.
 *
 * A search runs in the market of its page (`locale`), or the one the visitor chose in the form
 * (`chosen`, the `pays` parameter). The place is looked up in every open market, and the search
 * runs in the likeliest that knows it (`marketOfPlace`: that market first, but "Bergen" is
 * Norway's city, not a German Gemeinde), in the visitor's language when that market offers it
 * (`marketLocaleFor`): "Qui ?" is carried over by kind of care (`translateSearchTerm`), to the
 * listing page of the place when there is one,
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
	const elsewhere = (
		country: MarketCountry,
		who: string | null,
		ou: string = where,
	): SearchRedirect => ({
		href: {
			pathname: "/recherche",
			query: {
				...(who ? { quoi: who } : {}),
				...(ou ? { ou } : {}),
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

	const chosenPlace = await marketOfPlace(query, home, here, named);
	if (chosenPlace) {
		const { country, found, target } = chosenPlace;
		if (target) return { href: listingHref(target), locale: marketLocaleFor(country, locale) };
		// The page's own market lists what it finds (homonyms, no listing page, a name), under the
		// name its places carry ("Roma" for "Rome").
		return country === here
			? null
			: elsewhere(
					country,
					whoIn(country),
					found.where === query.where ? where : typedWhere({ ...query, where: found.where }),
				);
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
