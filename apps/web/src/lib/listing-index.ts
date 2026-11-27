/**
 * In-memory index of the listing labels (specialties and professions) for the
 * "Qui ?" search: suggestions by word prefix and exact resolution of a typed
 * label to its listing slug. Only the professions imported by default (v1
 * scope) are offered, so a suggestion always leads to practitioners. Besides the
 * catalogs' labels, the words people type ("dentiste", "GP", "zubař") come from
 * each market's search aliases (`@apercura/core/taxonomy`, `SEARCH_ALIASES`).
 */
import {
	allAtListingSlugs,
	allChListingSlugs,
	allCzListingSlugs,
	allDeListingSlugs,
	allEsListingSlugs,
	allGbListingSlugs,
	allItListingSlugs,
	equivalentListing,
	FR_PROFESSIONS,
	professionOfListingSlug,
	SEARCH_ALIASES,
	type SearchAliasLanguage,
} from "@apercura/core/taxonomy";
import { messagesFor } from "~/i18n/catalogs";
import {
	CATALOG_LANGUAGES,
	LOCALES,
	type Locale,
	type MarketCountry,
	marketOf,
} from "~/i18n/locales";

const AT_LISTINGS: ReadonlySet<string> = allAtListingSlugs();
const GB_LISTINGS: ReadonlySet<string> = allGbListingSlugs();
const CZ_LISTINGS: ReadonlySet<string> = allCzListingSlugs();
const ES_LISTINGS: ReadonlySet<string> = allEsListingSlugs();
const IT_LISTINGS: ReadonlySet<string> = allItListingSlugs();
const DE_LISTINGS: ReadonlySet<string> = allDeListingSlugs();
const CH_LISTINGS: ReadonlySet<string> = allChListingSlugs();

/**
 * True when a listing slug belongs to the market of `locale` (France's, Austria's, the UK's,
 * Czechia's, Spain's, Italy's or Germany's taxonomy).
 */
function inMarket(slug: string, locale: Locale): boolean {
	if (marketOf(locale) === "AT") return AT_LISTINGS.has(slug);
	if (marketOf(locale) === "GB") return GB_LISTINGS.has(slug);
	if (marketOf(locale) === "CZ") return CZ_LISTINGS.has(slug);
	if (marketOf(locale) === "ES") return ES_LISTINGS.has(slug);
	if (marketOf(locale) === "IT") return IT_LISTINGS.has(slug);
	if (marketOf(locale) === "DE") return DE_LISTINGS.has(slug);
	if (marketOf(locale) === "CH") return CH_LISTINGS.has(slug);
	const profession = professionOfListingSlug(slug);
	return Boolean(profession && FR_PROFESSIONS[profession]?.enabled);
}

/** Unaccented lowercase words, the same normalization as `directory.text_norm()`. */
export function normalizeText(value: string): string {
	return value
		.replace(/[œŒ]/g, "oe")
		.replace(/[æÆ]/g, "ae")
		.normalize("NFKD")
		.replace(/\p{Mark}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

/**
 * Plain label of a catalog message. Gendered labels are ICU selects
 * (`{gender, select, female {…} other {…}}`): every branch is returned, the
 * `other` branch first, so both forms match a query.
 */
export function labelForms(message: string): string[] {
	const select = /^\{gender, select,(.*)\}$/s.exec(message);
	if (!select?.[1]) return [message];
	const branches = [...select[1].matchAll(/(\w+)\s*\{([^{}]*)\}/g)];
	const other = branches.find((branch) => branch[1] === "other")?.[2];
	const forms = branches.map((branch) => branch[2] ?? "").filter(Boolean);
	return other ? [other, ...forms.filter((form) => form !== other)] : forms;
}

export type ListingEntry = {
	slug: string;
	/** Label shown in suggestions (the `other` form). */
	label: string;
	/** Normalized forms that match: every label form and the slug. */
	keys: string[];
};

function buildIndex(locale: Locale): ListingEntry[] {
	const { taxonomy } = messagesFor(locale);
	const listing = taxonomy.listing as Record<string, string>;
	const professions = taxonomy.profession as Record<string, string>;
	// A Czech, Spanish, Italian, German or Swiss listing is plural ("Kardiologové", "Farmacias",
	// "Farmacie", "Apotheken", "Spitäler"), its profession label singular ("Kardiolog", "Farmacia",
	// "Apotheke", "Spital"): both match.
	const singular = ["CZ", "ES", "IT", "DE", "CH"].includes(marketOf(locale));
	// The everyday words of the locale's language suggest their listing too ("Hausarzt" →
	// Allgemeinmedizin).
	const aliases =
		SEARCH_ALIASES[marketOf(locale)][CATALOG_LANGUAGES[locale] as SearchAliasLanguage]?.listings;
	const entries: ListingEntry[] = [];
	for (const [slug, message] of Object.entries(listing)) {
		if (!inMarket(slug, locale)) continue;
		const profession = singular ? professions[slug] : undefined;
		const forms = [...labelForms(message), ...(profession ? labelForms(profession) : [])];
		const words = (aliases?.[slug] ?? []).flatMap(spellings).map(foldText);
		entries.push({
			slug,
			label: forms[0] ?? slug,
			keys: [
				...new Set([
					...forms.flatMap((form) => [normalizeText(form), foldText(form)]),
					normalizeText(slug),
					...words,
				]),
			],
		});
	}
	return entries.sort((a, b) => a.label.localeCompare(b.label, locale));
}

const indexes = new Map<Locale, ListingEntry[]>();

function indexFor(locale: Locale): ListingEntry[] {
	let index = indexes.get(locale);
	if (!index) {
		index = buildIndex(locale);
		indexes.set(locale, index);
	}
	return index;
}

/** True when every word of the query starts a word of the key. */
function prefixMatch(queryWords: string[], key: string): boolean {
	const words = key.split(" ");
	return queryWords.every((word) => words.some((candidate) => candidate.startsWith(word)));
}

/** Listing labels matching the query by word prefix, shortest label first. */
export function suggestListings(query: string, locale: Locale, limit = 5): ListingEntry[] {
	const words = normalizeText(query).split(" ").filter(Boolean);
	if (words.length === 0) return [];
	return indexFor(locale)
		.filter((entry) => entry.keys.some((key) => prefixMatch(words, key)))
		.sort((a, b) => a.label.length - b.label.length || a.label.localeCompare(b.label, locale))
		.slice(0, limit);
}

/** `normalizeText`, with `ß` read as `ss` (a German word typed either way matches). */
function foldText(value: string): string {
	return normalizeText(value.replace(/ß/g, "ss"));
}

/** The spellings of an alias: as written and, for a German word, with `ae`, `oe`, `ue`. */
function spellings(alias: string): string[] {
	const transcribed = alias
		.replace(/ä/g, "ae")
		.replace(/ö/g, "oe")
		.replace(/ü/g, "ue")
		.replace(/Ä/g, "Ae")
		.replace(/Ö/g, "Oe")
		.replace(/Ü/g, "Ue");
	return transcribed === alias ? [alias] : [alias, transcribed];
}

/** A normalized term without the trailing "s" of each word ("dentistes" → "dentiste"). */
function singularOf(normalized: string): string {
	return normalized
		.split(" ")
		.map((word) => word.replace(/s$/, ""))
		.filter(Boolean)
		.join(" ");
}

/**
 * Words a query may start with before the kind of care it names ("un dentiste", "the GP",
 * "der Zahnarzt"): articles and possessives of the markets' languages.
 */
const LEADING_WORDS: ReadonlySet<string> = new Set([
	// French
	"le",
	"la",
	"les",
	"l",
	"un",
	"une",
	"des",
	"mon",
	"ma",
	// English
	"a",
	"an",
	"the",
	"my",
	// German
	"der",
	"die",
	"das",
	"den",
	"ein",
	"eine",
	"einen",
	"mein",
	"meine",
	// Spanish and Italian
	"el",
	"los",
	"las",
	"il",
	"lo",
	"gli",
	"uno",
	"una",
	"mio",
	"mia",
]);

/** The forms of a query compared with the labels and the aliases. */
function queryForms(query: string): string[] {
	const forms = [...new Set([foldText(query), normalizeText(query)])].filter(Boolean);
	for (const form of [...forms]) {
		const [first, ...rest] = form.split(" ");
		if (first && rest.length > 0 && LEADING_WORDS.has(first)) forms.push(rest.join(" "));
	}
	return [...new Set(forms.flatMap((form) => [form, singularOf(form)]))];
}

/** What a search alias names: a slug (listed or not in the market), or care the market does not list. */
const UNLISTED = Symbol("unlisted");
type AliasTarget = string | typeof UNLISTED;

/** Every alias of a market, normalized, with what it names. The first one wins a tie. */
function buildAliasIndex(country: MarketCountry): Map<string, AliasTarget> {
	const index = new Map<string, AliasTarget>();
	const add = (alias: string, target: AliasTarget) => {
		for (const spelling of spellings(alias)) {
			const key = foldText(spelling);
			for (const form of [key, singularOf(key)]) {
				if (form && !index.has(form)) index.set(form, target);
			}
		}
	};
	for (const aliases of Object.values(SEARCH_ALIASES[country])) {
		for (const [slug, words] of Object.entries(aliases.listings)) {
			for (const word of words) add(word, slug);
		}
		for (const word of aliases.unlisted ?? []) add(word, UNLISTED);
	}
	// France: the official labels of the professions mapped but not imported yet
	// ("Ostéopathe", "Orthoptiste") name them too.
	if (country === "FR") {
		for (const locale of marketLocales(country)) {
			const listing = messagesFor(locale).taxonomy.listing as Record<string, string>;
			for (const profession of Object.values(FR_PROFESSIONS)) {
				const message = listing[profession.slug];
				if (profession.enabled || !message) continue;
				for (const form of labelForms(message)) add(form, profession.slug);
				add(profession.slug, profession.slug);
			}
		}
	}
	return index;
}

const aliasIndexes = new Map<MarketCountry, Map<string, AliasTarget>>();

function aliasIndexFor(country: MarketCountry): Map<string, AliasTarget> {
	let index = aliasIndexes.get(country);
	if (!index) {
		index = buildAliasIndex(country);
		aliasIndexes.set(country, index);
	}
	return index;
}

function marketLocales(country: MarketCountry): Locale[] {
	return LOCALES.filter((locale) => marketOf(locale) === country);
}

/** True when a listing slug is one of the market's listings (France's imported professions only). */
function listedIn(slug: string, country: MarketCountry): boolean {
	return marketLocales(country).some((locale) => inMarket(slug, locale));
}

/** What a search's "Qui ?" names: a listing of the market, or care the market does not list. */
export type SearchTerm = { kind: "listing"; slug: string } | { kind: "unlisted" };

/**
 * What a query names in a market's words, listed there or not: the slug of an alias or of an
 * official label, `UNLISTED` for care the market has no slug for, or null.
 */
function namedIn(forms: string[], country: MarketCountry): AliasTarget | null {
	const aliases = aliasIndexFor(country);
	for (const form of forms) {
		const target = aliases.get(form);
		if (target !== undefined) return target;
	}
	const candidates = new Set(forms);
	for (const locale of marketLocales(country)) {
		for (const entry of indexFor(locale)) {
			if (entry.keys.some((key) => candidates.has(key) || candidates.has(singularOf(key)))) {
				return entry.slug;
			}
		}
	}
	return null;
}

/**
 * What the "Qui ?" of a search names in a market: one of its listings, or care it does not
 * list ("pharmacie" in France, "Apotheke" in Austria), or null (a name, most likely). Everyday
 * words of the market's search aliases come first, then the official labels in any language
 * of the market, in either gender, singular or plural, or the slug. Case, accents,
 * punctuation, a trailing "s" and a leading article do not matter.
 */
export function resolveSearchTerm(query: string, country: MarketCountry = "FR"): SearchTerm | null {
	const forms = queryForms(query);
	if (forms.length === 0) return null;
	const named = namedIn(forms, country);
	if (named === null) return null;
	return named !== UNLISTED && listedIn(named, country)
		? { kind: "listing", slug: named }
		: { kind: "unlisted" };
}

/** The listing slug of a market a query names (`resolveSearchTerm`), or null. */
export function resolveListing(query: string, country: MarketCountry = "FR"): string | null {
	const term = resolveSearchTerm(query, country);
	return term?.kind === "listing" ? term.slug : null;
}

/**
 * What a "Qui ?" typed on the pages of market `from` names in market `to` (the place searched
 * is there): read in `from`'s words first and carried over by kind of care ("dentiste" in
 * France → the UK's `dental-practices`), else read in `to`'s own words ("zubař" typed on a
 * French page, for Brno). Care that `to` does not list is `unlisted`; null is a name.
 */
export function translateSearchTerm(
	query: string,
	from: MarketCountry,
	to: MarketCountry,
): SearchTerm | null {
	if (from === to) return resolveSearchTerm(query, to);
	const forms = queryForms(query);
	if (forms.length === 0) return null;
	const named = namedIn(forms, from);
	if (typeof named === "string") {
		const slug = equivalentListing(named, from, to);
		if (slug && listedIn(slug, to)) return { kind: "listing", slug };
	}
	return resolveSearchTerm(query, to) ?? (named === null ? null : { kind: "unlisted" });
}

/** The label of a listing in a locale (`dental-practices` → "Dental practices"), or null. */
export function listingLabel(slug: string, locale: Locale): string | null {
	return indexFor(locale).find((entry) => entry.slug === slug)?.label ?? null;
}
