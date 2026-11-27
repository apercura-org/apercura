"use client";

import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import { type ReactNode, use, useMemo } from "react";
import { AstryxStringsContext } from "./strings";

/**
 * Wraps an Astryx component in the page's language (`AstryxStringsProvider`), with `extra`
 * messages of its own on top (a button's pending label). Without a provider, Astryx's English.
 */
export function AstryxIntl({
	extra,
	children,
}: {
	extra?: Readonly<Record<string, string>>;
	children: ReactNode;
}) {
	const strings = use(AstryxStringsContext);
	const locale = strings?.locale ?? "en";
	const overrides = useMemo(
		() => ({ [locale]: { ...strings?.messages, ...extra } }),
		[locale, strings, extra],
	);
	if (!strings && !extra) return children;
	return (
		<InternationalizationProvider locale={locale} overrides={overrides}>
			{children}
		</InternationalizationProvider>
	);
}
