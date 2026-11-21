import { describe, expect, it } from "vitest";
import {
	communeSlug,
	departmentSlug,
	establishmentSlug,
	parseEstablishmentSegment,
	parsePractitionerSegment,
	practitionerSlug,
	regionSlug,
} from "./slugs";

// Synthetic, Luhn-valid numbers: they do not identify anyone.
const RPPS = "10000000009";

describe("practitioner slugs", () => {
	it("builds {prenom-nom}-{rpps}", () => {
		expect(practitionerSlug("Marie", "Dubois", RPPS)).toBe(`marie-dubois-${RPPS}`);
		expect(practitionerSlug("Jean-Pierre", "de La Fontaine", RPPS)).toBe(
			`jean-pierre-de-la-fontaine-${RPPS}`,
		);
		expect(practitionerSlug("", "", RPPS)).toBe(RPPS);
	});

	it("parses the trailing RPPS and the name part", () => {
		expect(parsePractitionerSegment(`marie-dubois-${RPPS}`)).toEqual({
			rpps: RPPS,
			namePart: "marie-dubois",
		});
		expect(parsePractitionerSegment(RPPS)).toEqual({ rpps: RPPS, namePart: "" });
		expect(parsePractitionerSegment(`wrong-name-${RPPS}`)?.rpps).toBe(RPPS);
	});

	it.each([
		"marie-dubois-10000000000",
		"marie-dubois",
		"marie-dubois-1000000000",
		"marie-dubois-100000000009",
		`${RPPS}-marie`,
		"",
	])("rejects %j before any database access", (segment) => {
		expect(parsePractitionerSegment(segment)).toBeNull();
	});
});

describe("place slugs", () => {
	it.each([
		["69", "Rhône", "69-rhone"],
		["2A", "Corse-du-Sud", "2a-corse-du-sud"],
		["974", "La Réunion", "974-la-reunion"],
		["75", "Paris", "75-paris"],
	])("department %s %s -> %s", (code, name, slug) => {
		expect(departmentSlug(code, name)).toBe(slug);
	});

	it("slugifies regions", () => {
		expect(regionSlug("Île-de-France")).toBe("ile-de-france");
	});

	it("keeps commune slugs unique within a department", () => {
		const taken = new Set(["saint-denis"]);
		expect(communeSlug("Lyon 3e Arrondissement", "69383", taken)).toBe("lyon-3e-arrondissement");
		expect(communeSlug("Saint-Denis", "97411", taken)).toBe("saint-denis-97411");
		expect(communeSlug("Ajaccio", "2A004", new Set(["ajaccio"]))).toBe("ajaccio-2a004");
	});

	it("builds establishment slugs", () => {
		expect(establishmentSlug("Hôpital Édouard Herriot", "690781810")).toBe(
			"hopital-edouard-herriot-690781810",
		);
		expect(establishmentSlug("", "690781810")).toBe("690781810");
		expect(establishmentSlug("CH de Bastia", "2B0000016")).toBe("ch-de-bastia-2b0000016");
	});

	it("parses establishment segments by their trailing FINESS number", () => {
		expect(parseEstablishmentSegment("hopital-edouard-herriot-690781810")).toEqual({
			finess: "690781810",
			namePart: "hopital-edouard-herriot",
		});
		expect(parseEstablishmentSegment("ch-de-bastia-2b0000016")).toEqual({
			finess: "2B0000016",
			namePart: "ch-de-bastia",
		});
		expect(parseEstablishmentSegment("690781810")?.namePart).toBe("");
		expect(parseEstablishmentSegment("hopital-69078181")).toBeNull();
		expect(parseEstablishmentSegment("hopital-2c0000016")).toBeNull();
		expect(parseEstablishmentSegment("Hopital-690781810")).toBeNull();
	});
});
