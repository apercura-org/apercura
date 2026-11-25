"use client";

import { useEffect, useState } from "react";

export type LanguageOffer = {
	/** Primary language subtag the browser must prefer (`fr`, `de`…). */
	language: string;
	/** The offer, written in that language. */
	label: string;
	href: string;
};

/**
 * Language negotiation without a redirect: the international home is the same document
 * for every visitor and every crawler (it is the `x-default`), and a browser that prefers
 * one of the offered languages shows a link to the pages in that language. Server-rendered
 * as nothing, so the HTML stays cacheable and identical for everyone.
 */
export function LanguageSuggestion({
	offers,
	pageLanguage,
	className,
}: {
	offers: readonly LanguageOffer[];
	/** The page's own language: preferring it means no suggestion. */
	pageLanguage: string;
	className?: string;
}) {
	const [offer, setOffer] = useState<LanguageOffer | null>(null);

	useEffect(() => {
		const preferred = navigator.languages?.length ? navigator.languages : [navigator.language];
		for (const tag of preferred) {
			const language = tag.toLowerCase().split("-")[0];
			if (language === pageLanguage) return;
			const found = offers.find((candidate) => candidate.language === language);
			if (found) {
				setOffer(found);
				return;
			}
		}
	}, [offers, pageLanguage]);

	if (!offer) return null;
	return (
		<a href={offer.href} lang={offer.language} hrefLang={offer.language} className={className}>
			{offer.label}
		</a>
	);
}
