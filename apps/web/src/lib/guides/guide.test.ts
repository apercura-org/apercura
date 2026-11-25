import { describe, expect, it } from "vitest";
import { type AnchoredHeading, GuideError, parseGuide } from "./guide";

const FRONTMATTER = `---
title: "Un guide d’exemple pour les tests"
description: "Une description d’exemple, assez longue pour passer la règle des cinquante caractères."
category: patients
order: 1
publishedAt: "2026-11-01"
updatedAt: "2026-11-20"
reviewedAt: "2026-11-25"
listings: [medecin-generaliste, sage-femme]
sources:
  - title: "Page d’exemple"
    url: "https://www.ameli.fr/assure/exemple"
    publisher: "Assurance Maladie (ameli.fr)"
    checkedAt: "2026-11-25"
---
`;

const guide = (body: string, frontmatter = FRONTMATTER) =>
	parseGuide("exemple", `${frontmatter}${body}`);

describe("parseGuide", () => {
	it("reads the frontmatter, the headings with unique anchors and the word count", () => {
		const parsed = guide(
			"Un paragraphe avec un [lien](/fr/medecin-generaliste).\n\n## Le médecin traitant\n\nTexte.\n\n### Détail\n\n## Le médecin traitant\n\n- un\n- deux\n",
		);
		expect(parsed.slug).toBe("exemple");
		expect(parsed.category).toBe("patients");
		expect(parsed.listings).toEqual(["medecin-generaliste", "sage-femme"]);
		expect(parsed.headings).toEqual([
			{ id: "le-medecin-traitant", text: "Le médecin traitant" },
			{ id: "le-medecin-traitant-2", text: "Le médecin traitant" },
		]);
		const h3 = parsed.tokens.find(
			(token) => token.type === "heading" && token.depth === 3,
		) as AnchoredHeading;
		expect(h3.anchor).toBe("detail");
		expect(parsed.wordCount).toBe(15);
	});

	it("accepts tables, blockquotes, ordered lists and emphasis", () => {
		expect(() =>
			guide(
				"> **À retenir.** Une note.\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n1. *un*\n2. deux\n",
			),
		).not.toThrow();
	});

	it.each([
		["raw HTML", "<div>non</div>\n"],
		["inline HTML", "Un <b>mot</b>.\n"],
		["a first-level heading", "# Titre\n"],
		["a fourth-level heading", "#### Titre\n"],
		["an image", "![image](https://www.ameli.fr/a.png)\n"],
		["a code block", "```\ncode\n```\n"],
		["an http link", "[lien](http://www.ameli.fr)\n"],
		["a relative link", "[lien](medecin-generaliste)\n"],
		["a link outside the French pages", "[lien](/fr-en/about)\n"],
	])("refuses %s", (_, body) => {
		expect(() => guide(body)).toThrow(GuideError);
	});

	it.each([
		[
			"a source on another host",
			FRONTMATTER.replace("https://www.ameli.fr/assure/exemple", "https://www.doctissimo.fr/x"),
		],
		["an unknown listing", FRONTMATTER.replace("sage-femme", "astrologue")],
		["an unknown category", FRONTMATTER.replace("category: patients", "category: blog")],
		[
			"a review before the update",
			FRONTMATTER.replace('reviewedAt: "2026-11-25"', 'reviewedAt: "2026-11-10"'),
		],
		[
			"an update before the publication",
			FRONTMATTER.replace('updatedAt: "2026-11-20"', 'updatedAt: "2026-10-01"').replace(
				'reviewedAt: "2026-11-25"',
				'reviewedAt: "2026-10-02"',
			),
		],
		["a malformed date", FRONTMATTER.replace('checkedAt: "2026-11-25"', 'checkedAt: "25/11/2026"')],
		["no source", FRONTMATTER.replace(/sources:[\s\S]*?---/, "sources: []\n---")],
		["an unknown key", FRONTMATTER.replace("order: 1", "order: 1\nauthor: Dr Exemple")],
	])("refuses a frontmatter with %s", (_, frontmatter) => {
		expect(() => guide("Texte.\n", frontmatter)).toThrow(GuideError);
	});

	it("refuses a file without frontmatter or with an invalid slug", () => {
		expect(() => parseGuide("exemple", "Texte seul.\n")).toThrow(/frontmatter/);
		expect(() => parseGuide("Exemple_1", FRONTMATTER)).toThrow(/slug/);
	});
});
