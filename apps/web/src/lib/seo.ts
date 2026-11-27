import { paletteDarkHex, paletteHex } from "@apercura/ui/tokens";
import type { Metadata, Viewport } from "next";
import { getTranslations } from "next-intl/server";
import {
	HREFLANGS,
	INDEXABLE_LOCALES,
	isIndexableLocale,
	LOCALE_TAGS,
	type Locale,
	marketLanguages,
	marketOf,
	OG_LOCALES,
} from "~/i18n/locales";
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
/** The dark theme's ground, the browser chrome's colour when the system is dark. */
export const THEME_COLOR_DARK = paletteDarkHex.paper;

/**
 * The viewport of every page: both colour schemes (~/lib/theme), the browser chrome matching
 * the ground of the system's.
 */
export const SITE_VIEWPORT: Viewport = {
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: THEME_COLOR },
		{ media: "(prefers-color-scheme: dark)", color: THEME_COLOR_DARK },
	],
	colorScheme: "light dark",
};
export const PAPER_COLOR = paletteHex.paper;

/** Open Graph locales (`og:locale`). English is the British catalogue. */
export { OG_LOCALES };
/** BCP 47 language tags of the page content (JSON-LD `inLanguage`). */
export const CONTENT_LANGUAGES: Record<Locale, string> = LOCALE_TAGS;

/** One static Open Graph image per profession, plus one for every other page. */
export type OgImage = "medecin" | "chirurgien-dentiste" | "sage-femme" | "infirmier" | "annuaire";

export function ogImageOf(professionCode: string): OgImage {
	// A UK practice: the directory's image (the profession images speak of France's practitioners).
	// A Czech facility, a Spanish centre, an Italian place, a German, Swiss, Polish or Irish facility, an
	// Estonian provider or a Norwegian establishment too.
	if (
		professionCode.startsWith("GB_") ||
		professionCode.startsWith("CZ_") ||
		professionCode.startsWith("ES_") ||
		professionCode.startsWith("IT_") ||
		professionCode.startsWith("DE_") ||
		professionCode.startsWith("CH_") ||
		professionCode.startsWith("EE_") ||
		professionCode.startsWith("PL_") ||
		professionCode.startsWith("NO_") ||
		professionCode.startsWith("IE_")
	)
		return "annuaire";
	if (professionCode === "40") return "chirurgien-dentiste";
	if (professionCode === "50") return "sage-femme";
	if (professionCode === "60" || professionCode === "69") return "infirmier";
	return "medecin";
}

export const ogImageUrl = (image: OgImage) => `${siteOrigin()}/og/${image}.png`;

/** The Open Graph image of one practitioner page (`app/og/praticien/[file]`). */
export const practitionerOgImageUrl = (slug: string) =>
	`${siteOrigin()}/og/praticien/${encodeURIComponent(slug)}.png`;

/** A page's own Open Graph image, shown before its generic one (`image`). */
export type OwnOgImage = { url: string; alt: string };

/**
 * Ownership tokens of Google Search Console and Bing Webmaster Tools, as `<meta>` tags
 * (`google-site-verification`, `msvalidate.01`) on every page; nothing when unset. Static pages
 * bake them: set the variables at build time.
 */
export function siteVerification(env: {
	GOOGLE_SITE_VERIFICATION?: string | undefined;
	BING_SITE_VERIFICATION?: string | undefined;
}): Metadata["verification"] {
	const google = env.GOOGLE_SITE_VERIFICATION?.trim();
	const bing = env.BING_SITE_VERIFICATION?.trim();
	if (!google && !bing) return undefined;
	return {
		...(google ? { google } : {}),
		...(bing ? { other: { "msvalidate.01": bing } } : {}),
	};
}

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
	/** The page's own image (a practitioner's card), with `image` as the fallback. */
	ownImage?: OwnOgImage;
	type?: "website" | "profile";
	/**
	 * hreflang alternates (absolute URLs by language tag), printed only on an indexed page. By
	 * default, the page in the other languages of its market when it has several (`marketAlternates`).
	 */
	languages?: Record<string, string>;
};

/**
 * hreflang of the homes: every market's home in its indexed languages (Switzerland's three:
 * `/ch`, `/ch-fr`, `/ch-it`) and the international one (`x-default`, `/`), the country chooser
 * for every other visitor. Every home prints the same set. Below the homes, only a market of
 * several languages has alternates (`marketAlternates`); pages in other locales are `noindex`
 * (hreflang never points at them).
 */
export function homeAlternates(): Record<string, string> {
	const languages: Record<string, string> = {};
	for (const locale of INDEXABLE_LOCALES) {
		const tag = HREFLANGS[locale];
		if (tag) languages[tag] = absoluteUrl("/", locale);
	}
	languages["x-default"] = `${siteOrigin()}/`;
	return languages;
}

/**
 * hreflang of a page below the homes in a market of several indexed languages (Switzerland: the
 * same facility, listing, hub or legal page under `/ch`, `/ch-fr` and `/ch-it`): each language's
 * URL of the page, and nothing towards another market, whose pages are other pages. Undefined for
 * a market of one indexed language, whose pages have no alternate.
 */
export function marketAlternates(href: Href, locale: Locale): Record<string, string> | undefined {
	const locales = marketLanguages(marketOf(locale));
	if (locales.length < 2 || !locales.includes(locale)) return undefined;
	const languages: Record<string, string> = {};
	for (const other of locales) {
		const tag = HREFLANGS[other];
		if (tag) languages[tag] = absoluteUrl(href, other);
	}
	return languages;
}

/**
 * The metadata of a public page: title, description, self canonical, robots
 * and complete Open Graph and Twitter cards (Next.js replaces a parent's
 * `openGraph` instead of merging it, so every page states all of it).
 *
 * hreflang only between indexed pages (`languages`: the homes, and the pages of a market of
 * several languages, `marketAlternates`): pages in other locales are `noindex`.
 */
export async function pageMetadata(input: PageMetadataInput): Promise<Metadata> {
	const indexed = isIndexableLocale(input.locale) && input.indexable;
	const languages = input.languages ?? marketAlternates(input.href, input.locale);
	return documentMetadata({
		url: absoluteUrl(input.href, input.locale),
		ogLocale: OG_LOCALES[input.locale],
		title: input.title,
		description: input.description,
		robots: robotsFor(input.locale, input.indexable),
		image: input.image,
		ownImage: input.ownImage,
		type: input.type,
		languages: indexed ? languages : undefined,
	});
}

/**
 * The metadata of a page from its absolute URL: `pageMetadata` for the pages of a
 * locale, and the international home, which lives outside the locales.
 */
export async function documentMetadata(input: {
	url: string;
	ogLocale: string;
	title: string;
	description: string;
	robots: Metadata["robots"];
	image?: OgImage;
	ownImage?: OwnOgImage;
	type?: "website" | "profile";
	languages?: Record<string, string>;
}): Promise<Metadata> {
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
	// Crawlers take the first image they can read: the page's own, else the generic one.
	const images = input.ownImage
		? [{ ...image, url: input.ownImage.url, alt: input.ownImage.alt }, image]
		: [image];
	return {
		title: input.title,
		description: input.description,
		robots: input.robots,
		alternates: {
			canonical: input.url,
			...(input.languages ? { languages: input.languages } : {}),
		},
		openGraph: {
			type: input.type ?? "website",
			url: input.url,
			title: input.title,
			description: input.description,
			siteName: BRAND,
			locale: input.ogLocale,
			images,
		},
		twitter: {
			card: "summary_large_image",
			title: input.title,
			description: input.description,
			images: [images[0]?.url ?? image.url],
		},
	};
}

/**
 * A title without the brand (" · Apercura" after it, "Apercura · " before it). A candidate to
 * try before a less detailed one: the brand is the first thing a long title gives up, since
 * search engines print the site name beside the result anyway.
 */
export function withoutBrand(title: string): string {
	const suffix = ` · ${BRAND}`;
	const prefix = `${BRAND} · `;
	if (title.endsWith(suffix)) return title.slice(0, -suffix.length);
	if (title.startsWith(prefix)) return title.slice(prefix.length);
	return title;
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
