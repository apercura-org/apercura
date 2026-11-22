import { isListingSlug, isReservedSegment } from "@apercura/core/taxonomy";
import { describe, expect, it } from "vitest";
import { robotsFor } from "~/lib/robots";
import {
	DEFAULT_LOCALE,
	INDEXABLE_LOCALES,
	LOCALE_TAGS,
	LOCALES,
	OG_LOCALES,
	PREFIXED_LOCALES,
	toLocale,
} from "./locales";
import { getPathname } from "./navigation";
import { localePath } from "./paths";
import { type AppPathname, routing } from "./routing";

const PARAMS: Record<string, string> = {
	slug: "camille-exemple-19999990013",
	id: "abc",
	dept: "rhone",
	commune: "lyon",
};

const pathnames = Object.keys(routing.pathnames) as AppPathname[];

/** Pathnames without a catch-all segment, with example params. */
const simple = pathnames.filter((pathname) => !pathname.includes("..."));

function hrefOf(pathname: AppPathname) {
	const params = Object.fromEntries(
		[...pathname.matchAll(/\[(\w+)\]/g)].map(([, name]) => [name, PARAMS[name as string] ?? "x"]),
	);
	return Object.keys(params).length > 0 ? { pathname, params } : pathname;
}

describe("locale configuration", () => {
	it("serves five locales, French by default and without a prefix", () => {
		expect(LOCALES).toEqual(["fr", "en", "de", "es", "it"]);
		expect(routing.locales).toEqual(LOCALES);
		expect(routing.defaultLocale).toBe("fr");
		expect(DEFAULT_LOCALE).toBe("fr");
		expect(PREFIXED_LOCALES).toEqual(["en", "de", "es", "it"]);
		expect(routing.localePrefix).toBe("as-needed");
	});

	it("formats each locale with its own country and a BCP 47 tag", () => {
		expect(LOCALE_TAGS).toEqual({
			fr: "fr-FR",
			en: "en-GB",
			de: "de-DE",
			es: "es-ES",
			it: "it-IT",
		});
		expect(OG_LOCALES).toEqual({ fr: "fr_FR", en: "en_GB", de: "de_DE", es: "es_ES", it: "it_IT" });
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

	it("indexes French pages only and announces no alternates", () => {
		expect(INDEXABLE_LOCALES).toEqual(["fr"]);
		expect(routing.alternateLinks).toBe(false);
		expect(robotsFor("fr", true)).toEqual({ index: true, follow: true });
		for (const locale of PREFIXED_LOCALES) {
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

	it("keeps translated first segments clear of listing slugs and reserves the prefixes", () => {
		for (const locale of PREFIXED_LOCALES) {
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
				.filter(Boolean);
			if (first) expect(isReservedSegment(first), pathname).toBe(true);
		}
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
			"/de/behandler/camille-exemple-19999990013",
		);
		expect(localePath("fr", "/rdv")).toBe("/rdv");
		expect(localePath("it", "/")).toBe("/it");
	});
});
