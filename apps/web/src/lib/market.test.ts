import { describe, expect, it } from "vitest";
import {
	austrianSourcesOf,
	isMarketListingSlug,
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
	});

	it("treats Paris and Wien as their department's page", () => {
		expect(isDepartmentCity("FR", "75056")).toBe(true);
		expect(isDepartmentCity("AT", "90001")).toBe(true);
		expect(isDepartmentCity("AT", "75056")).toBe(false);
		expect(CITY_IS_DEPARTMENT).toEqual({ FR: "75056", AT: "90001" });
		expect(NOT_DEPARTMENT_CITY("p")).toBe(
			"NOT (p.country = 'FR' AND p.code = '75056') AND NOT (p.country = 'AT' AND p.code = '90001')",
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
