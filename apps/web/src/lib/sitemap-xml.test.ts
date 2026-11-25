import { describe, expect, it } from "vitest";
import { MARKET_STATIC_PATHS, marketPagePath } from "./sitemap-xml";

describe("market page paths of the sitemaps", () => {
	it("keeps France's paths French under /fr", () => {
		expect(marketPagePath("fr", "/")).toBe("/fr");
		expect(marketPagePath("fr", "/praticien/camille-exemple-19999990013")).toBe(
			"/fr/praticien/camille-exemple-19999990013",
		);
		expect(marketPagePath("fr", "/cardiologue/69-rhone/lyon")).toBe(
			"/fr/cardiologue/69-rhone/lyon",
		);
	});

	it("gives Austria its German route segments under /at, listing and place slugs unchanged", () => {
		expect(marketPagePath("at", "/")).toBe("/at");
		expect(marketPagePath("at", "/praticien/anna-beispiel-w900001")).toBe(
			"/at/arzt/anna-beispiel-w900001",
		);
		expect(marketPagePath("at", "/annuaire/steiermark/graz")).toBe(
			"/at/verzeichnis/steiermark/graz",
		);
		expect(marketPagePath("at", "/allgemeinmedizin/wien/alsergrund")).toBe(
			"/at/allgemeinmedizin/wien/alsergrund",
		);
		expect(marketPagePath("at", "/mentions-legales")).toBe("/at/impressum");
	});

	it("lists Austria's static pages without the French practitioner space", () => {
		expect(MARKET_STATIC_PATHS.at).not.toContain("/pro");
		expect(MARKET_STATIC_PATHS.at).toContain("/donnees");
		expect(MARKET_STATIC_PATHS.fr).toContain("/pro");
	});
});
