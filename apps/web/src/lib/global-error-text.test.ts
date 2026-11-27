import { describe, expect, it } from "vitest";
import { messagesFor } from "~/i18n/catalogs";
import { CATALOG_LANGUAGES, LOCALES } from "~/i18n/locales";
import { globalErrorDocument, localeOfPath } from "./global-error-locale";
import { GLOBAL_ERROR_TEXT } from "./global-error-text";

describe("the text of the global error page", () => {
	it.each(LOCALES)("is the %s catalog's ErrorPages.error, word for word", (locale) => {
		expect(GLOBAL_ERROR_TEXT[CATALOG_LANGUAGES[locale]]).toEqual(
			messagesFor(locale).ErrorPages.error,
		);
	});
});

describe("localeOfPath", () => {
	it("reads the locale from the first segment", () => {
		expect(localeOfPath("/fr/praticien/x")).toBe("fr");
		expect(localeOfPath("/fr-de/suche")).toBe("de");
		expect(localeOfPath("/AT/verzeichnis")).toBe("de-AT");
		expect(localeOfPath("/cz")).toBe("cs-CZ");
	});

	it("is null outside the locales", () => {
		expect(localeOfPath("/")).toBeNull();
		expect(localeOfPath("/missing.txt")).toBeNull();
		expect(localeOfPath(null)).toBeNull();
	});
});

describe("globalErrorDocument", () => {
	it("speaks the language of the URL and links to its home", () => {
		expect(globalErrorDocument("/at/arzt/x")).toEqual({
			lang: "de-AT",
			language: "de",
			home: "/at",
		});
		expect(globalErrorDocument("/fr-it/elenco")).toEqual({
			lang: "it",
			language: "it",
			home: "/fr-it",
		});
		expect(globalErrorDocument("/cz")).toEqual({ lang: "cs-CZ", language: "cs", home: "/cz" });
		expect(globalErrorDocument("/lt/istaiga/x")).toEqual({
			lang: "lt-LT",
			language: "lt",
			home: "/lt",
		});
	});

	it("falls back to English and the international home", () => {
		expect(globalErrorDocument("/")).toEqual({ lang: "en", language: "en", home: "/" });
	});
});
