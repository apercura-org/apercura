/**
 * In-memory index of the listing labels (specialties and professions) for the
 * "Qui ?" search: suggestions by word prefix and exact resolution of a typed
 * label to its listing slug. Only the professions imported by default (v1
 * scope) are offered, so a suggestion always leads to practitioners.
 */
import {
	allAtListingSlugs,
	allCzListingSlugs,
	allGbListingSlugs,
	FR_PROFESSIONS,
	professionOfListingSlug,
} from "@apercura/core/taxonomy";
import { messagesFor } from "~/i18n/catalogs";
import { LOCALES, type Locale, type MarketCountry, marketOf } from "~/i18n/locales";

const AT_LISTINGS: ReadonlySet<string> = allAtListingSlugs();
const GB_LISTINGS: ReadonlySet<string> = allGbListingSlugs();
const CZ_LISTINGS: ReadonlySet<string> = allCzListingSlugs();

/**
 * True when a listing slug belongs to the market of `locale` (France's, Austria's, the UK's or
 * Czechia's taxonomy).
 */
function inMarket(slug: string, locale: Locale): boolean {
	if (marketOf(locale) === "AT") return AT_LISTINGS.has(slug);
	if (marketOf(locale) === "GB") return GB_LISTINGS.has(slug);
	if (marketOf(locale) === "CZ") return CZ_LISTINGS.has(slug);
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
	// A Czech listing is plural ("Kardiologové"), its profession label singular ("Kardiolog"):
	// both match.
	const singular = marketOf(locale) === "CZ";
	const entries: ListingEntry[] = [];
	for (const [slug, message] of Object.entries(listing)) {
		if (!inMarket(slug, locale)) continue;
		const profession = singular ? professions[slug] : undefined;
		const forms = [...labelForms(message), ...(profession ? labelForms(profession) : [])];
		entries.push({
			slug,
			label: forms[0] ?? slug,
			keys: [...new Set([...forms.map(normalizeText), normalizeText(slug)])],
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

/**
 * The listing slug of a market a query names exactly (a label in any language
 * of the market, in either gender, singular or plural, or the slug), or null.
 */
export function resolveListing(query: string, country: MarketCountry = "FR"): string | null {
	const normalized = normalizeText(query);
	if (!normalized) return null;
	const candidates = new Set([normalized, normalized.replace(/s\b/g, "").trim()]);
	for (const locale of LOCALES.filter((locale) => marketOf(locale) === country)) {
		for (const entry of indexFor(locale)) {
			if (
				entry.keys.some((key) => candidates.has(key) || candidates.has(key.replace(/s\b/g, "")))
			) {
				return entry.slug;
			}
		}
	}
	return null;
}
