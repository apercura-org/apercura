import { describe, expect, it } from "vitest";
import { inEveryLanguage, SITEMAP_MARKETS, sitemapCountryOf } from "~/server/queries/sitemap-sql";
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

	it("gives Lithuania its Lithuanian route segments under /lt", () => {
		expect(marketPagePath("lt", "/")).toBe("/lt");
		expect(marketPagePath("lt", "/praticien/uab-pavyzdine-klinika-9000-90000009")).toBe(
			"/lt/istaiga/uab-pavyzdine-klinika-9000-90000009",
		);
		expect(marketPagePath("lt", "/etablissement/x-1")).toBe("/lt/organizacija/x-1");
		expect(marketPagePath("lt", "/annuaire/kauno-rajono-savivaldybe/garliava")).toBe(
			"/lt/katalogas/kauno-rajono-savivaldybe/garliava",
		);
		expect(marketPagePath("lt", "/ligonines/vilniaus-apskritis")).toBe(
			"/lt/ligonines/vilniaus-apskritis",
		);
		expect(marketPagePath("lt", "/donnees")).toBe("/lt/duomenys");
		expect(marketPagePath("lt", "/accessibilite")).toBe("/lt/prieinamumas");
		expect(marketPagePath("lt", "/confidentialite")).toBe("/lt/privatumas");
		expect(MARKET_STATIC_PATHS.lt).not.toContain("/pro");
		expect(MARKET_STATIC_PATHS.lt).toContain("/accessibilite");
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

describe("Ireland's sitemap paths", () => {
	it("gives Ireland its English route segments under /ie, a facility under /facility", () => {
		expect(marketPagePath("ie", "/")).toBe("/ie");
		expect(marketPagePath("ie", "/praticien/example-pharmacy-p1234")).toBe(
			"/ie/facility/example-pharmacy-p1234",
		);
		expect(marketPagePath("ie", "/etablissement/x-1")).toBe("/ie/establishment/x-1");
		expect(marketPagePath("ie", "/annuaire/cork/cork")).toBe("/ie/directory/cork/cork");
		expect(marketPagePath("ie", "/pharmacy/cork/cork")).toBe("/ie/pharmacy/cork/cork");
		expect(marketPagePath("ie", "/confidentialite")).toBe("/ie/privacy");
		expect(marketPagePath("ie", "/mentions-legales")).toBe("/ie/legal-notice");
		expect(marketPagePath("ie", "/donnees")).toBe("/ie/data");
		expect(MARKET_STATIC_PATHS.ie).not.toContain("/pro");
		expect(MARKET_STATIC_PATHS.ie).toContain("/accessibilite");
		const chunk = { market: "ie", kind: "praticiens", chunk: 0, lastmod: "2026-11-27", urls: 3 };
		expect(inEveryLanguage([chunk as never]).map((item) => item.market)).toEqual(["ie"]);
		expect(sitemapCountryOf("ie")).toBe("IE");
	});
});

describe("Latvia's sitemap paths", () => {
	it("gives Latvia its Latvian route segments under /lv, and a sitemap of its own", () => {
		expect(SITEMAP_MARKETS).toContain("lv");
		expect(marketPagePath("lv", "/")).toBe("/lv");
		expect(marketPagePath("lv", "/praticien/paraugu-aptieka-1-a900001")).toBe(
			"/lv/iestade/paraugu-aptieka-1-a900001",
		);
		expect(marketPagePath("lv", "/annuaire/siguldas-novads/sigulda")).toBe(
			"/lv/katalogs/siguldas-novads/sigulda",
		);
		expect(marketPagePath("lv", "/aptiekas/riga")).toBe("/lv/aptiekas/riga");
		expect(marketPagePath("lv", "/donnees")).toBe("/lv/dati");
		expect(marketPagePath("lv", "/accessibilite")).toBe("/lv/pieklustamiba");
		expect(marketPagePath("lv", "/mentions-legales")).toBe("/lv/juridiska-informacija");
		expect(MARKET_STATIC_PATHS.lv).not.toContain("/pro");
		expect(MARKET_STATIC_PATHS.lv).toContain("/accessibilite");
		const chunk = { market: "lv", kind: "listes", chunk: 0, lastmod: "2026-11-27", urls: 3 };
		expect(inEveryLanguage([chunk as never]).map((item) => item.market)).toEqual(["lv"]);
		expect(sitemapCountryOf("lv")).toBe("LV");
	});
});

describe("Sweden's sitemap paths", () => {
	it("gives Sweden its Swedish route segments under /se, a facility under /verksamhet", () => {
		expect(marketPagePath("se", "/")).toBe("/se");
		expect(marketPagePath("se", "/praticien/exempelapoteket-a7359999000014")).toBe(
			"/se/verksamhet/exempelapoteket-a7359999000014",
		);
		expect(marketPagePath("se", "/etablissement/x-1")).toBe("/se/organisation/x-1");
		expect(marketPagePath("se", "/annuaire/stockholms-lan/stockholm")).toBe(
			"/se/katalog/stockholms-lan/stockholm",
		);
		expect(marketPagePath("se", "/apoteken/stockholms-lan/stockholm")).toBe(
			"/se/apoteken/stockholms-lan/stockholm",
		);
		expect(marketPagePath("se", "/confidentialite")).toBe("/se/integritet");
		expect(marketPagePath("se", "/mentions-legales")).toBe("/se/juridisk-information");
		expect(marketPagePath("se", "/donnees")).toBe("/se/data");
		expect(MARKET_STATIC_PATHS.se).not.toContain("/pro");
		expect(MARKET_STATIC_PATHS.se).toContain("/accessibilite");
		const chunk = { market: "se", kind: "praticiens", chunk: 0, lastmod: "2026-11-27", urls: 3 };
		expect(inEveryLanguage([chunk as never]).map((item) => item.market)).toEqual(["se"]);
		expect(sitemapCountryOf("se")).toBe("SE");
	});
});
