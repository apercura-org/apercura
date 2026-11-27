import {
	type CareKind,
	careKindsOfListing,
	listingOfCareKind,
	SEARCH_ALIASES,
	type SearchAliasLanguage,
} from "@apercura/core/taxonomy";
import { describe, expect, it } from "vitest";
import { messagesFor } from "~/i18n/catalogs";
import {
	CATALOG_LANGUAGES,
	LOCALES,
	MARKET_COUNTRIES,
	MARKET_LOCALES,
	type MarketCountry,
	marketOf,
} from "~/i18n/locales";
import {
	labelForms,
	listingLabel,
	normalizeText,
	resolveSearchTerm,
	type SearchTerm,
	translateSearchTerm,
} from "./listing-index";

/*
 * Every market's words for a kind of care (`CARE_KINDS`) must reach that kind's listing in every
 * other market that lists it, from the pages of every interface language: "hôpital" typed on
 * /fr for Warszawa or Madrid, "nemocnice" on /cz for Kraków. The words are every market's search
 * aliases and listing labels, by language: the test grows with the markets and their words.
 */

/** A word as the search compares it, near enough: no case, accents, `ß` or trailing "s". */
function folded(word: string): string {
	return normalizeText(word.replace(/ß/g, "ss"))
		.split(" ")
		.map((part) => part.replace(/s$/, ""))
		.join(" ");
}

type KindWord = { word: string; kinds: CareKind[]; other: boolean };

/**
 * The words of a language naming a listing in any market's aliases or labels, with the kinds of
 * care they name: those every listing naming the word lists ("orthodontiste": orthodontics,
 * where the UK's dental practices list dentistry too), and whether one of those listings is no
 * kind of care (France's `medecin` for "Arzt"), which the search there reads as it is.
 */
function wordsOf(language: SearchAliasLanguage): KindWord[] {
	const words = new Map<string, KindWord>();
	const add = (word: string, slug: string, country: MarketCountry) => {
		const kinds = careKindsOfListing(slug, country);
		const key = folded(word);
		const entry = words.get(key);
		if (!entry) words.set(key, { word, kinds, other: kinds.length === 0 });
		else {
			entry.kinds = entry.kinds.filter((kind) => kinds.includes(kind));
			entry.other ||= kinds.length === 0;
		}
	};
	for (const country of MARKET_COUNTRIES) {
		const listings = SEARCH_ALIASES[country][language]?.listings ?? {};
		for (const [slug, aliases] of Object.entries(listings)) {
			for (const word of aliases) add(word, slug, country);
		}
	}
	for (const locale of LOCALES) {
		if (CATALOG_LANGUAGES[locale] !== language) continue;
		const listing = messagesFor(locale).taxonomy.listing as Record<string, string>;
		for (const [slug, message] of Object.entries(listing)) {
			if (listingLabel(slug, locale) === null) continue;
			for (const word of labelForms(message)) add(word, slug, marketOf(locale));
		}
	}
	return [...words.values()];
}

/** The words of a language naming kinds of care, and nothing else. */
function kindWordsOf(language: SearchAliasLanguage): KindWord[] {
	return wordsOf(language).filter((entry) => entry.kinds.length > 0 && !entry.other);
}

/** The listings of a market listing some of the kinds (France: its imported professions). */
function listedListings(kinds: CareKind[], country: MarketCountry): Set<string> {
	const slugs = kinds.map((kind) => listingOfCareKind(kind, country));
	return new Set(
		slugs.filter(
			(slug): slug is string =>
				slug !== null && listingLabel(slug, MARKET_LOCALES[country]) !== null,
		),
	);
}

const ownReadings = new Map<string, SearchTerm | null>();

/** How a market reads a word in its own words (`resolveSearchTerm`), once per word and market. */
function ownReading(word: string, country: MarketCountry): SearchTerm | null {
	const key = `${country} ${word}`;
	if (!ownReadings.has(key)) ownReadings.set(key, resolveSearchTerm(word, country));
	return ownReadings.get(key) ?? null;
}

/** Each interface locale's language and market, once per pair. */
const PAGES = [
	...new Map(
		LOCALES.map((locale) => {
			const language = CATALOG_LANGUAGES[locale] as SearchAliasLanguage;
			const from = marketOf(locale);
			return [`${language}@${from}`, { language, from }] as const;
		}),
	).values(),
];

describe("a kind of care searched from another market", () => {
	it("reaches the kind's listing in every market listing it, in every interface language", () => {
		const misses: string[] = [];
		let checked = 0;
		for (const { language, from } of PAGES) {
			for (const { word, kinds } of kindWordsOf(language)) {
				for (const to of MARKET_COUNTRIES) {
					const [slug, ...others] = listedListings(kinds, to);
					if (to === from || !slug || others.length > 0) continue;
					// The market's own words come first: one naming another of its listings is read so.
					const own = ownReading(word, to);
					if (own?.kind === "listing" && own.slug !== slug) continue;
					checked++;
					const term = translateSearchTerm(word, from, to);
					if (term?.kind !== "listing" || term.slug !== slug) {
						misses.push(
							`${language} "${word}" ${from} → ${to}: ${JSON.stringify(term)}, not ${slug}`,
						);
					}
				}
			}
		}
		expect(checked).toBeGreaterThan(1000);
		expect(misses).toEqual([]);
	});

	it("keeps the market's own reading where the market does not list the kind", () => {
		const changed: string[] = [];
		for (const { language, from } of PAGES) {
			for (const { word, kinds } of kindWordsOf(language)) {
				for (const to of MARKET_COUNTRIES) {
					if (to === from || listedListings(kinds, to).size > 0) continue;
					const term = translateSearchTerm(word, from, to);
					// A listing there is only ever the market's own reading of the word.
					const own = ownReading(word, to);
					if (term?.kind === "listing" && (own?.kind !== "listing" || own.slug !== term.slug)) {
						changed.push(`${language} "${word}" ${from} → ${to}: ${term.slug}`);
					}
				}
			}
		}
		expect(changed).toEqual([]);
	});

	it("reaches Poland's and Spain's hospitals from a French page", () => {
		const listing = (slug: string) => ({ kind: "listing", slug });
		expect(translateSearchTerm("hôpital", "FR", "PL")).toEqual(listing("szpitale"));
		expect(translateSearchTerm("Hôpital", "FR", "ES")).toEqual(listing("hospitales"));
		expect(translateSearchTerm("un hôpital", "FR", "PL")).toEqual(listing("szpitale"));
		expect(translateSearchTerm("hôpitaux", "FR", "PL")).toEqual(listing("szpitale"));
		expect(translateSearchTerm("hopital", "FR", "ES")).toEqual(listing("hospitales"));
		// As English and German did already.
		expect(translateSearchTerm("hospital", "GB", "PL")).toEqual(listing("szpitale"));
		expect(translateSearchTerm("Krankenhaus", "DE", "PL")).toEqual(listing("szpitale"));
		// Czechia lists no hospital, but its word for one is a hospital elsewhere.
		expect(translateSearchTerm("nemocnice", "CZ", "PL")).toEqual(listing("szpitale"));
	});

	it("reaches Finland's listings from other markets' words, and theirs from Finnish ones", () => {
		const listing = (slug: string) => ({ kind: "listing", slug });
		expect(translateSearchTerm("hôpital", "FR", "FI")).toEqual(listing("sairaalat"));
		expect(translateSearchTerm("dentist", "GB", "FI")).toEqual(listing("hammashoitolat"));
		expect(translateSearchTerm("Zahnarzt", "AT", "FI")).toEqual(listing("hammashoitolat"));
		expect(translateSearchTerm("médecin généraliste", "FR", "FI")).toEqual(
			listing("terveysasemat"),
		);
		expect(translateSearchTerm("sairaala", "FI", "PL")).toEqual(listing("szpitale"));
		expect(translateSearchTerm("hammaslääkäri", "FI", "GB")).toEqual(listing("dental-practices"));
	});

	it("reaches Malta's community pharmacies from other markets' words, and theirs from Malta's", () => {
		const listing = (slug: string) => ({ kind: "listing", slug });
		expect(translateSearchTerm("pharmacie", "FR", "MT")).toEqual(listing("community-pharmacies"));
		expect(translateSearchTerm("pharmacy", "GB", "MT")).toEqual(listing("community-pharmacies"));
		expect(translateSearchTerm("chemist", "IE", "MT")).toEqual(listing("community-pharmacies"));
		expect(translateSearchTerm("Apotheke", "DE", "MT")).toEqual(listing("community-pharmacies"));
		expect(translateSearchTerm("spiżerija", "MT", "IT")).toEqual(listing("farmacie"));
		expect(translateSearchTerm("community pharmacy", "MT", "IE")).toEqual(listing("pharmacy"));
		// Malta lists no hospital and no dentist: the French word stays as typed, the English one
		// reads as care Malta does not list.
		expect(translateSearchTerm("hôpital", "FR", "MT")).toBeNull();
		expect(translateSearchTerm("hospital", "GB", "MT")).toEqual({ kind: "unlisted" });
		expect(translateSearchTerm("dentist", "GB", "MT")).toEqual({ kind: "unlisted" });
	});

	it("falls back as before in a market without the kind", () => {
		// Austria lists no hospital: "hôpital" stays the words typed, "hospital" and
		// "Krankenhaus" read as care Austria does not list.
		expect(translateSearchTerm("hôpital", "FR", "AT")).toBeNull();
		expect(translateSearchTerm("hospital", "GB", "AT")).toEqual({ kind: "unlisted" });
		expect(translateSearchTerm("Krankenhaus", "DE", "AT")).toEqual({ kind: "unlisted" });
		expect(translateSearchTerm("dentiste", "FR", "DE")).toEqual({ kind: "unlisted" });
		expect(translateSearchTerm("Dupont", "FR", "PL")).toBeNull();
	});
});
