import { describe, expect, it } from "vitest";
import { canonicalPath } from "./canonical-path";
import { pickMessages } from "./client-messages";
import { robotsFor } from "./robots";
import {
	DESCRIPTION_MAX,
	fitText,
	pickTitle,
	shortPlaceName,
	siteVerification,
	TITLE_MAX,
} from "./seo";
import { sitemapIndexXml, urlSetXml } from "./sitemap-xml";

describe("titles and descriptions", () => {
	it("picks the most detailed title that fits, never cutting one", () => {
		const long = `${"x".repeat(TITLE_MAX)} · Apercura`;
		expect(pickTitle([long, "Dr Camille Exemple, médecin · Apercura"])).toBe(
			"Dr Camille Exemple, médecin · Apercura",
		);
		expect(pickTitle([long, `${long}!`])).toBe(long);
	});

	it("cuts a description at a word boundary when nothing fits", () => {
		const text = fitText(["mot ".repeat(60)], DESCRIPTION_MAX);
		expect(text.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
		expect(text.endsWith("mot…")).toBe(true);
		expect(fitText(["court"], DESCRIPTION_MAX)).toBe("court");
	});

	it("shortens arrondissements in titles", () => {
		expect(shortPlaceName("Paris 13e Arrondissement")).toBe("Paris 13e");
		expect(shortPlaceName("Saint-Denis")).toBe("Saint-Denis");
	});
});

describe("robots", () => {
	it("indexes French pages that qualify, never English ones in v1", () => {
		expect(robotsFor("fr", true)).toEqual({ index: true, follow: true });
		expect(robotsFor("fr", false)).toEqual({ index: false, follow: true });
		expect(robotsFor("en", true)).toEqual({ index: false, follow: true });
	});
});

describe("canonicalPath", () => {
	it("drops the default locale prefix", () => {
		expect(canonicalPath("/fr")).toBe("/");
		expect(canonicalPath("/fr/cardiologue/75-paris")).toBe("/cardiologue/75-paris");
		expect(canonicalPath("/francais")).toBeNull();
	});

	it("lowercases public paths but keeps percent-escapes and the practitioner space", () => {
		expect(canonicalPath("/Cardiologue/75-PARIS")).toBe("/cardiologue/75-paris");
		expect(canonicalPath("/FR/Cardiologue")).toBe("/fr/cardiologue");
		expect(canonicalPath("/m%C3%A9decin")).toBeNull();
		expect(canonicalPath("/pro/revendiquer/AbC")).toBeNull();
		expect(canonicalPath("/en/pro/admin/revendications/AbC")).toBeNull();
		expect(canonicalPath("/praticien/camille-exemple-19999990013")).toBeNull();
	});
});

describe("pickMessages", () => {
	it("keeps only the named namespaces, with their nesting", () => {
		const messages = { a: { b: { c: "1" }, d: "2" }, e: "3", f: { g: "4" } };
		expect(pickMessages(messages, ["a.b", "f", "missing.key"])).toEqual({
			a: { b: { c: "1" } },
			f: { g: "4" },
		});
	});
});

describe("sitemap XML", () => {
	it("writes a sitemaps.org index and url set, escaped, without changefreq or priority", () => {
		const index = sitemapIndexXml([
			{ loc: "https://apercura.example/sitemaps/pages-0.xml" },
			{ loc: "https://apercura.example/sitemaps/praticiens-0.xml", lastmod: "2026-11-19" },
		]);
		expect(index).toMatchSnapshot();
		const set = urlSetXml([
			{ loc: "https://apercura.example/praticien/a&b-19999990013", lastmod: "2026-11-19" },
		]);
		expect(set).toContain("<loc>https://apercura.example/praticien/a&amp;b-19999990013</loc>");
		expect(set).not.toMatch(/changefreq|priority/);
		expect(set.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
	});
});

describe("search engine verification", () => {
	it("prints nothing until a token is configured", () => {
		expect(siteVerification({})).toBeUndefined();
		expect(siteVerification({ GOOGLE_SITE_VERIFICATION: " ", BING_SITE_VERIFICATION: "" })).toBe(
			undefined,
		);
	});

	it("maps Google's token and Bing's msvalidate.01", () => {
		expect(
			siteVerification({ GOOGLE_SITE_VERIFICATION: "g-token", BING_SITE_VERIFICATION: "b-token" }),
		).toEqual({ google: "g-token", other: { "msvalidate.01": "b-token" } });
		expect(siteVerification({ BING_SITE_VERIFICATION: "b-token" })).toEqual({
			other: { "msvalidate.01": "b-token" },
		});
	});
});
