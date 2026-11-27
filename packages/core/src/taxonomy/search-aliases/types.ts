/**
 * The words people type in the search's "Who?" field for a kind of care, beyond the official
 * labels of the catalogs (`taxonomy.listing.*`): everyday words ("dentiste", "GP", "zubař"),
 * abbreviations ("ophtalmo", "HNO"), feminine and plural forms the labels lack, names of the
 * field ("cardiologie" for "cardiologue").
 *
 * Plain data, one table per market, by language: the search compares them without case,
 * accents, punctuation or a trailing "s" (`apps/web/src/lib/listing-index.ts`), so a table
 * lists one spelling of a word, with its accents. A German word with an umlaut also matches
 * its spelling with `ae`, `oe`, `ue`, and `ß` matches `ss`.
 */

/** Languages a market's aliases are written in: its interface languages (catalog languages). */
export type SearchAliasLanguage =
	| "fr"
	| "en"
	| "de"
	| "es"
	| "it"
	| "cs"
	| "et"
	| "pl"
	| "nb"
	| "fi"
	| "lt";

export type SearchAliases = {
	/**
	 * Words naming a listing, keyed by the listing slug they lead to. A slug of a profession the
	 * market maps but does not import yet (`pharmacien`, `masseur-kinesitherapeute` in France)
	 * reads as "not listed here yet" until the profession is imported, and leads to its listing
	 * from then on.
	 */
	readonly listings: Readonly<Record<string, readonly string[]>>;
	/** Words naming care the market does not list, with no slug of its own (pharmacies in Austria). */
	readonly unlisted?: readonly string[];
};

/** A market's aliases by language. Every language of a market's table works on all its pages. */
export type SearchAliasTable = Readonly<Partial<Record<SearchAliasLanguage, SearchAliases>>>;
