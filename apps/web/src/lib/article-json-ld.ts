import type { Article, CreativeWork, Organization } from "schema-dts";
import { ids } from "./structured-data";

/*
 * schema.org `Article` of a guide (`/fr/guides/{slug}`), next to the page's `WebPage` and
 * `BreadcrumbList` (~/lib/structured-data). Pure, on absolute URLs, so it is unit-tested
 * without Next.js.
 *
 * The author is the editorial team, an `Organization`, never a person: no named author writes
 * or reviews the guides, and none is invented. The publisher is the site's organization
 * (the `@id` the home page describes). Each official source is a `citation`.
 */

/** Fragment identifiers of a guide's entities. */
export const articleIds = {
	article: (url: string) => `${url}#article`,
	editorialTeam: (origin: string) => `${origin}/#editorial-team`,
};

export type ArticleInput = {
	/** The canonical URL of the guide. */
	url: string;
	origin: string;
	headline: string;
	description: string;
	/** BCP 47 language of the text (`fr-FR`). */
	language: string;
	/** YYYY-MM-DD. */
	datePublished: string;
	/** YYYY-MM-DD. */
	dateModified: string;
	/** Absolute URL of the guide's Open Graph image (1200 × 630). */
	image: string;
	/** The category, e.g. "Patients". */
	section: string;
	/** The editorial team's name and the page that says who publishes the site. */
	editorialTeam: { name: string; url: string };
	publisherName: string;
	citations: readonly { name: string; url: string; publisher: string }[];
	wordCount?: number;
};

export function articleJsonLd(input: ArticleInput): Article {
	const team: Organization = {
		"@type": "Organization",
		"@id": articleIds.editorialTeam(input.origin),
		name: input.editorialTeam.name,
		url: input.editorialTeam.url,
		parentOrganization: { "@id": ids.organization(input.origin) },
	};
	const publisher: Organization = {
		"@type": "Organization",
		"@id": ids.organization(input.origin),
		name: input.publisherName,
		url: `${input.origin}/`,
	};
	const citations: CreativeWork[] = input.citations.map((citation) => ({
		"@type": "WebPage",
		name: citation.name,
		url: citation.url,
		publisher: { "@type": "Organization", name: citation.publisher },
	}));
	return {
		"@type": "Article",
		"@id": articleIds.article(input.url),
		mainEntityOfPage: { "@id": ids.webPage(input.url) },
		url: input.url,
		headline: input.headline,
		description: input.description,
		inLanguage: input.language,
		datePublished: input.datePublished,
		dateModified: input.dateModified,
		image: {
			"@type": "ImageObject",
			url: input.image,
			width: "1200",
			height: "630",
		},
		articleSection: input.section,
		author: team,
		publisher,
		isAccessibleForFree: true,
		citation: citations,
		...(input.wordCount ? { wordCount: input.wordCount } : {}),
	};
}
