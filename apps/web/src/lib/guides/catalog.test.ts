import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isListingSlug } from "@apercura/core/taxonomy";
import type { Token } from "marked";
import { describe, expect, it } from "vitest";
import { STATIC_PATHS } from "~/lib/sitemap-xml";
import {
	GUIDE_FILES,
	GUIDES,
	guideBySlug,
	guidePaths,
	guidesForListing,
	relatedGuides,
} from "./catalog";

const CONTENT_DIR = join(process.cwd(), "content/guides");

/** Every link target of a guide's tokens. */
function links(tokens: readonly Token[], out: string[] = []): string[] {
	for (const token of tokens) {
		if (token.type === "link") out.push(token.href);
		for (const key of ["tokens", "items"] as const) {
			const children = (token as Record<string, unknown>)[key];
			if (Array.isArray(children)) links(children as Token[], out);
		}
		if (token.type === "table") {
			for (const cell of [...token.header, ...token.rows.flat()]) links(cell.tokens, out);
		}
	}
	return out;
}

/** Phrases that pad a text without saying anything (docs/guides/editorial-plan.md). */
const FILLER = [
	/dans un monde où/i,
	/il est important de noter/i,
	/il convient de noter/i,
	/en conclusion/i,
	/n['’]hésitez pas/i,
	/\bcrucial/i,
	/incontournable/i,
	/véritable allié/i,
	/en somme/i,
	/\bTODO\b|\bSTUB\b|lorem ipsum/i,
];

describe("the guides catalog", () => {
	it("registers every Markdown file of content/guides, and only those", () => {
		const files = readdirSync(CONTENT_DIR)
			.filter((file) => file.endsWith(".md"))
			.map((file) => file.slice(0, -3))
			.sort();
		expect(Object.keys(GUIDE_FILES).sort()).toEqual(files);
		for (const slug of files) {
			expect(GUIDE_FILES[slug]).toBe(readFileSync(join(CONTENT_DIR, `${slug}.md`), "utf8"));
		}
	});

	it("parses every guide, with unique titles and patients before practitioners", () => {
		expect(GUIDES.length).toBe(files().length);
		expect(new Set(GUIDES.map((guide) => guide.title)).size).toBe(GUIDES.length);
		const categories = GUIDES.map((guide) => guide.category);
		expect(categories).toEqual(
			[...categories].sort((a, b) => (a === b ? 0 : a === "patients" ? -1 : 1)),
		);
		expect(GUIDES.some((guide) => guide.category === "professionnels")).toBe(true);
	});

	for (const guide of GUIDES) {
		describe(guide.slug, () => {
			it("is 700 to 1,400 words long, with a table of contents", () => {
				expect(guide.wordCount).toBeGreaterThanOrEqual(700);
				expect(guide.wordCount).toBeLessThanOrEqual(1400);
				expect(guide.headings.length).toBeGreaterThanOrEqual(3);
			});

			it("cites each source once, checked no later than the review", () => {
				const urls = guide.sources.map((source) => source.url);
				expect(new Set(urls).size).toBe(urls.length);
				for (const source of guide.sources) {
					expect(source.checkedAt <= guide.reviewedAt).toBe(true);
				}
			});

			it("links only to pages that exist", () => {
				const statics = new Set<string>(
					STATIC_PATHS.map((path) => (path === "/" ? "/fr" : `/fr${path}`)),
				);
				for (const href of links(guide.tokens)) {
					if (href.startsWith("https://") || href.startsWith("#")) continue;
					const [path = ""] = href.split("#");
					const guideLink = /^\/fr\/guides\/([a-z0-9-]+)$/.exec(path);
					const listing = /^\/fr\/([a-z0-9-]+)$/.exec(path);
					const ok =
						statics.has(path) ||
						path === "/fr/guides" ||
						(guideLink ? guideBySlug(guideLink[1] ?? "") !== undefined : false) ||
						(listing ? isListingSlug(listing[1] ?? "") : false);
					expect(ok, `${guide.slug} links to ${href}`).toBe(true);
				}
			});

			it("reads without filler", () => {
				const text = GUIDE_FILES[guide.slug] ?? "";
				for (const pattern of FILLER) expect(text, String(pattern)).not.toMatch(pattern);
			});
		});
	}

	it("lists the index and every guide for the sitemap, with their last change", () => {
		const paths = guidePaths();
		expect(paths[0]?.path).toBe("/guides");
		expect(paths.slice(1).map((entry) => entry.path)).toEqual(
			GUIDES.map((guide) => `/guides/${guide.slug}`),
		);
		for (const entry of paths) expect(entry.lastmod).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it("finds the guides of a listing page and of a practitioner", () => {
		expect(relatedGuides([])).toEqual([]);
		expect(relatedGuides([null, undefined])).toEqual([]);
		for (const guide of guidesForListing("sage-femme")) {
			expect(guide.listings).toContain("sage-femme");
		}
		expect(guidesForListing("cardiologue", 2).length).toBeLessThanOrEqual(2);
	});
});

function files() {
	return readdirSync(CONTENT_DIR).filter((file) => file.endsWith(".md"));
}
