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
} from "./market";
import {
	CITY_IS_DEPARTMENT,
	isDepartmentCity,
	isDepartmentSlug,
	NOT_DEPARTMENT_CITY,
	placeLabel,
} from "./places";
import { addressLines, formatPhone, localityOf } from "./practitioner-view";

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

	it("treats Paris, Wien, Praha and Germany's kreisfreie Städte as their department's page", () => {
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
			"NOT (p.country = 'FR' AND p.code = '75056') AND NOT (p.country = 'AT' AND p.code = '90001') AND NOT (p.country = 'CZ' AND p.code = '554782') AND NOT (p.country = 'DE' AND p.code LIKE '_____000')",
		);
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
