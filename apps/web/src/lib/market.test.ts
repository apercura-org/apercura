import { describe, expect, it } from "vitest";
import {
	austrianSourcesOf,
	isMarketListingSlug,
	italianAttribution,
	italianSourceDate,
	listingFees,
	marketBooks,
	openDataSourcesOf,
	professionFees,
	professionSlugOf,
	showsBillingFacts,
	swissAttribution,
} from "./market";
import {
	CITY_IS_DEPARTMENT,
	isDepartmentCity,
	isDepartmentSlug,
	NOT_DEPARTMENT_CITY,
	placeLabel,
} from "./places";
import { addressLines, formatPhone, localityOf } from "./practitioner-view";
import { swissFacilityFacts } from "./swiss-facility";

describe("what a market's pages show", () => {
	it("serves each market's own listing slugs only", () => {
		expect(isMarketListingSlug("de-AT", "allgemeinmedizin")).toBe(true);
		expect(isMarketListingSlug("de-AT", "medecin-generaliste")).toBe(false);
		expect(isMarketListingSlug("fr", "medecin-generaliste")).toBe(true);
		expect(isMarketListingSlug("de", "allgemeinmedizin")).toBe(false);
		expect(isMarketListingSlug("de-AT", "arzt")).toBe(false);
	});

	it("prints French insurance facts and booking in France only", () => {
		expect(showsBillingFacts("fr")).toBe(true);
		expect(showsBillingFacts("en")).toBe(true);
		expect(showsBillingFacts("de-AT")).toBe(false);
		expect(listingFees("fr", "cardiologue")).toBe("sector");
		expect(listingFees("de-AT", "kardiologie")).toBe("other");
		expect(professionFees("fr", "10")).toBe(true);
		expect(professionFees("de-AT", "ARZT")).toBe(false);
		expect(marketBooks("fr")).toBe(true);
		expect(marketBooks("de-AT")).toBe(false);
	});

	it("names profession slugs of both markets", () => {
		expect(professionSlugOf("10")).toBe("medecin");
		expect(professionSlugOf("ARZT")).toBe("aerzte");
		expect(professionSlugOf("ZAHNARZT")).toBe("zahnaerzte");
		expect(professionSlugOf("XX")).toBe("");
	});

	it("credits each Austrian list with its CC BY attribution word for word", () => {
		expect(austrianSourcesOf(["at-wien", "at-wien", "ans", undefined])).toEqual([
			{ name: "Ärzte Standorte Wien", attribution: "Datenquelle: Stadt Wien – data.wien.gv.at" },
		]);
		expect(austrianSourcesOf(["ans"])).toEqual([]);
	});
});

describe("places of a market", () => {
	it("checks department slugs per market before any database access", () => {
		expect(isDepartmentSlug("69-rhone")).toBe(true);
		expect(isDepartmentSlug("wien")).toBe(false);
		expect(isDepartmentSlug("wien", "AT")).toBe(true);
		expect(isDepartmentSlug("niederoesterreich", "AT")).toBe(true);
		expect(isDepartmentSlug("69-rhone", "AT")).toBe(false);
		expect(isDepartmentSlug("landkreis-muenchen", "DE")).toBe(true);
		expect(isDepartmentSlug("09162", "DE")).toBe(false);
	});

	it("treats Paris, Wien, Praha, Germany's kreisfreie Städte and Poland's cities with powiat rights as their department's page", () => {
		expect(isDepartmentCity("FR", "75056")).toBe(true);
		expect(isDepartmentCity("AT", "90001")).toBe(true);
		expect(isDepartmentCity("AT", "75056")).toBe(false);
		expect(isDepartmentCity("CZ", "554782")).toBe(true);
		expect(CITY_IS_DEPARTMENT).toEqual({ FR: "75056", AT: "90001", CZ: "554782" });
		// A kreisfreie Stadt is the Gemeinde `000` of its Kreis: München, Berlin, Hamburg.
		expect(isDepartmentCity("DE", "09162000")).toBe(true);
		expect(isDepartmentCity("DE", "11000000")).toBe(true);
		expect(isDepartmentCity("DE", "09184148")).toBe(false);
		expect(isDepartmentCity("DE", "09162")).toBe(false);
		expect(isDepartmentCity("FR", "09162000")).toBe(false);
		expect(NOT_DEPARTMENT_CITY("p")).toBe(
			"NOT (p.country = 'FR' AND p.code = '75056') AND NOT (p.country = 'AT' AND p.code = '90001') AND NOT (p.country = 'CZ' AND p.code = '554782') AND NOT (p.country = 'DE' AND p.code LIKE '_____000') AND NOT (p.country = 'EE' AND p.kind = 'commune' AND p.code IN ('0296', '0424', '0446', '0511', '0663', '0736', '0897', '0919')) AND NOT (p.country = 'PL' AND p.kind = 'commune' AND substr(p.code, 3, 1) IN ('6', '7', '8', '9'))",
		);
		// Narva is the municipality of Narva's only settlement, which shares its code; Tartu's holds
		// villages too.
		expect(isDepartmentCity("EE", "0511")).toBe(true);
		expect(isDepartmentCity("EE", "8151")).toBe(false);
		expect(isDepartmentCity("FR", "0511")).toBe(false);
		// A city with powiat rights is the gmina of a powiat numbered from 61: Kraków, Warszawa.
		expect(isDepartmentCity("PL", "1261011")).toBe(true);
		expect(isDepartmentCity("PL", "1465011")).toBe(true);
		expect(isDepartmentCity("PL", "1206113")).toBe(false);
		expect(isDepartmentCity("PL", "1261")).toBe(false);
		expect(isDepartmentCity("CZ", "1261011")).toBe(false);
	});

	it("labels Austrian places without codes", () => {
		const state = { kind: "department", code: "9", name: "Wien", departmentCode: "9" } as const;
		const town = { kind: "commune", code: "60101", name: "Graz", departmentCode: "6" } as const;
		expect(placeLabel(state, "AT")).toBe("Wien");
		expect(placeLabel(town, "AT")).toBe("Graz");
		expect(placeLabel(town)).toBe("Graz (6)");
	});
});

describe("Austrian addresses and phones", () => {
	it("writes a Vienna district as the city, and keeps the street as published", () => {
		const site = {
			addressLine: "Alser Straße 63A/1-3",
			addressComplement: null,
			postcode: "1090",
			placeName: "Wien-Alsergrund",
		};
		expect(addressLines(site, "AT")).toEqual(["Alser Straße 63A/1-3", "1090 Wien"]);
		expect(localityOf("Wien-Alsergrund", "AT")).toBe("Wien");
		expect(localityOf("Graz", "AT")).toBe("Graz");
		expect(localityOf("Wien-Alsergrund")).toBe("Wien-Alsergrund");
	});

	it("formats each market's numbers its own way", () => {
		expect(formatPhone("+4317673315")).toBe("01 7673315");
		expect(formatPhone("+33155347620")).toBe("01 55 34 76 20");
	});
});

describe("the UK's pages", () => {
	it("serve the UK's listings, without booking or French insurance facts", () => {
		expect(isMarketListingSlug("en-GB", "gp-practices")).toBe(true);
		expect(isMarketListingSlug("en-GB", "cardiologue")).toBe(false);
		expect(isMarketListingSlug("fr", "gp-practices")).toBe(false);
		expect(showsBillingFacts("en-GB")).toBe(false);
		expect(marketBooks("en-GB")).toBe(false);
		expect(professionSlugOf("GB_PHARMACY")).toBe("pharmacies");
	});

	it("check UK place slugs, a region's included, and label places without codes", () => {
		expect(isDepartmentSlug("stockton-on-tees", "GB")).toBe(true);
		expect(isDepartmentSlug("north-east", "GB")).toBe(true);
		expect(isDepartmentSlug("2", "GB")).toBe(false);
		expect(isDepartmentSlug("Camden", "GB")).toBe(false);
		expect(
			placeLabel(
				{ kind: "department", code: "E09000007", name: "Camden", departmentCode: "E09000007" },
				"GB",
			),
		).toBe("Camden");
		expect(isDepartmentCity("GB", "E09000007")).toBe(false);
	});

	it("write UK addresses town and postcode on lines of their own, and UK numbers", () => {
		const site = {
			addressLine: "Health Centre, Sample Street",
			addressComplement: null,
			postcode: "TS18 1ZA",
			placeName: "Stockton-on-Tees",
		};
		expect(addressLines(site, "GB")).toEqual([
			"Health Centre, Sample Street",
			"Stockton-on-Tees",
			"TS18 1ZA",
		]);
		expect(formatPhone("+441632960001")).toBe("01632 960001");
		expect(formatPhone("+442079460005")).toBe("020 7946 0005");
	});

	it("credit each list with its OGL attribution, and Code-Point Open where a postcode located it", () => {
		const located = { postcode: "TS18 1ZA", geoPrecision: "street" };
		const sources = openDataSourcesOf("GB", [
			{ source: "gb-ods-gp", site: located },
			{ source: "gb-ods-branch", site: located },
		]);
		expect(sources.map((source) => source.name)).toEqual([
			"GP practices (epraccur) and branch surgeries (ebranchs)",
			"Code-Point Open",
		]);
		expect(sources[0]?.attribution).toContain("Open Government Licence v3.0");
		const northernIrish = openDataSourcesOf("GB", [
			{ source: "gb-bso-gp", site: { postcode: "BT9 9ZZ", geoPrecision: "city" } },
		]);
		expect(northernIrish.map((source) => source.name)).toEqual([
			"GP Practice List Sizes (GP Practice Reference File)",
		]);
		expect(openDataSourcesOf("FR", [{ source: "ans", site: located }])).toEqual([]);
	});
});

describe("Czechia's pages", () => {
	it("serve Czechia's listings, without booking or French insurance facts", () => {
		expect(isMarketListingSlug("cs-CZ", "prakticky-lekar")).toBe(true);
		expect(isMarketListingSlug("cs-CZ", "kardiolog")).toBe(true);
		expect(isMarketListingSlug("cs-CZ", "zarizeni")).toBe(false);
		expect(isMarketListingSlug("cs-CZ", "cardiologue")).toBe(false);
		expect(isMarketListingSlug("fr", "kardiolog")).toBe(false);
		expect(showsBillingFacts("cs-CZ")).toBe(false);
		expect(marketBooks("cs-CZ")).toBe(false);
		expect(professionSlugOf("CZ_PHARMACY")).toBe("lekarna");
		expect(professionSlugOf("CZ_SPECIALIST")).toBe("lekar-specialista");
	});

	it("check district slugs and label places by name, Prague's city being its district", () => {
		expect(isDepartmentSlug("brno-mesto", "CZ")).toBe(true);
		expect(isDepartmentSlug("praha", "CZ")).toBe(true);
		expect(isDepartmentSlug("69-rhone", "CZ")).toBe(true);
		expect(isDepartmentSlug("12", "CZ")).toBe(false);
		expect(
			placeLabel(
				{ kind: "department", code: "CZ0642", name: "Brno-město", departmentCode: "CZ0642" },
				"CZ",
			),
		).toBe("Brno-město");
		expect(
			placeLabel({ kind: "commune", code: "582786", name: "Brno", departmentCode: "CZ0642" }, "CZ"),
		).toBe("Brno");
		expect(isDepartmentCity("CZ", "554782")).toBe(true);
		expect(isDepartmentCity("CZ", "582786")).toBe(false);
	});

	it("write Czech addresses street, then postcode and town, and Czech numbers", () => {
		const site = {
			addressLine: "Ukázková 1234/12",
			addressComplement: null,
			postcode: "120 00",
			placeName: "Praha 2",
		};
		expect(addressLines(site, "CZ")).toEqual(["Ukázková 1234/12", "120 00 Praha 2"]);
		expect(localityOf("Praha 2", "CZ")).toBe("Praha 2");
		expect(formatPhone("+420222333444")).toBe("222 333 444");
	});

	it("credit the NRPZS and RÚIAN with their CC BY 4.0 attribution", () => {
		const sources = openDataSourcesOf("CZ", [{ source: "cz-nrpzs", site: null }]);
		expect(sources.map((source) => source.attribution)).toEqual([
			"Zdroj: Ministerstvo zdravotnictví ČR a Ústav zdravotnických informací a statistiky ČR, Národní registr poskytovatelů zdravotních služeb (nzip.cz)",
			"ČÚZK, 2026",
		]);
		expect(openDataSourcesOf("CZ", [])).toEqual([]);
	});
});

describe("Spain's pages", () => {
	it("serve Spain's listings, without booking or French insurance facts", () => {
		expect(isMarketListingSlug("es-ES", "dentistas")).toBe(true);
		expect(isMarketListingSlug("es-ES", "cardiologos")).toBe(true);
		expect(isMarketListingSlug("es-ES", "centro")).toBe(false);
		expect(isMarketListingSlug("es-ES", "chirurgien-dentiste")).toBe(false);
		expect(isMarketListingSlug("es", "dentistas")).toBe(false);
		expect(isMarketListingSlug("fr", "dentistas")).toBe(false);
		expect(showsBillingFacts("es-ES")).toBe(false);
		expect(marketBooks("es-ES")).toBe(false);
		expect(professionSlugOf("ES_PHARMACY")).toBe("farmacias");
		expect(professionSlugOf("ES_LOCAL_CLINIC")).toBe("centros-de-salud");
	});

	it("check province slugs and label places by name, with no city as its province", () => {
		expect(isDepartmentSlug("madrid", "ES")).toBe(true);
		expect(isDepartmentSlug("valencia-valencia", "ES")).toBe(true);
		expect(isDepartmentSlug("28", "ES")).toBe(false);
		expect(
			placeLabel({ kind: "department", code: "28", name: "Madrid", departmentCode: "28" }, "ES"),
		).toBe("Madrid");
		expect(
			placeLabel({ kind: "commune", code: "28079", name: "Madrid", departmentCode: "28" }, "ES"),
		).toBe("Madrid");
		expect(isDepartmentCity("ES", "28079")).toBe(false);
	});

	it("write Spanish addresses street, then postcode and town, and Spanish numbers", () => {
		const site = {
			addressLine: "Calle Alcala, 10",
			addressComplement: null,
			postcode: "28014",
			placeName: "Madrid",
		};
		expect(addressLines(site, "ES")).toEqual(["Calle Alcala, 10", "28014 Madrid"]);
		expect(localityOf("Madrid", "ES")).toBe("Madrid");
		expect(formatPhone("+34910000001")).toBe("910 000 001");
	});

	it("credit REGCESS with the date of its data, and the IGN with its CC BY 4.0 attribution", () => {
		const sources = openDataSourcesOf("ES", [{ source: "es-regcess", site: null }], "2026-12-01");
		expect(sources.map((source) => source.attribution)).toEqual([
			"Fuente: Ministerio de Sanidad, REGCESS, actualizado 1 de diciembre de 2026",
			"Obra derivada de Líneas Límite Municipales e IGR Poblaciones 2025 CC-BY 4.0 ign.es",
		]);
		expect(openDataSourcesOf("ES", [{ source: "es-regcess", site: null }])[0]?.attribution).toBe(
			"Fuente: Ministerio de Sanidad, REGCESS",
		);
		expect(openDataSourcesOf("ES", [])).toEqual([]);
	});

	it("write German addresses street, then postcode and town, and German numbers", () => {
		const site = {
			addressLine: "Musterstraße 1",
			addressComplement: null,
			postcode: "10117",
			placeName: "Berlin",
		};
		expect(addressLines(site, "DE")).toEqual(["Musterstraße 1", "10117 Berlin"]);
		expect(formatPhone("+493099990000")).toBe("030 99990000");
		expect(formatPhone("+494618120")).toBe("0461 8120");
	});

	it("credit each German source a page is built from, and the municipalities that place it", () => {
		const hospital = openDataSourcesOf("DE", [{ source: "de-destatis-khv", site: null }]);
		expect(hospital.map((source) => source.attribution)).toEqual([
			"© Statistisches Bundesamt (Destatis), 2026",
			"© Statistisches Bundesamt (Destatis), 2026",
		]);
		// A rehabilitation clinic comes from the same directory as the hospitals.
		expect(openDataSourcesOf("DE", [{ source: "de-destatis-rhv", site: null }])).toEqual(hospital);
		const thuringia = openDataSourcesOf("DE", [{ source: "de-apo-th", site: null }]);
		expect(thuringia.map((source) => source.attribution)).toEqual([
			"© Statistisches Bundesamt (Destatis), 2026",
			"© GDI-Th",
		]);
		const brandenburg = openDataSourcesOf("DE", [{ source: "de-apo-bb", site: null }]);
		expect(brandenburg.at(-1)?.attribution).toMatch(/dl-de\/by-2-0 \(Daten geändert\)$/);
		expect(openDataSourcesOf("DE", [])).toEqual([]);
	});

	it("write Estonian addresses street, then postcode and place, and Estonian numbers", () => {
		const site = {
			addressLine: "Ülase tn 16",
			addressComplement: null,
			postcode: "50412",
			placeName: "Tartu linn",
		};
		expect(addressLines(site, "EE")).toEqual(["Ülase tn 16", "50412 Tartu linn"]);
		expect(formatPhone("+3726109490")).toBe("610 9490");
		expect(formatPhone("+37251234567")).toBe("5123 4567");
	});

	it("credit the Estonian register a page is built from, and the Land Board's places and addresses", () => {
		const provider = openDataSourcesOf("EE", [{ source: "ee-medre", site: null }]);
		expect(provider.map((source) => source.attribution)).toEqual([
			"Terviseamet, tervishoiuteenuse osutajate ning tegevuslubade andmestik (MEDRE), CC BY-NC-SA 3.0; Apercura on andmeid muutnud",
			"Aadressiandmed: Maa- ja Ruumiamet",
			expect.stringMatching(/^Haldus- ja asustusjaotus: Maa- ja Ruumiamet \d{2}\.\d{2}\.\d{4}$/),
		]);
		const pharmacy = openDataSourcesOf("EE", [{ source: "ee-ravimiamet", site: null }]);
		expect(pharmacy[0]?.attribution).toBe("Ravimiamet, tegevuslubade register");
		expect(pharmacy.some((source) => source.attribution.startsWith("Terviseamet"))).toBe(false);
		expect(openDataSourcesOf("EE", [])).toEqual([]);
		expect(professionSlugOf("EE_PHARMACY")).toBe("apteegid");
		expect(isMarketListingSlug("et-EE", "perearstikeskused")).toBe(true);
		expect(isMarketListingSlug("et-EE", "krankenhaeuser")).toBe(false);
		expect(marketBooks("et-EE")).toBe(false);
	});
});

describe("Italy's pages", () => {
	it("serve Italy's listings, without booking or French insurance facts", () => {
		expect(isMarketListingSlug("it-IT", "farmacie")).toBe(true);
		expect(isMarketListingSlug("it-IT", "case-di-cura")).toBe(true);
		expect(isMarketListingSlug("it-IT", "struttura")).toBe(false);
		expect(isMarketListingSlug("it-IT", "pharmacies")).toBe(false);
		expect(isMarketListingSlug("it", "farmacie")).toBe(false);
		expect(isMarketListingSlug("fr", "farmacie")).toBe(false);
		expect(showsBillingFacts("it-IT")).toBe(false);
		expect(marketBooks("it-IT")).toBe(false);
		expect(professionSlugOf("IT_PHARMACY")).toBe("farmacie");
		expect(professionSlugOf("IT_CLINIC")).toBe("case-di-cura");
	});

	it("check province and region slugs and label places by name, with no city as its province", () => {
		expect(isDepartmentSlug("roma", "IT")).toBe(true);
		expect(isDepartmentSlug("lazio", "IT")).toBe(true);
		expect(isDepartmentSlug("258", "IT")).toBe(false);
		expect(
			placeLabel({ kind: "department", code: "258", name: "Roma", departmentCode: "258" }, "IT"),
		).toBe("Roma");
		expect(
			placeLabel({ kind: "commune", code: "058091", name: "Roma", departmentCode: "258" }, "IT"),
		).toBe("Roma");
		expect(isDepartmentCity("IT", "058091")).toBe(false);
	});

	it("write Italian addresses street, then CAP and comune, and Italian numbers", () => {
		const site = {
			addressLine: "Via del Corso, 10",
			addressComplement: null,
			postcode: "00186",
			placeName: "Roma",
		};
		expect(addressLines(site, "IT")).toEqual(["Via del Corso, 10", "00186 Roma"]);
		expect(localityOf("Roma", "IT")).toBe("Roma");
		expect(formatPhone("+390612345678")).toBe("06 12345678");
		expect(formatPhone("+393331234567")).toBe("333 123 4567");
	});

	it("credit the ministry's list with the date of its data, and ISTAT with its CC BY 4.0 line", () => {
		const sources = openDataSourcesOf("IT", [{ source: "it-farmacie", site: null }], "2026-11-26");
		expect(sources.map((source) => source.attribution)).toEqual([
			"Fonte: Ministero della Salute, Farmacie, IODL 2.0, aggiornato al 26 novembre 2026",
			"Fonte: Istat, Confini delle unità amministrative a fini statistici al 1° gennaio 2026, CC BY 4.0 (centroidi dei comuni calcolati da Apercura)",
		]);
		expect(
			openDataSourcesOf("IT", [{ source: "it-posti-letto", site: null }])[0]?.attribution,
		).toBe("Fonte: Ministero della Salute, Posti letto per struttura ospedaliera, IODL 2.0");
		expect(openDataSourcesOf("IT", [])).toEqual([]);
		expect(italianAttribution("it-istat", "2026-11-26")).not.toContain("aggiornato");
		const status = { importedAt: "2026-11-26", files: { "posti-letto": "2025-07-29" } };
		expect(italianSourceDate("it-posti-letto", status)).toBe("2025-07-29");
		expect(italianSourceDate("it-farmacie", status)).toBe("2026-11-26");
		expect(italianSourceDate("it-farmacie", null)).toBeNull();
	});
});

describe("Switzerland's pages", () => {
	it("serve Switzerland's listings in its three languages, without booking or French facts", () => {
		for (const locale of ["de-CH", "fr-CH", "it-CH"] as const) {
			expect(isMarketListingSlug(locale, "spital")).toBe(true);
			expect(isMarketListingSlug(locale, "pflegeheim")).toBe(true);
			expect(isMarketListingSlug(locale, "apotheke")).toBe(true);
			expect(isMarketListingSlug(locale, "einrichtung")).toBe(false);
			expect(isMarketListingSlug(locale, "farmacie")).toBe(false);
			expect(showsBillingFacts(locale)).toBe(false);
			expect(marketBooks(locale)).toBe(false);
		}
		expect(isMarketListingSlug("de-AT", "spital")).toBe(false);
		expect(isMarketListingSlug("fr", "apotheke")).toBe(false);
		expect(professionSlugOf("CH_HOSPITAL")).toBe("spital");
		expect(professionSlugOf("CH_NURSING_HOME")).toBe("pflegeheim");
	});

	it("check canton and district slugs and label places by name", () => {
		expect(isDepartmentSlug("zuerich", "CH")).toBe(true);
		expect(isDepartmentSlug("bezirk-zuerich", "CH")).toBe(true);
		expect(isDepartmentSlug("112", "CH")).toBe(false);
		expect(
			placeLabel(
				{ kind: "department", code: "112", name: "Bezirk Zürich", departmentCode: "112" },
				"CH",
			),
		).toBe("Bezirk Zürich");
		expect(
			placeLabel({ kind: "commune", code: "261", name: "Zürich", departmentCode: "112" }, "CH"),
		).toBe("Zürich");
	});

	it("write Swiss addresses street, then postcode and locality, and Swiss numbers", () => {
		const site = {
			addressLine: "Rämistrasse 100",
			addressComplement: null,
			postcode: "8091",
			placeName: "Zürich",
		};
		expect(addressLines(site, "CH")).toEqual(["Rämistrasse 100", "8091 Zürich"]);
		expect(formatPhone("+41442683111")).toBe("044 268 31 11");
	});

	it("credit each list in the page's language, the places of the BFS and swisstopo on every page", () => {
		const bag = [{ source: "ch-bag-kzp", site: null }];
		expect(
			openDataSourcesOf("CH", bag, "2026-11-27", { language: "de" }).map((s) => s.attribution),
		).toEqual([
			"Quelle: © Bundesamt für Gesundheit (BAG), Kennzahlen der Schweizer Spitäler 2023",
			"Quelle: BFS – Amtliches Gemeindeverzeichnis der Schweiz",
			"© swisstopo, Amtliches Ortschaftenverzeichnis mit Postleitzahl und Perimeter",
		]);
		expect(
			openDataSourcesOf("CH", bag, "2026-11-27", { language: "fr" }).map((s) => s.attribution),
		).toEqual([
			"Source : © Office fédéral de la santé publique (OFSP), Chiffres-clés des hôpitaux suisses 2023",
			"Source : OFS – Répertoire officiel des communes de Suisse",
			"© swisstopo, Répertoire officiel des localités avec code postal et périmètre",
		]);
		// A list worded in one language only prints that wording on every page.
		expect(
			openDataSourcesOf("CH", [{ source: "ch-zh-heime", site: null }], null, { language: "it" })[0]
				?.attribution,
		).toBe("Quelle: Kanton Zürich, Gesundheitsdirektion, Alters- und Pflegeheime Kanton Zürich");
		// A FOPH site completed from Bern's list credits both.
		expect(
			openDataSourcesOf("CH", bag, null, { language: "fr", sources: ["ch-be-spitaeler"] }).map(
				(s) => s.attribution,
			)[1],
		).toBe("Hôpitaux et cliniques © Office de la santé du canton de Berne");
		expect(openDataSourcesOf("CH", [], null, { language: "de" })).toEqual([]);
	});

	it("date Geneva's SITG line with the day of the Swiss import, in French", () => {
		expect(swissAttribution("ch-ge-ems", "de", "2026-11-27")).toBe(
			"Source : Portail des données SITG (État de Genève), téléchargé en date du 27 novembre 2026 ; données compilées par Apercura",
		);
		expect(swissAttribution("ch-ge-pharmacies", "it", null)).toBe(
			"Source : Portail des données SITG (État de Genève) ; données compilées par Apercura",
		);
		expect(swissAttribution("ch-ge-hopitaux", "fr", "2026-01-05")).not.toContain("{date}");
	});

	it("read a hospital's type, activities, services, offer, ownership, operator and category", () => {
		const q = (source: string, code: string, label: string | null = null) => ({
			source,
			typeCode: "",
			code,
			label,
		});
		const qualifications = [
			q("typ", "K112", "Allgemeinspital, Zentrumsversorgung"),
			q("akt", "P"),
			q("akt", "A"),
			q("leistung", "IPS"),
			q("leistung", "NF"),
			q("angebot", "STAT"),
			q("angebot", "AMB"),
			q("rechtsform", "R4"),
			q("betrieb", "", "Spital Beispiel AG"),
			q("kategorie", "fr", "Clinique"),
			q("quelle", "ch-be-spitaeler"),
			q("quelle", "ch-be-spitaeler"),
		];
		expect(swissFacilityFacts(qualifications, "fr")).toEqual({
			hospitalType: "Hôpital de soins généraux, prise en charge centralisée",
			activities: ["A", "P"],
			services: ["NF", "IPS"],
			offers: ["AMB", "STAT"],
			ownership: "public",
			operator: "Spital Beispiel AG",
			categories: [{ language: "fr", label: "Clinique" }],
			sources: ["ch-be-spitaeler"],
		});
		expect(swissFacilityFacts(qualifications, "it").hospitalType).toBe(
			"Ospedale per cure generali, presa a carico centralizzata",
		);
		expect(swissFacilityFacts([q("rechtsform", "R2")], "de")).toMatchObject({
			ownership: "private",
			hospitalType: null,
			operator: null,
			activities: [],
		});
		expect(swissFacilityFacts([q("rechtsform", "R9")], "de").ownership).toBeNull();
	});
});
