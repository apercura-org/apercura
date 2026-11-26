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

	it("gives the UK its English route segments under /gb", () => {
		expect(marketPagePath("gb", "/")).toBe("/gb");
		expect(marketPagePath("gb", "/praticien/the-example-surgery-a99001")).toBe(
			"/gb/practice/the-example-surgery-a99001",
		);
		expect(marketPagePath("gb", "/annuaire/stockton-on-tees/yarm")).toBe(
			"/gb/directory/stockton-on-tees/yarm",
		);
		expect(marketPagePath("gb", "/gp-practices/north-east")).toBe("/gb/gp-practices/north-east");
		expect(marketPagePath("gb", "/confidentialite")).toBe("/gb/privacy");
		expect(MARKET_STATIC_PATHS.gb).not.toContain("/pro");
		expect(MARKET_STATIC_PATHS.gb).toContain("/accessibilite");
	});

	it("gives Czechia its Czech route segments under /cz", () => {
		expect(marketPagePath("cz", "/")).toBe("/cz");
		expect(marketPagePath("cz", "/praticien/mudr-jana-ukazkova-900001")).toBe(
			"/cz/zarizeni/mudr-jana-ukazkova-900001",
		);
		expect(marketPagePath("cz", "/annuaire/praha/praha-2")).toBe("/cz/adresar/praha/praha-2");
		expect(marketPagePath("cz", "/prakticky-lekar/praha/praha-2")).toBe(
			"/cz/prakticky-lekar/praha/praha-2",
		);
		expect(marketPagePath("cz", "/donnees")).toBe("/cz/data");
		expect(marketPagePath("cz", "/accessibilite")).toBe("/cz/pristupnost");
		expect(MARKET_STATIC_PATHS.cz).not.toContain("/pro");
		expect(MARKET_STATIC_PATHS.cz).toContain("/accessibilite");
	});

	it("gives Spain its Spanish route segments under /es", () => {
		expect(marketPagePath("es", "/")).toBe("/es");
		expect(marketPagePath("es", "/praticien/clinica-dental-ejemplo-centro-1328000001")).toBe(
			"/es/centro/clinica-dental-ejemplo-centro-1328000001",
		);
		expect(marketPagePath("es", "/etablissement/x-1")).toBe("/es/organizacion/x-1");
		expect(marketPagePath("es", "/annuaire/madrid/madrid")).toBe("/es/directorio/madrid/madrid");
		expect(marketPagePath("es", "/dentistas/madrid/madrid")).toBe("/es/dentistas/madrid/madrid");
		expect(marketPagePath("es", "/donnees")).toBe("/es/datos");
		expect(marketPagePath("es", "/accessibilite")).toBe("/es/accesibilidad");
		expect(marketPagePath("es", "/mentions-legales")).toBe("/es/aviso-legal");
		expect(MARKET_STATIC_PATHS.es).not.toContain("/pro");
		expect(MARKET_STATIC_PATHS.es).toContain("/accessibilite");
	});
});
