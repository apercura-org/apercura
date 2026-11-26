import { describe, expect, it } from "vitest";
import { allAtListingSlugs } from "./at";
import { equivalentListing } from "./care-kinds";
import { allCzListingSlugs } from "./cz";
import { allListingSlugs } from "./fr";
import { allGbListingSlugs } from "./gb";
import {
	allItListingSlugs,
	IT_CARE_AREAS,
	IT_CLINIC,
	IT_DEFAULT_PROFESSIONS,
	IT_HOSPITAL,
	IT_PHARMACY,
	IT_PHARMACY_TYPES,
	IT_RESERVED_SEGMENTS,
	isItListingSlug,
	itFacilityKindOf,
	itListingSlugFor,
	itProfessionOfListingSlug,
} from "./it";

describe("the Italian taxonomy", () => {
	it("lists pharmacies, parapharmacies, hospitals and accredited clinics, each on its own", () => {
		expect(IT_DEFAULT_PROFESSIONS.map((code) => itListingSlugFor(code, null))).toEqual([
			"farmacie",
			"parafarmacie",
			"ospedali",
			"case-di-cura",
		]);
		expect(itListingSlugFor(IT_PHARMACY, "ACUTI")).toBe("farmacie");
		expect(itListingSlugFor("XX", null)).toBeNull();
	});

	it("tells an accredited private clinic from a hospital by the facility type", () => {
		expect(itFacilityKindOf("5.1", "Casa di cura privata accreditata")).toBe(IT_CLINIC);
		expect(itFacilityKindOf("", "CASA DI CURA PRIVATA ACCREDITATA")).toBe(IT_CLINIC);
		for (const [code, label] of [
			["0", "Azienda Ospedaliera"],
			["1", "Ospedale a gestione diretta"],
			["2.1", "Azienda Ospedaliera universitaria integrata con il Servizio Sanitario Nazionale"],
			["3.2", "IRCCS privato"],
			["4", "Ospedale classificato o assimilato"],
			["8", "Istituto qualificato presidio della U.S.L."],
			["9", "Ente di ricerca"],
		]) {
			expect(itFacilityKindOf(code ?? "", label ?? "")).toBe(IT_HOSPITAL);
		}
		expect(itFacilityKindOf(" ", "")).toBeNull();
	});

	it("names the pharmacy types and the areas of inpatient care", () => {
		expect(Object.keys(IT_PHARMACY_TYPES)).toEqual(["1", "2", "3", "4"]);
		expect(Object.keys(IT_CARE_AREAS)).toEqual(["ACUTI", "RIABILITAZIONE", "LUNGODEGENZA"]);
	});

	it("never shares a listing slug with France, Austria, the United Kingdom or Czechia", () => {
		const others = new Set([
			...allListingSlugs(),
			...allAtListingSlugs(),
			...allGbListingSlugs(),
			...allCzListingSlugs(),
		]);
		expect([...allItListingSlugs()].filter((slug) => others.has(slug))).toEqual([]);
		for (const slug of allItListingSlugs()) {
			expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
			expect(isItListingSlug(slug)).toBe(true);
		}
		for (const segment of IT_RESERVED_SEGMENTS) expect(isItListingSlug(segment)).toBe(false);
		expect(isItListingSlug("pharmacies")).toBe(false);
		expect(itProfessionOfListingSlug("case-di-cura")).toBe(IT_CLINIC);
		expect(itProfessionOfListingSlug("farmacia")).toBeUndefined();
	});

	it("carries a pharmacy search over from the other markets", () => {
		expect(equivalentListing("pharmacien", "FR", "IT")).toBe("farmacie");
		expect(equivalentListing("pharmacies", "GB", "IT")).toBe("farmacie");
		expect(equivalentListing("lekarna", "CZ", "IT")).toBe("farmacie");
		expect(equivalentListing("farmacie", "IT", "GB")).toBe("pharmacies");
		expect(equivalentListing("chirurgien-dentiste", "FR", "IT")).toBeNull();
	});
});
