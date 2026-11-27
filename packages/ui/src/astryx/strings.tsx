"use client";

import { createContext, type ReactNode, useMemo } from "react";

/**
 * The words Astryx's components say themselves ("Close", "Loading", "Clear {label}"), in the
 * page's language: a flat map of its message ids (`@astryx.dialog.close`) to ICU messages, from
 * the app's own catalogs. Astryx ships no Estonian, Lithuanian, Latvian or Slovenian, and leaves
 * some ids in English in every language; the catalogs cover them all.
 *
 * Kept apart from the components so the provider costs a page nothing but this context.
 */
export interface AstryxStrings {
	/** BCP 47 tag of the page (`fr`, `de-AT`, `et-EE`). */
	locale: string;
	messages: Readonly<Record<string, string>>;
}

export const AstryxStringsContext = createContext<AstryxStrings | null>(null);

type Tree = { readonly [key: string]: string | Tree };

/** `{ dialog: { close: "Fermer" } }` → `{ "@astryx.dialog.close": "Fermer" }`. */
export function flattenAstryxMessages(tree: Tree, prefix = "@astryx"): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(tree)) {
		const id = `${prefix}.${key}`;
		if (typeof value === "string") out[id] = value;
		else Object.assign(out, flattenAstryxMessages(value, id));
	}
	return out;
}

export interface AstryxStringsProviderProps {
	locale: string;
	/** The catalog's `Astryx` namespace, nested by the dots of the ids. */
	messages: Tree;
	children: ReactNode;
}

/** Gives the components built on Astryx their words, once, at the root of a page. */
export function AstryxStringsProvider({ locale, messages, children }: AstryxStringsProviderProps) {
	const value = useMemo(
		() => ({ locale, messages: flattenAstryxMessages(messages) }),
		[locale, messages],
	);
	return <AstryxStringsContext value={value}>{children}</AstryxStringsContext>;
}
