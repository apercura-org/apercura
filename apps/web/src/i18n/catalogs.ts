import at from "../../messages/at.json";
import de from "../../messages/de.json";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import fr from "../../messages/fr.json";
import gb from "../../messages/gb.json";
import it from "../../messages/it.json";
import type { Locale } from "./locales";

/** The shape of every catalog: the English source catalog's. */
export type Messages = typeof en;

type Tree = Record<string, unknown>;

const isTree = (value: unknown): value is Tree =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** Recursively overlays `override` on `base`, so missing keys fall back to `base`. */
export function mergeMessages(base: Tree, override: Tree): Tree {
	const result: Tree = { ...base };
	for (const [key, value] of Object.entries(override)) {
		const baseValue = base[key];
		result[key] = isTree(baseValue) && isTree(value) ? mergeMessages(baseValue, value) : value;
	}
	return result;
}

const CATALOGS: Record<Exclude<Locale, "de-AT" | "en-GB">, unknown> = { fr, en, de, es, it };

const merged = new Map<Locale, Messages>();

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
					: (mergeMessages(en, CATALOGS[locale] as Tree) as Messages);
		merged.set(locale, found);
	}
	return found;
}

/** The Austrian overrides of the German catalog (`messages/at.json`), for tests. */
export const AUSTRIAN_OVERRIDES: unknown = at;

/** The UK's overrides of the English catalog (`messages/gb.json`), for tests. */
export const UK_OVERRIDES: unknown = gb;
