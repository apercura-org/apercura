import { describe, expect, it } from "vitest";
import { articleIds, articleJsonLd } from "./article-json-ld";
import { graph, ids } from "./structured-data";

const ORIGIN = "https://apercura.example";
const URL_GUIDE = `${ORIGIN}/fr/guides/exemple`;

describe("articleJsonLd", () => {
	const article = articleJsonLd({
		url: URL_GUIDE,
		origin: ORIGIN,
		headline: "Un guide d’exemple",
		description: "Une description d’exemple.",
		language: "fr-FR",
		datePublished: "2026-11-01",
		dateModified: "2026-11-20",
		image: `${ORIGIN}/og/guides/exemple.png`,
		section: "Patients",
		editorialTeam: { name: "Équipe éditoriale d’Apercura", url: `${ORIGIN}/fr/a-propos` },
		publisherName: "Apercura",
		citations: [
			{
				name: "Page d’exemple",
				url: "https://www.ameli.fr/assure/exemple",
				publisher: "Assurance Maladie (ameli.fr)",
			},
		],
		wordCount: 900,
	});

	it("describes the guide as an Article of the page, by the editorial team", () => {
		expect(article).toMatchObject({
			"@type": "Article",
			"@id": articleIds.article(URL_GUIDE),
			mainEntityOfPage: { "@id": ids.webPage(URL_GUIDE) },
			headline: "Un guide d’exemple",
			inLanguage: "fr-FR",
			datePublished: "2026-11-01",
			dateModified: "2026-11-20",
			articleSection: "Patients",
			isAccessibleForFree: true,
			wordCount: 900,
			publisher: { "@type": "Organization", "@id": ids.organization(ORIGIN), name: "Apercura" },
		});
	});

	it("never names a person as author: an Organization, part of the site's", () => {
		expect(article.author).toEqual({
			"@type": "Organization",
			"@id": articleIds.editorialTeam(ORIGIN),
			name: "Équipe éditoriale d’Apercura",
			url: `${ORIGIN}/fr/a-propos`,
			parentOrganization: { "@id": ids.organization(ORIGIN) },
		});
		expect(JSON.stringify(article)).not.toContain('"Person"');
	});

	it("cites every official source", () => {
		expect(article.citation).toEqual([
			{
				"@type": "WebPage",
				name: "Page d’exemple",
				url: "https://www.ameli.fr/assure/exemple",
				publisher: { "@type": "Organization", name: "Assurance Maladie (ameli.fr)" },
			},
		]);
	});

	it("fits in a page graph", () => {
		expect(graph([article])["@graph"]).toHaveLength(1);
	});
});
