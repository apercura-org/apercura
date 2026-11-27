import at from "../../messages/at.json";
import cz from "../../messages/cz.json";
import de from "../../messages/de.json";
import deCH from "../../messages/de-CH.json";
// Germany's overrides of the German catalog: `de.json` is the language's, the one `/fr-de` reads.
import deDE from "../../messages/de-DE.json";
// Estonia's texts over the English catalog, as Czechia's (`ee.json`, named after the segment).
import ee from "../../messages/ee.json";
import en from "../../messages/en.json";
// Ireland's overrides of the English catalog: `en.json` is the language's, `gb.json` the UK's.
import enIE from "../../messages/en-IE.json";
import es from "../../messages/es.json";
// Spain's overrides of the Spanish catalog: `es.json` is the language's, the one `/fr-es` reads.
import esES from "../../messages/es-ES.json";
import fr from "../../messages/fr.json";
import frCH from "../../messages/fr-CH.json";
import gb from "../../messages/gb.json";
import it from "../../messages/it.json";
import itCH from "../../messages/it-CH.json";
// Italy's overrides of the Italian catalog: `it.json` is the language's, the one `/fr-it` reads.
import itIT from "../../messages/it-IT.json";
import no from "../../messages/no.json";
import pl from "../../messages/pl.json"; // Norway's texts over the English catalog, as Estonia's (`no.json`, named after the segment).
import type { Locale } from "./locales";

/** The shape of every catalog: the English source catalog's. */
export type Messages = typeof en;

type Tree = Record<string, unknown>;

const isTree = (value: unknown): value is Tree =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * A catalog in Swiss Standard German, which never writes "ß": every one becomes "ss"
 * ("Strasse", "schliessen"), in the German texts and in the Swiss ones alike.
 */
export function withoutEszett(tree: Tree): Tree {
	const result: Tree = {};
	for (const [key, value] of Object.entries(tree)) {
		result[key] =
			typeof value === "string"
				? value.replaceAll("ß", "ss")
				: Array.isArray(value)
					? value.map((item) => (typeof item === "string" ? item.replaceAll("ß", "ss") : item))
					: isTree(value)
						? withoutEszett(value)
						: value;
	}
	return result;
}

/** Recursively overlays `override` on `base`, so missing keys fall back to `base`. */
export function mergeMessages(base: Tree, override: Tree): Tree {
	const result: Tree = { ...base };
	for (const [key, value] of Object.entries(override)) {
		const baseValue = base[key];
		result[key] = isTree(baseValue) && isTree(value) ? mergeMessages(baseValue, value) : value;
	}
	return result;
}

const CATALOGS: Record<
	Exclude<
		Locale,
		| "de-AT"
		| "en-GB"
		| "cs-CZ"
		| "es-ES"
		| "it-IT"
		| "de-DE"
		| "de-CH"
		| "fr-CH"
		| "it-CH"
		| "et-EE"
		| "pl-PL"
		| "nb-NO"
		| "en-IE"
	>,
	unknown
> = {
	fr,
	en,
	de,
	es,
	it,
};

const merged = new Map<Locale, Messages>();

/** Switzerland's catalogs: the language's, with the Swiss texts on top; German without "ß". */
const SWISS: Readonly<Record<"de-CH" | "fr-CH" | "it-CH", () => Messages>> = {
	"de-CH": () => withoutEszett(mergeMessages(messagesFor("de") as Tree, deCH as Tree)) as Messages,
	"fr-CH": () => mergeMessages(messagesFor("fr") as Tree, frCH as Tree) as Messages,
	"it-CH": () => mergeMessages(messagesFor("it") as Tree, itCH as Tree) as Messages,
};

/**
 * The messages of a locale for server-side rendering and emails. English is the
 * source catalog and the fallback for any key another catalog lacks.
 */
export function messagesFor(locale: Locale): Messages {
	if (locale === "en") return en;
	let found = merged.get(locale);
	if (!found) {
		found =
			locale === "de-AT"
				? // Austria: the German catalog, with the Austrian overrides on top.
					(mergeMessages(messagesFor("de") as Tree, at as Tree) as Messages)
				: locale === "en-GB"
					? // The United Kingdom: the English catalog, with the UK's overrides on top.
						(mergeMessages(en, gb as Tree) as Messages)
					: locale === "cs-CZ"
						? // Czechia: the English catalog, with the Czech texts on top.
							(mergeMessages(en, cz as Tree) as Messages)
						: locale === "es-ES"
							? // Spain: the Spanish catalog, with Spain's overrides on top.
								(mergeMessages(messagesFor("es") as Tree, esES as Tree) as Messages)
							: locale === "it-IT"
								? // Italy: the Italian catalog, with Italy's overrides on top.
									(mergeMessages(messagesFor("it") as Tree, itIT as Tree) as Messages)
								: locale === "de-DE"
									? // Germany: the German catalog, with Germany's overrides on top.
										(mergeMessages(messagesFor("de") as Tree, deDE as Tree) as Messages)
									: locale === "de-CH" || locale === "fr-CH" || locale === "it-CH"
										? // Switzerland: its language's catalog, with the Swiss texts on top.
											SWISS[locale]()
										: locale === "et-EE"
											? // Estonia: the English catalog, with the Estonian texts on top.
												(mergeMessages(en, ee as Tree) as Messages)
											: locale === "pl-PL"
												? // Poland: the English catalog, with the Polish texts on top.
													(mergeMessages(en, pl as Tree) as Messages)
												: locale === "nb-NO"
													? // Norway: the English catalog, with the Norwegian texts on top.
														(mergeMessages(en, no as Tree) as Messages)
													: locale === "en-IE"
														? // Ireland: the English catalog, with Ireland's overrides on top.
															(mergeMessages(en, enIE as Tree) as Messages)
														: (mergeMessages(en, CATALOGS[locale] as Tree) as Messages);
		merged.set(locale, found);
	}
	return found;
}

/** The Austrian overrides of the German catalog (`messages/at.json`), for tests. */
export const AUSTRIAN_OVERRIDES: unknown = at;

/** The UK's overrides of the English catalog (`messages/gb.json`), for tests. */
export const UK_OVERRIDES: unknown = gb;

/** The Czech texts over the English catalog (`messages/cz.json`), for tests. */
export const CZECH_OVERRIDES: unknown = cz;

/** The Polish texts over the English catalog (`messages/pl.json`), for tests. */
export const POLISH_OVERRIDES: unknown = pl;

/** Spain's overrides of the Spanish catalog (`messages/es-ES.json`), for tests. */
export const SPANISH_MARKET_OVERRIDES: unknown = esES;

/** Italy's overrides of the Italian catalog (`messages/it-IT.json`), for tests. */
export const ITALIAN_MARKET_OVERRIDES: unknown = itIT;

/** Germany's overrides of the German catalog (`messages/de-DE.json`), for tests. */
export const GERMAN_MARKET_OVERRIDES: unknown = deDE;
/** The Estonian texts over the English catalog (`messages/ee.json`), for tests. */
export const ESTONIAN_OVERRIDES: unknown = ee;
/** The Norwegian texts over the English catalog (`messages/no.json`), for tests. */
export const NORWEGIAN_OVERRIDES: unknown = no;

/** Switzerland's texts over the German, French and Italian catalogs, for tests. */
export const SWISS_MARKET_OVERRIDES: Readonly<Record<"de-CH" | "fr-CH" | "it-CH", unknown>> = {
	"de-CH": deCH,
	"fr-CH": frCH,
	"it-CH": itCH,
};

/** Ireland's overrides of the English catalog (`messages/en-IE.json`), for tests. */
export const IRISH_MARKET_OVERRIDES: unknown = enIE;
