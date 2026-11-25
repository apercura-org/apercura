import { describe, expect, it } from "vitest";
import {
	austrianSourcesOf,
	isMarketListingSlug,
	listingFees,
	marketBooks,
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
