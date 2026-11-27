import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalPath } from "./canonical-path";
import { pickMessages } from "./client-messages";
import { robotsFor } from "./robots";
import {
	DESCRIPTION_MAX,
	fitText,
	homeAlternates,
	marketAlternates,
	ogImageOf,
	pickTitle,
	shortPlaceName,
	siteVerification,
	TITLE_MAX,
	withoutBrand,
} from "./seo";
import { francePath, sitemapIndexXml, urlSetXml } from "./sitemap-xml";

describe("Open Graph images", () => {
	it("picks one image per profession", () => {
		expect(ogImageOf("10")).toBe("medecin");
		expect(ogImageOf("40")).toBe("chirurgien-dentiste");
		expect(ogImageOf("50")).toBe("sage-femme");
		expect(ogImageOf("60")).toBe("infirmier");
		// A UK practice, a Czech facility, a Spanish centre or an Italian place: the directory's image.
		expect(ogImageOf("GB_GP")).toBe("annuaire");
		expect(ogImageOf("ES_DENTAL")).toBe("annuaire");
		expect(ogImageOf("ES_HOSPITAL")).toBe("annuaire");
		expect(ogImageOf("IT_PHARMACY")).toBe("annuaire");
		expect(ogImageOf("IT_HOSPITAL")).toBe("annuaire");
		expect(ogImageOf("CZ_GP")).toBe("annuaire");
		expect(ogImageOf("CZ_DENTIST")).toBe("annuaire");
		expect(ogImageOf("CH_HOSPITAL")).toBe("annuaire");
		expect(ogImageOf("CH_NURSING_HOME")).toBe("annuaire");
		expect(ogImageOf("IE_PHARMACY")).toBe("annuaire");
		expect(ogImageOf("IE_HEALTH_CENTRE")).toBe("annuaire");
	});
});

describe("titles and descriptions", () => {
	it("picks the most detailed title that fits, never cutting one", () => {
		const long = `${"x".repeat(TITLE_MAX)} · Apercura`;
		expect(pickTitle([long, "Dr Camille Exemple, médecin · Apercura"])).toBe(
			"Dr Camille Exemple, médecin · Apercura",
		);
		expect(pickTitle([long, `${long}!`])).toBe(long);
	});

	it("drops the brand before a detail", () => {
		expect(withoutBrand("Dr Camille Exemple, médecin à Paris 11e · Apercura")).toBe(
			"Dr Camille Exemple, médecin à Paris 11e",
		);
		expect(withoutBrand("Apercura · L’annuaire ouvert")).toBe("L’annuaire ouvert");
		expect(withoutBrand("Votre rendez-vous")).toBe("Votre rendez-vous");
		// A practitioner's title keeps the commune (namesakes) when only the brand is too much.
		const name = "Dr Camille Exemplaire";
		const withPlace = `${name}, médecin généraliste à Paris 18e · Apercura`;
		const withoutPlace = `${name}, médecin généraliste · Apercura`;
		expect(withPlace.length).toBeGreaterThan(TITLE_MAX);
		expect(pickTitle([withPlace, withoutBrand(withPlace), withoutPlace])).toBe(
			`${name}, médecin généraliste à Paris 18e`,
		);
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
		expect(shortPlaceName("Vilniaus miesto savivaldybė")).toBe("Vilniaus m. sav.");
		expect(shortPlaceName("Kauno rajono savivaldybė")).toBe("Kauno r. sav.");
		expect(shortPlaceName("Birštono savivaldybė")).toBe("Birštono sav.");
		expect(shortPlaceName("Vilniaus apskritis")).toBe("Vilniaus apskr.");
		expect(shortPlaceName("Pavyzdžiai (Bandymų sen.)")).toBe("Pavyzdžiai (Bandymų sen.)");
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
	it("keeps France's prefix: every page of the French directory lives under /fr", () => {
		expect(canonicalPath("/fr")).toBeNull();
		expect(canonicalPath("/fr/cardiologue/75-paris")).toBeNull();
		expect(canonicalPath("/fr-en/directory")).toBeNull();
	});

	it("lowercases public paths but keeps percent-escapes and the practitioner space", () => {
		expect(canonicalPath("/fr/Cardiologue/75-PARIS")).toBe("/fr/cardiologue/75-paris");
		expect(canonicalPath("/FR/Cardiologue")).toBe("/fr/cardiologue");
		expect(canonicalPath("/fr/m%C3%A9decin")).toBeNull();
		expect(canonicalPath("/fr/pro/revendiquer/AbC")).toBeNull();
		expect(canonicalPath("/fr-en/pro/admin/revendications/AbC")).toBeNull();
		expect(canonicalPath("/fr/praticien/camille-exemple-19999990013")).toBeNull();
	});
});

describe("hreflang of the homes", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("links the homes of the open markets and the international home as x-default, on APP_URL", () => {
		vi.stubEnv("APP_URL", "https://apercura.org");
		expect(homeAlternates()).toEqual({
			"fr-FR": "https://apercura.org/fr",
			"de-AT": "https://apercura.org/at",
			"en-GB": "https://apercura.org/gb",
			"cs-CZ": "https://apercura.org/cz",
			"es-ES": "https://apercura.org/es",
			"it-IT": "https://apercura.org/it",
			"de-DE": "https://apercura.org/de",
			"de-CH": "https://apercura.org/ch",
			"fr-CH": "https://apercura.org/ch-fr",
			"it-CH": "https://apercura.org/ch-it",
			"et-EE": "https://apercura.org/ee",
			"pl-PL": "https://apercura.org/pl",
			"nb-NO": "https://apercura.org/no",
			"en-IE": "https://apercura.org/ie",
			"fi-FI": "https://apercura.org/fi",
			"lt-LT": "https://apercura.org/lt",
			"sl-SI": "https://apercura.org/si",
			"x-default": "https://apercura.org/",
		});
	});
});

describe("hreflang below the homes", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("links a Swiss page to itself in the market's three languages, and to nothing else", () => {
		vi.stubEnv("APP_URL", "https://apercura.org");
		const facility = {
			pathname: "/praticien/[slug]",
			params: { slug: "kantonsspital-beispiel-h123456789" },
		} as const;
		const expected = {
			"de-CH": "https://apercura.org/ch/einrichtung/kantonsspital-beispiel-h123456789",
			"fr-CH": "https://apercura.org/ch-fr/etablissement/kantonsspital-beispiel-h123456789",
			"it-CH": "https://apercura.org/ch-it/struttura/kantonsspital-beispiel-h123456789",
		};
		for (const locale of ["de-CH", "fr-CH", "it-CH"] as const) {
			expect(marketAlternates(facility, locale)).toEqual(expected);
		}
		expect(
			marketAlternates(
				{
					pathname: "/[specialite]/[dept]/[[...rest]]",
					params: { specialite: "spital", dept: "bezirk-zuerich", rest: ["zuerich"] },
				},
				"it-CH",
			),
		).toEqual({
			"de-CH": "https://apercura.org/ch/spital/bezirk-zuerich/zuerich",
			"fr-CH": "https://apercura.org/ch-fr/spital/bezirk-zuerich/zuerich",
			"it-CH": "https://apercura.org/ch-it/spital/bezirk-zuerich/zuerich",
		});
		expect(marketAlternates("/mentions-legales", "fr-CH")).toEqual({
			"de-CH": "https://apercura.org/ch/impressum",
			"fr-CH": "https://apercura.org/ch-fr/mentions-legales",
			"it-CH": "https://apercura.org/ch-it/note-legali",
		});
		expect(marketAlternates("/annuaire", "de-CH")?.["it-CH"]).toBe(
			"https://apercura.org/ch-it/elenco",
		);
	});

	it("gives no alternate to a market of one indexed language, nor to an interface translation", () => {
		expect(marketAlternates("/annuaire", "it-IT")).toBeUndefined();
		expect(marketAlternates("/annuaire", "en-IE")).toBeUndefined();
		expect(marketAlternates("/annuaire", "fr")).toBeUndefined();
		expect(marketAlternates("/annuaire", "en")).toBeUndefined();
	});
});

describe("sitemap paths", () => {
	it("puts the French paths of the read models under France's segment", () => {
		expect(francePath("/")).toBe("/fr");
		expect(francePath("/praticien/camille-exemple-19999990013")).toBe(
			"/fr/praticien/camille-exemple-19999990013",
		);
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
