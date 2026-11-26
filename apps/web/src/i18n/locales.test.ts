import {
	AT_RESERVED_SEGMENTS,
	CZ_RESERVED_SEGMENTS,
	GB_RESERVED_SEGMENTS,
	isAtListingSlug,
	isCzListingSlug,
	isGbListingSlug,
	isListingSlug,
	isReservedSegment,
} from "@apercura/core/taxonomy";
import { describe, expect, it } from "vitest";
import { robotsFor } from "~/lib/robots";
import {
	CATALOG_LANGUAGES,
	capitalisesWeekdays,
	DEFAULT_LOCALE,
	HREFLANGS,
	INDEXABLE_LOCALES,
	LEGACY_LOCALE_SEGMENTS,
	LOCALE_MARKETS,
	LOCALE_PREFIXES,
	LOCALE_SEGMENTS,
	LOCALE_TAGS,
	LOCALES,
	MARKET_COUNTRIES,
	marketLocaleFor,
	marketOf,
	marketOfSegment,
	marketSegment,
	OG_LOCALES,
	toLocale,
} from "./locales";
import { getPathname } from "./navigation";
import { localePath } from "./paths";
import { type AppPathname, CZECH_SEGMENTS, routing } from "./routing";

const PARAMS: Record<string, string> = {
	slug: "camille-exemple-19999990013",
	id: "abc",
	dept: "rhone",
	commune: "lyon",
};

const pathnames = Object.keys(routing.pathnames) as AppPathname[];

/** Interface translations of France's pages: never indexed. */
const TRANSLATIONS = LOCALES.filter(
	(locale) => locale !== "fr" && locale !== "de-AT" && locale !== "en-GB" && locale !== "cs-CZ",
);

/** Pathnames without a catch-all segment, with example params. */
const simple = pathnames.filter((pathname) => !pathname.includes("..."));

function hrefOf(pathname: AppPathname) {
	const params = Object.fromEntries(
		[...pathname.matchAll(/\[(\w+)\]/g)].map(([, name]) => [name, PARAMS[name as string] ?? "x"]),
	);
	return Object.keys(params).length > 0 ? { pathname, params } : pathname;
}

describe("locale configuration", () => {
	it("serves France under /fr and /fr-{language}, Austria under /at, the UK under /gb and Czechia under /cz", () => {
		expect(LOCALES).toEqual(["fr", "en", "de", "es", "it", "de-AT", "en-GB", "cs-CZ"]);
		expect(routing.locales).toEqual(LOCALES);
		expect(routing.defaultLocale).toBe("fr");
		expect(DEFAULT_LOCALE).toBe("fr");
		expect(LOCALE_PREFIXES).toEqual({
			fr: "/fr",
			en: "/fr-en",
			de: "/fr-de",
			es: "/fr-es",
			it: "/fr-it",
			"de-AT": "/at",
			"en-GB": "/gb",
			"cs-CZ": "/cz",
		});
		expect(LOCALE_SEGMENTS).toEqual(["fr", "fr-en", "fr-de", "fr-es", "fr-it", "at", "gb", "cz"]);
		expect(LOCALE_MARKETS).toEqual({
			fr: "FR",
			en: "FR",
			de: "FR",
			es: "FR",
			it: "FR",
			"de-AT": "AT",
			"en-GB": "GB",
			"cs-CZ": "CZ",
		});
		expect(CATALOG_LANGUAGES["de-AT"]).toBe("de");
		expect(CATALOG_LANGUAGES["en-GB"]).toBe("en");
		expect(CATALOG_LANGUAGES["cs-CZ"]).toBe("cs");
		for (const locale of LOCALES) {
			expect(marketOf(locale), locale).toBe(LOCALE_MARKETS[locale]);
			expect(locale.split("-")[0], locale).toBe(CATALOG_LANGUAGES[locale]);
			expect(capitalisesWeekdays(locale), locale).toBe(
				["en", "de"].includes(CATALOG_LANGUAGES[locale]),
			);
		}
		expect(routing.localePrefix).toEqual({ mode: "always", prefixes: LOCALE_PREFIXES });
		// The root never redirects on the visitor's language, and public pages set no cookie.
		expect(routing.localeDetection).toBe(false);
		expect(routing.localeCookie).toBe(false);
	});

	it("keeps the former prefixes apart from the current ones", () => {
		expect(LEGACY_LOCALE_SEGMENTS).toEqual(["en", "de", "es", "it"]);
		for (const segment of LEGACY_LOCALE_SEGMENTS) {
			expect(LOCALE_SEGMENTS).not.toContain(segment);
		}
	});

	it("formats each locale with its own country and a BCP 47 tag", () => {
		expect(LOCALE_TAGS).toEqual({
			fr: "fr-FR",
			en: "en-GB",
			de: "de-DE",
			es: "es-ES",
			it: "it-IT",
			"de-AT": "de-AT",
			"en-GB": "en-GB",
			"cs-CZ": "cs-CZ",
		});
		expect(OG_LOCALES).toEqual({
			fr: "fr_FR",
			en: "en_GB",
			de: "de_DE",
			es: "es_ES",
			it: "it_IT",
			"de-AT": "de_AT",
			"en-GB": "en_GB",
			"cs-CZ": "cs_CZ",
		});
		for (const locale of LOCALES) {
			expect(Intl.DateTimeFormat.supportedLocalesOf([LOCALE_TAGS[locale]])).toEqual([
				LOCALE_TAGS[locale],
			]);
			// A 24-hour clock everywhere: appointment times read the same in every email.
			const time = new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
				hour: "2-digit",
				minute: "2-digit",
				timeZone: "UTC",
			}).format(Date.UTC(2026, 10, 24, 14, 30));
			expect(time, locale).toMatch(/14[:.]30/);
		}
	});

	it("indexes each market in its own language only, and leaves hreflang to the pages", () => {
		expect(INDEXABLE_LOCALES).toEqual(["fr", "de-AT", "en-GB", "cs-CZ"]);
		expect(HREFLANGS).toEqual({
			fr: "fr-FR",
			"de-AT": "de-AT",
			"en-GB": "en-GB",
			"cs-CZ": "cs-CZ",
		});
		expect(routing.alternateLinks).toBe(false);
		expect(robotsFor("fr", true)).toEqual({ index: true, follow: true });
		expect(robotsFor("de-AT", true)).toEqual({ index: true, follow: true });
		expect(robotsFor("en-GB", true)).toEqual({ index: true, follow: true });
		expect(robotsFor("cs-CZ", true)).toEqual({ index: true, follow: true });
		for (const locale of TRANSLATIONS) {
			expect(robotsFor(locale, true)).toEqual({ index: false, follow: true });
		}
	});

	it("reads stored locales and falls back to French", () => {
		expect(toLocale("de")).toBe("de");
		expect(toLocale("pt")).toBe("fr");
		expect(toLocale(null)).toBe("fr");
	});

	it("gives every pathname a form in every locale", () => {
		for (const pathname of pathnames) {
			const entry = routing.pathnames[pathname];
			if (typeof entry === "string") continue;
			expect(Object.keys(entry).sort(), pathname).toEqual([...LOCALES].sort());
		}
	});

	it("never maps two pages to one public path in a locale", () => {
		for (const locale of LOCALES) {
			const paths = simple.map((pathname) =>
				getPathname({ href: hrefOf(pathname) as never, locale }),
			);
			expect(new Set(paths).size, locale).toBe(paths.length);
		}
	});

	it("keeps translated first segments clear of listing slugs and reserves the former prefixes", () => {
		for (const locale of TRANSLATIONS) {
			// Former prefixes: an old `/en/…` link must never resolve to a listing.
			expect(isReservedSegment(locale), locale).toBe(true);
			for (const pathname of simple) {
				const [first] = getPathname({ href: hrefOf(pathname) as never, locale })
					.split("/")
					.filter(Boolean)
					.slice(1);
				if (first) expect(isListingSlug(first), `${locale} ${pathname}`).toBe(false);
			}
		}
		for (const pathname of simple.filter((pathname) => !pathname.startsWith("/["))) {
			const [first] = getPathname({ href: hrefOf(pathname) as never, locale: "fr" })
				.split("/")
				.filter(Boolean)
				.slice(1);
			if (first) expect(isReservedSegment(first), pathname).toBe(true);
		}
		// Austria: every German first segment is reserved and never an Austrian listing slug.
		for (const pathname of simple.filter((pathname) => !pathname.startsWith("/["))) {
			const [first] = getPathname({ href: hrefOf(pathname) as never, locale: "de-AT" })
				.split("/")
				.filter(Boolean)
				.slice(1);
			if (!first) continue;
			expect(AT_RESERVED_SEGMENTS as readonly string[], pathname).toContain(first);
			expect(isAtListingSlug(first), pathname).toBe(false);
		}
		expect(localePath("de-AT", "/praticien/[slug]", { slug: "anna-muster-w7983" })).toBe(
			"/at/arzt/anna-muster-w7983",
		);
		// The UK: every English first segment is reserved and never a UK listing slug.
		for (const pathname of simple.filter((pathname) => !pathname.startsWith("/["))) {
			const [first] = getPathname({ href: hrefOf(pathname) as never, locale: "en-GB" })
				.split("/")
				.filter(Boolean)
				.slice(1);
			if (!first) continue;
			expect(GB_RESERVED_SEGMENTS as readonly string[], pathname).toContain(first);
			expect(isGbListingSlug(first), pathname).toBe(false);
		}
		expect(localePath("en-GB", "/praticien/[slug]", { slug: "the-example-surgery-a99001" })).toBe(
			"/gb/practice/the-example-surgery-a99001",
		);
		expect(localePath("en-GB", "/annuaire")).toBe("/gb/directory");
		// Czechia: every Czech first segment is reserved and never a Czech listing slug.
		for (const pathname of simple.filter((pathname) => !pathname.startsWith("/["))) {
			const [first] = getPathname({ href: hrefOf(pathname) as never, locale: "cs-CZ" })
				.split("/")
				.filter(Boolean)
				.slice(1);
			if (!first) continue;
			expect(CZ_RESERVED_SEGMENTS as readonly string[], pathname).toContain(first);
			expect(isCzListingSlug(first), pathname).toBe(false);
		}
		expect(localePath("cs-CZ", "/praticien/[slug]", { slug: "mudr-jana-ukazkova-900001" })).toBe(
			"/cz/zarizeni/mudr-jana-ukazkova-900001",
		);
		expect(
			localePath("cs-CZ", "/praticien/[slug]/signaler", { slug: "mudr-jana-ukazkova-900001" }),
		).toBe("/cz/zarizeni/mudr-jana-ukazkova-900001/nahlasit");
		expect(localePath("cs-CZ", "/annuaire")).toBe("/cz/adresar");
		expect(localePath("cs-CZ", "/confidentialite")).toBe("/cz/ochrana-osobnich-udaju");
		expect(localePath("cs-CZ", "/mentions-legales")).toBe("/cz/pravni-informace");
	});

	it("translates into Czech only segments reserved in Czechia", () => {
		for (const czech of Object.values(CZECH_SEGMENTS)) {
			expect(isCzListingSlug(czech), czech).toBe(false);
		}
		const firsts = Object.values(routing.pathnames)
			.filter((entry) => typeof entry !== "string")
			.map((entry) => entry["cs-CZ"].split("/")[1] ?? "")
			.filter((first) => first && !first.startsWith("["));
		for (const first of firsts) expect(CZ_RESERVED_SEGMENTS as readonly string[]).toContain(first);
	});

	it("builds email links like the router does", () => {
		for (const locale of LOCALES) {
			for (const pathname of simple) {
				const href = hrefOf(pathname);
				const params = typeof href === "string" ? {} : href.params;
				expect(localePath(locale, pathname, params), `${locale} ${pathname}`).toBe(
					getPathname({ href: href as never, locale }),
				);
			}
		}
		expect(localePath("de", "/praticien/[slug]", { slug: "camille-exemple-19999990013" })).toBe(
			"/fr-de/behandler/camille-exemple-19999990013",
		);
		expect(localePath("fr", "/rdv")).toBe("/fr/rdv");
		expect(localePath("fr", "/")).toBe("/fr");
		expect(localePath("it", "/")).toBe("/fr-it");
	});
});

describe("the markets a search can move to", () => {
	it("are the open markets, France first, each at its own segment", () => {
		expect(MARKET_COUNTRIES).toEqual(["FR", "AT", "GB", "CZ"]);
		expect(MARKET_COUNTRIES.map(marketSegment)).toEqual(["fr", "at", "gb", "cz"]);
		for (const country of MARKET_COUNTRIES) {
			expect(marketOfSegment(marketSegment(country))).toBe(country);
		}
		expect(marketOfSegment(" GB ")).toBe("GB");
		expect(marketOfSegment("fr-en")).toBeNull();
		expect(marketOfSegment("de")).toBeNull();
		expect(marketOfSegment(null)).toBeNull();
	});

	it("open in the visitor's language when the market offers it", () => {
		expect(marketLocaleFor("FR", "en")).toBe("en");
		expect(marketLocaleFor("GB", "fr")).toBe("en-GB");
		expect(marketLocaleFor("GB", "en")).toBe("en-GB");
		expect(marketLocaleFor("FR", "en-GB")).toBe("en");
		expect(marketLocaleFor("FR", "de-AT")).toBe("de");
		expect(marketLocaleFor("AT", "de")).toBe("de-AT");
		expect(marketLocaleFor("CZ", "fr")).toBe("cs-CZ");
		expect(marketLocaleFor("FR", "cs-CZ")).toBe("fr");
		// A visitor already in the market keeps the locale.
		expect(marketLocaleFor("FR", "it")).toBe("it");
	});
});
