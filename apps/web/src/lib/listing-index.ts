/**
 * In-memory index of the listing labels (specialties and professions) for the
 * "Qui ?" search: suggestions by word prefix and exact resolution of a typed
 * label to its listing slug. Only the professions imported by default (v1
 * scope) are offered, so a suggestion always leads to practitioners. Besides the
 * catalogs' labels, the words people type ("dentiste", "GP", "zubař") come from
 * each market's search aliases (`@apercura/core/taxonomy`, `SEARCH_ALIASES`).
 */
import { transliterateGreek } from "@apercura/core";
import {
	allAtListingSlugs,
	allChListingSlugs,
	allCyListingSlugs,
	allCzListingSlugs,
	allDeListingSlugs,
	allEeListingSlugs,
	allEsListingSlugs,
	allFiListingSlugs,
	allGbListingSlugs,
	allIeListingSlugs,
	allItListingSlugs,
	allLtListingSlugs,
	allLvListingSlugs,
	allNoListingSlugs,
	allPlListingSlugs,
	allSiListingSlugs,
	type CareKind,
	careKindsOfListing,
	equivalentListing,
	FR_PROFESSIONS,
	listingOfCareKind,
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
const EE_LISTINGS: ReadonlySet<string> = allEeListingSlugs();
const PL_LISTINGS: ReadonlySet<string> = allPlListingSlugs();
const NO_LISTINGS: ReadonlySet<string> = allNoListingSlugs();
const IE_LISTINGS: ReadonlySet<string> = allIeListingSlugs();
const FI_LISTINGS: ReadonlySet<string> = allFiListingSlugs();
const LT_LISTINGS: ReadonlySet<string> = allLtListingSlugs();
const SI_LISTINGS: ReadonlySet<string> = allSiListingSlugs();
const CY_LISTINGS: ReadonlySet<string> = allCyListingSlugs();
const LV_LISTINGS: ReadonlySet<string> = allLvListingSlugs();

/**
 * True when a listing slug belongs to the market of `locale` (France's, Austria's, the UK's,
 * Czechia's, Spain's, Italy's, Germany's, Switzerland's, Estonia's, Lithuania's, Poland's, Ireland's or Slovenia's taxonomy).
 */
function inMarket(slug: string, locale: Locale): boolean {
	if (marketOf(locale) === "AT") return AT_LISTINGS.has(slug);
	if (marketOf(locale) === "GB") return GB_LISTINGS.has(slug);
	if (marketOf(locale) === "CZ") return CZ_LISTINGS.has(slug);
	if (marketOf(locale) === "ES") return ES_LISTINGS.has(slug);
	if (marketOf(locale) === "IT") return IT_LISTINGS.has(slug);
	if (marketOf(locale) === "DE") return DE_LISTINGS.has(slug);
	if (marketOf(locale) === "CH") return CH_LISTINGS.has(slug);
	if (marketOf(locale) === "EE") return EE_LISTINGS.has(slug);
	if (marketOf(locale) === "PL") return PL_LISTINGS.has(slug);
	if (marketOf(locale) === "NO") return NO_LISTINGS.has(slug);
	if (marketOf(locale) === "IE") return IE_LISTINGS.has(slug);
	if (marketOf(locale) === "FI") return FI_LISTINGS.has(slug);
	if (marketOf(locale) === "LT") return LT_LISTINGS.has(slug);
	if (marketOf(locale) === "SI") return SI_LISTINGS.has(slug);
	if (marketOf(locale) === "CY") return CY_LISTINGS.has(slug);
	if (marketOf(locale) === "LV") return LV_LISTINGS.has(slug);
	const profession = professionOfListingSlug(slug);
	return Boolean(profession && FR_PROFESSIONS[profession]?.enabled);
}

/**
 * Unaccented lowercase words, the same normalization as `directory.text_norm()`: Greek is
 * written in Latin letters first (`Φαρμακεία` → `farmakeia`), so a Greek word typed in either
 * alphabet matches.
 */
export function normalizeText(value: string): string {
	return transliterateGreek(value)
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
	// A Czech, Spanish, Italian, German, Swiss, Estonian, Polish, Norwegian, Irish, Finnish,
	// Lithuanian, Slovenian, Cypriot or Latvian listing is plural ("Kardiologové", "Farmacias",
	// "Farmacie", "Apotheken", "Spitäler", "Apteegid", "Ligoninės", "Zobozdravniki", "Aptiekas"),
	// its profession label singular or a field ("Kardiolog", "Farmacia", "Apotheke", "Spital",
	// "Apteek", "Ligoninė", "Zobozdravstvo", "Aptieka"): both match.
	const singular = [
		"CZ",
		"ES",
		"IT",
		"DE",
		"CH",
		"EE",
		"PL",
		"NO",
		"IE",
		"FI",
		"LT",
		"SI",
		"CY",
		"LV",
	].includes(marketOf(locale));
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
	const labels = labelIndexFor(country);
	let first: LabelMatch | undefined;
	for (const form of forms) {
		const match = labels.get(form);
		if (match && (!first || match.rank < first.rank)) first = match;
	}
	return first?.slug ?? null;
}

/** A listing a label key names, and the rank of its entry among the market's locales' entries. */
type LabelMatch = { slug: string; rank: number };

/**
 * Every label key of a market's locales (each key and its singular), with the first entry it
 * names, in locale order then label order: the entry `namedIn` reads a query as.
 */
function buildLabelIndex(country: MarketCountry): Map<string, LabelMatch> {
	const index = new Map<string, LabelMatch>();
	let rank = 0;
	for (const locale of marketLocales(country)) {
		for (const entry of indexFor(locale)) {
			for (const key of entry.keys) {
				for (const form of [key, singularOf(key)]) {
					if (!index.has(form)) index.set(form, { slug: entry.slug, rank });
				}
			}
			rank++;
		}
	}
	return index;
}

const labelIndexes = new Map<MarketCountry, Map<string, LabelMatch>>();

function labelIndexFor(country: MarketCountry): Map<string, LabelMatch> {
	let index = labelIndexes.get(country);
	if (!index) {
		index = buildLabelIndex(country);
		labelIndexes.set(country, index);
	}
	return index;
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
 * The kinds of care each word of a language names, in every market: its search aliases in that
 * language and the labels of its locales in it, one entry per listing the word names. A market
 * that does not list a kind still has a word for it ("hôpital" in France, "nemocnice" in
 * Czechia), which another market's words name ("hôpital" → Germany's `krankenhaeuser`).
 */
function buildKindIndex(language: SearchAliasLanguage): Map<string, CareKind[][]> {
	const index = new Map<string, CareKind[][]>();
	const add = (key: string, kinds: CareKind[]) => {
		if (kinds.length === 0) return;
		for (const form of new Set([key, singularOf(key)])) {
			if (form) index.set(form, [...(index.get(form) ?? []), kinds]);
		}
	};
	for (const country of Object.keys(SEARCH_ALIASES) as MarketCountry[]) {
		const listings = SEARCH_ALIASES[country][language]?.listings ?? {};
		for (const [slug, words] of Object.entries(listings)) {
			const kinds = careKindsOfListing(slug, country);
			for (const word of words) {
				for (const spelling of spellings(word)) add(foldText(spelling), kinds);
			}
		}
	}
	for (const locale of LOCALES) {
		if (CATALOG_LANGUAGES[locale] !== language) continue;
		for (const entry of indexFor(locale)) {
			const kinds = careKindsOfListing(entry.slug, marketOf(locale));
			for (const key of entry.keys) add(key, kinds);
		}
	}
	return index;
}

const kindIndexes = new Map<SearchAliasLanguage, Map<string, CareKind[][]>>();

function kindIndexFor(language: SearchAliasLanguage): Map<string, CareKind[][]> {
	let index = kindIndexes.get(language);
	if (!index) {
		index = buildKindIndex(language);
		kindIndexes.set(language, index);
	}
	return index;
}

/** Words naming kinds of care, none of which a market lists. */
const NONE_LISTED = Symbol("none-listed");

/**
 * The listing of `to` for the kind of care a query names in the languages of `from`'s pages,
 * in any market's words, or null; `within`, the kinds it may be. The kind every listing naming
 * the word shares wins ("orthodontiste": orthodontics, where the UK's dental practices list
 * dentistry too); with none shared, any of them. `NONE_LISTED` when `to` lists none of them,
 * null when it lists several, or no market's words name the query.
 */
function kindListingIn(
	forms: string[],
	from: MarketCountry,
	to: MarketCountry,
	within?: readonly CareKind[],
): string | typeof NONE_LISTED | null {
	const languages = new Set(
		marketLocales(from).map((locale) => CATALOG_LANGUAGES[locale] as SearchAliasLanguage),
	);
	for (const form of forms) {
		const named = [...languages].flatMap((language) => kindIndexFor(language).get(form) ?? []);
		const [first, ...others] = named;
		if (!first) continue;
		const inScope = (kind: CareKind) => !within || within.includes(kind);
		const shared = first.filter(
			(kind) => inScope(kind) && others.every((kinds) => kinds.includes(kind)),
		);
		const kinds = shared.length > 0 ? shared : [...new Set(named.flat())].filter(inScope);
		if (kinds.length === 0) return null;
		const slugs = new Set(
			kinds
				.map((kind) => listingOfCareKind(kind, to))
				.filter((slug): slug is string => slug !== null && listedIn(slug, to)),
		);
		if (slugs.size === 0) return NONE_LISTED;
		return slugs.size === 1 ? ([...slugs][0] ?? null) : null;
	}
	return null;
}

/**
 * What a "Qui ?" typed on the pages of market `from` names in market `to` (the place searched
 * is there): read in `from`'s words first and carried over by kind of care ("dentiste" in
 * France → the UK's `dental-practices`), else read in `to`'s own words ("zubař" typed on a
 * French page, for Brno), else by the kind of care other markets' words in `from`'s languages
 * name ("hôpital" typed on a French page, for Warszawa: France lists no hospital, Germany's
 * French words do). Care that `to` does not list is `unlisted`; null is a name.
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
		// A listing of several kinds (Austria's `zahnaerzte`: dentistry and orthodontics) leads
		// to the kind its words name ("Kieferorthopäde": France's `orthodontiste`), and to none
		// where `to` does not list it ("Hämatologe": not Czechia's oncologists).
		const kinds = careKindsOfListing(named, from);
		const narrowed = kinds.length > 1 ? kindListingIn(forms, from, to, kinds) : null;
		const slug = narrowed === null ? equivalentListing(named, from, to) : narrowed;
		if (typeof slug === "string" && listedIn(slug, to)) return { kind: "listing", slug };
	}
	const own = resolveSearchTerm(query, to);
	if (own?.kind === "listing") return own;
	// Care `from` does not list, which other markets' words in its languages name ("hôpital").
	const slug = kindListingIn(forms, from, to);
	if (typeof slug === "string") return { kind: "listing", slug };
	return own ?? (named === null ? null : { kind: "unlisted" });
}

/** The label of a listing in a locale (`dental-practices` → "Dental practices"), or null. */
export function listingLabel(slug: string, locale: Locale): string | null {
	return indexFor(locale).find((entry) => entry.slug === slug)?.label ?? null;
}
