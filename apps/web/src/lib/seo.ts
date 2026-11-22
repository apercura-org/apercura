import { paletteHex } from "@apercura/ui/tokens";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LOCALE_TAGS, type Locale, OG_LOCALES } from "~/i18n/locales";
import type { Href } from "~/i18n/navigation";
import { robotsFor } from "./robots";
import { absoluteUrl, siteOrigin } from "./site-url";

/** Search engines show about 60 characters of a title and 155 of a description. */
export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 155;

/** The brand, printed after every title and as the Open Graph site name. */
export const BRAND = "Apercura";

/** White paper (`theme-color`, the manifest) and the graphite ink of the site icons. */
export const THEME_COLOR = paletteHex.paper;
export const PAPER_COLOR = paletteHex.paper;
export const INK_COLOR = paletteHex.ink;

/** Open Graph locales (`og:locale`). English is the British catalogue. */
export { OG_LOCALES };
/** BCP 47 language tags of the page content (JSON-LD `inLanguage`). */
export const CONTENT_LANGUAGES: Record<Locale, string> = LOCALE_TAGS;

/** One static Open Graph image per profession, plus one for every other page. */
export type OgImage = "medecin" | "chirurgien-dentiste" | "sage-femme" | "annuaire";

export function ogImageOf(professionCode: string): OgImage {
	if (professionCode === "40") return "chirurgien-dentiste";
	if (professionCode === "50") return "sage-femme";
	return "medecin";
}

export const ogImageUrl = (image: OgImage) => `${siteOrigin()}/og/${image}.png`;

/**
 * The first candidate that fits `max` characters; when none does, the last
 * one cut at a word boundary with an ellipsis. Candidates go from the most to
 * the least detailed.
 */
export function fitText(candidates: readonly string[], max: number): string {
	const fitting = candidates.find((candidate) => candidate.length <= max);
	if (fitting !== undefined) return fitting;
	const last = candidates.at(-1) ?? "";
	const cut = last.slice(0, max - 1);
	const space = cut.lastIndexOf(" ");
	return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:·–-]+$/, "")}…`;
}

/**
 * The short name of a place in a title: "Paris 13e" for "Paris 13e
 * Arrondissement". Communes and departments keep their name.
 */
export function shortPlaceName(name: string): string {
	return name.replace(/\s+arrondissement$/i, "");
}

export type PageMetadataInput = {
	locale: Locale;
	/** The page itself: its canonical URL, absolute on APP_URL. */
	href: Href;
	title: string;
	description: string;
	/** Indexing rule of the page; English pages are never indexed in v1 (`robotsFor`). */
	indexable: boolean;
	image?: OgImage;
	type?: "website" | "profile";
};

/**
 * The metadata of a public page: title, description, self canonical, robots
 * and complete Open Graph and Twitter cards (Next.js replaces a parent's
 * `openGraph` instead of merging it, so every page states all of it).
 *
 * No hreflang alternates: English pages are `noindex` in v1, and hreflang is
 * only announced between pages that are really translated and indexed.
 */
export async function pageMetadata(input: PageMetadataInput): Promise<Metadata> {
	const url = absoluteUrl(input.href, input.locale);
	const name = input.image ?? "annuaire";
	// The images are printed in French (shared on French results): so is their text alternative.
	const tImage = await getTranslations({ locale: "fr", namespace: "OgImage" });
	const image = {
		url: ogImageUrl(name),
		width: 1200,
		height: 630,
		alt: tImage(`titles.${name}`),
		type: "image/png",
	};
	return {
		title: input.title,
		description: input.description,
		robots: robotsFor(input.locale, input.indexable),
		alternates: { canonical: url },
		openGraph: {
			type: input.type ?? "website",
			url,
			title: input.title,
			description: input.description,
			siteName: BRAND,
			locale: OG_LOCALES[input.locale],
			images: [image],
		},
		twitter: {
			card: "summary_large_image",
			title: input.title,
			description: input.description,
			images: [image.url],
		},
	};
}

/**
 * A title from the most to the least detailed candidate: the first that fits
 * TITLE_MAX, else the shortest. Titles are never cut mid-word.
 */
export function pickTitle(candidates: readonly string[]): string {
	return (
		candidates.find((candidate) => candidate.length <= TITLE_MAX) ??
		[...candidates].sort((a, b) => a.length - b.length)[0] ??
		BRAND
	);
}
