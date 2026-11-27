import { describe, expect, it } from "vitest";
import { routing } from "~/i18n/routing";
import { hasOwnStaticForm, ownPathnames, templatePattern } from "./own-pathname";

type Table = Record<string, Record<string, string>>;

describe("a locale's own route table", () => {
	it("reads route templates as patterns", () => {
		expect(templatePattern("/etablissement/[slug]").test("/etablissement/x-1")).toBe(true);
		expect(templatePattern("/etablissement/[slug]").test("/etablissement/x/y")).toBe(false);
		expect(templatePattern("/[specialite]/[dept]/[[...rest]]").test("/spital/zuerich")).toBe(true);
		expect(templatePattern("/[specialite]/[dept]/[[...rest]]").test("/spital/a/b/c")).toBe(true);
		expect(templatePattern("/").test("/")).toBe(true);
	});

	it("claims a path that is its locale's own static form of a page", () => {
		const { pathnames } = routing;
		// France's establishment page, the Swiss French facility page, France in Italian and German.
		expect(hasOwnStaticForm(pathnames, "fr", "/etablissement/centre-1")).toBe(true);
		expect(hasOwnStaticForm(pathnames, "fr-CH", "/etablissement/spital-h123456789")).toBe(true);
		expect(hasOwnStaticForm(pathnames, "it", "/struttura/centre-1")).toBe(true);
		expect(hasOwnStaticForm(pathnames, "de", "/einrichtung/centre-1")).toBe(true);
		// Germany's and Switzerland's German facility pages, Austria's establishment page.
		expect(hasOwnStaticForm(pathnames, "de-DE", "/einrichtung/klinikum-beispiel-k0a1b2c3d4e")).toBe(
			true,
		);
		expect(hasOwnStaticForm(pathnames, "de-CH", "/einrichtung/spital-h123456789")).toBe(true);
		expect(hasOwnStaticForm(pathnames, "de-AT", "/einrichtung/centre-1")).toBe(true);
		// Ireland's facility and establishment pages, under English segments of their own.
		expect(hasOwnStaticForm(pathnames, "en-IE", "/facility/example-pharmacy-p1234")).toBe(true);
		expect(hasOwnStaticForm(pathnames, "en-IE", "/establishment/x-1")).toBe(true);
		expect(hasOwnStaticForm(pathnames, "en-IE", "/practice/x-1")).toBe(false);
		expect(hasOwnStaticForm(pathnames, "en-IE", "/pharmacy/cork")).toBe(false);
		// Sweden's facility and establishment pages, under Swedish segments.
		expect(hasOwnStaticForm(pathnames, "sv-SE", "/verksamhet/exempelapoteket-a7359999000014")).toBe(
			true,
		);
		expect(hasOwnStaticForm(pathnames, "sv-SE", "/organisation/x-1")).toBe(true);
		expect(hasOwnStaticForm(pathnames, "sv-SE", "/apoteken/stockholms-lan")).toBe(false);
		// Another language's words, or a listing: next-intl's shared table reads them.
		expect(hasOwnStaticForm(pathnames, "fr", "/practitioner/x")).toBe(false);
		expect(hasOwnStaticForm(pathnames, "fr", "/medecin-generaliste/75-paris")).toBe(false);
	});

	it("gives every locale of a page the locale's own form", () => {
		const own = ownPathnames(routing.pathnames, "fr") as unknown as Table;
		expect(own["/etablissement/[slug]"]?.["fr-CH"]).toBe("/etablissement/[slug]");
		expect(own["/praticien/[slug]"]?.["fr-CH"]).toBe("/praticien/[slug]");
		expect(own["/praticien/[slug]"]?.en).toBe("/praticien/[slug]");
		const swiss = ownPathnames(routing.pathnames, "fr-CH") as unknown as Table;
		expect(swiss["/praticien/[slug]"]?.fr).toBe("/etablissement/[slug]");
		// `/de/einrichtung/…` is Germany's facility page, never France's German establishment page.
		const german = ownPathnames(routing.pathnames, "de-DE") as unknown as Table;
		expect(german["/praticien/[slug]"]?.de).toBe("/einrichtung/[slug]");
		expect(german["/etablissement/[slug]"]?.de).toBe("/organisation/[slug]");
	});
});
