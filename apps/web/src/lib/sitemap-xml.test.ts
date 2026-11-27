import { describe, expect, it } from "vitest";
import { inEveryLanguage, sitemapCountryOf } from "~/server/queries/sitemap-sql";
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

	it("gives Germany its German route segments under /de", () => {
		expect(marketPagePath("de", "/")).toBe("/de");
		expect(marketPagePath("de", "/praticien/klinikum-beispiel-k0a1b2c3d4e")).toBe(
			"/de/einrichtung/klinikum-beispiel-k0a1b2c3d4e",
		);
		expect(marketPagePath("de", "/etablissement/x-1")).toBe("/de/organisation/x-1");
		expect(marketPagePath("de", "/annuaire/landkreis-muenchen/unterhaching")).toBe(
			"/de/verzeichnis/landkreis-muenchen/unterhaching",
		);
		expect(marketPagePath("de", "/krankenhaeuser/berlin")).toBe("/de/krankenhaeuser/berlin");
		expect(marketPagePath("de", "/donnees")).toBe("/de/daten");
		expect(marketPagePath("de", "/accessibilite")).toBe("/de/barrierefreiheit");
		expect(marketPagePath("de", "/mentions-legales")).toBe("/de/impressum");
		expect(MARKET_STATIC_PATHS.de).not.toContain("/pro");
		expect(MARKET_STATIC_PATHS.de).toContain("/accessibilite");
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

describe("Italy's sitemap paths", () => {
	it("gives Italy its Italian route segments under /it", () => {
		expect(marketPagePath("it", "/")).toBe("/it");
		expect(marketPagePath("it", "/praticien/farmacia-esempio-f9000001")).toBe(
			"/it/struttura/farmacia-esempio-f9000001",
		);
		expect(marketPagePath("it", "/etablissement/x-1")).toBe("/it/organizzazione/x-1");
		expect(marketPagePath("it", "/annuaire/roma/roma")).toBe("/it/elenco/roma/roma");
		expect(marketPagePath("it", "/farmacie/roma/roma")).toBe("/it/farmacie/roma/roma");
		expect(marketPagePath("it", "/farmacie/lazio")).toBe("/it/farmacie/lazio");
		expect(marketPagePath("it", "/donnees")).toBe("/it/dati");
		expect(marketPagePath("it", "/accessibilite")).toBe("/it/accessibilita");
		expect(marketPagePath("it", "/mentions-legales")).toBe("/it/note-legali");
		expect(MARKET_STATIC_PATHS.it).not.toContain("/pro");
		expect(MARKET_STATIC_PATHS.it).toContain("/accessibilite");
	});
});

describe("Switzerland's sitemap paths", () => {
	it("gives each of Switzerland's languages its route segments under its own segment", () => {
		expect(marketPagePath("ch", "/")).toBe("/ch");
		expect(marketPagePath("ch-fr", "/")).toBe("/ch-fr");
		expect(marketPagePath("ch-it", "/")).toBe("/ch-it");
		const facility = "/praticien/kantonsspital-beispiel-h123456789";
		expect(marketPagePath("ch", facility)).toBe(
			"/ch/einrichtung/kantonsspital-beispiel-h123456789",
		);
		expect(marketPagePath("ch-fr", facility)).toBe(
			"/ch-fr/etablissement/kantonsspital-beispiel-h123456789",
		);
		expect(marketPagePath("ch-it", facility)).toBe(
			"/ch-it/struttura/kantonsspital-beispiel-h123456789",
		);
		expect(marketPagePath("ch", "/etablissement/x-1")).toBe("/ch/organisation/x-1");
		expect(marketPagePath("ch-it", "/etablissement/x-1")).toBe("/ch-it/organizzazione/x-1");
		expect(marketPagePath("ch", "/annuaire/zuerich")).toBe("/ch/verzeichnis/zuerich");
		expect(marketPagePath("ch-fr", "/annuaire/canton-de-geneve/geneve")).toBe(
			"/ch-fr/annuaire/canton-de-geneve/geneve",
		);
		expect(marketPagePath("ch-it", "/spital/bezirk-zuerich/zuerich")).toBe(
			"/ch-it/spital/bezirk-zuerich/zuerich",
		);
		expect(marketPagePath("ch", "/mentions-legales")).toBe("/ch/impressum");
		expect(marketPagePath("ch-fr", "/mentions-legales")).toBe("/ch-fr/mentions-legales");
		expect(marketPagePath("ch-it", "/donnees")).toBe("/ch-it/dati");
		for (const market of ["ch", "ch-fr", "ch-it"] as const) {
			expect(MARKET_STATIC_PATHS[market]).not.toContain("/pro");
			expect(MARKET_STATIC_PATHS[market]).toContain("/accessibilite");
		}
	});

	it("lists a Swiss chunk of the read models once per language, every other market's once", () => {
		const chunk = (market: string) =>
			({ market, kind: "praticiens", chunk: 0, lastmod: "2026-11-27", urls: 12 }) as never;
		expect(inEveryLanguage([chunk("ch"), chunk("it")]).map((item) => item.market)).toEqual([
			"ch",
			"ch-fr",
			"ch-it",
			"it",
		]);
		expect(sitemapCountryOf("ch-fr")).toBe("CH");
		expect(sitemapCountryOf("fr")).toBe("FR");
	});
});
