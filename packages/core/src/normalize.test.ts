import { describe, expect, it } from "vitest";
import {
	addressKey,
	formatPersonName,
	formatPhoneFr,
	formatStreetLine,
	formatStreetText,
	nameMatchKey,
	toE164Fr,
} from "./normalize";

describe("formatPersonName", () => {
	it.each([
		["DUPONT", "Dupont"],
		["JEAN-PIERRE", "Jean-Pierre"],
		["MARIE ODILE", "Marie Odile"],
		["N'DIAYE", "N'Diaye"],
		["O'NEILL", "O'Neill"],
		["  ÉLODIE   ", "Élodie"],
		["Yrlande", "Yrlande"],
		["McDONALD", "McDONALD"],
		["", ""],
	])("formats the first name or name %j as %j", (raw, expected) => {
		expect(formatPersonName(raw)).toBe(expected);
	});

	it.each([
		["DE LA FONTAINE", "de La Fontaine"],
		["D'ALMEIDA", "d'Almeida"],
		["VAN DER BERG", "van der Berg"],
		["LE GALL", "Le Gall"],
		["DUPONT DE NEMOURS", "Dupont de Nemours"],
		["BEN SAID", "Ben Said"],
	])("formats the family name %j as %j", (raw, expected) => {
		expect(formatPersonName(raw, { familyName: true })).toBe(expected);
	});
});

describe("nameMatchKey", () => {
	it("ignores accents, case, hyphens and apostrophes", () => {
		expect(nameMatchKey("Marie-Odile")).toBe("MARIE ODILE");
		expect(nameMatchKey("MARIE ODILE")).toBe("MARIE ODILE");
		expect(nameMatchKey("d'Almeida")).toBe("D ALMEIDA");
		expect(nameMatchKey("Hélène  Lœuvre")).toBe("HELENE LOEUVRE");
	});
});

describe("toE164Fr", () => {
	it.each([
		["0472000000", "+33472000000"],
		["04 72 00 00 00", "+33472000000"],
		["04.72.00.00.00", "+33472000000"],
		["+33472000000", "+33472000000"],
		["0033472000000", "+33472000000"],
		["0186655515", "+33186655515"],
		["0590123456", "+590590123456"],
		["0692123456", "+262692123456"],
		["0269612345", "+262269612345"],
		["0596123456", "+596596123456"],
		["0594123456", "+594594123456"],
	])("converts %j to %j", (raw, expected) => {
		expect(toE164Fr(raw)).toBe(expected);
	});

	it.each([null, "", "12345", "0012345678", "047200000", "abcdefghij"])("rejects %j", (raw) => {
		expect(toE164Fr(raw)).toBeNull();
	});
});

describe("addresses", () => {
	it("title-cases uppercase street labels", () => {
		expect(formatStreetText("DE SEBASTOPOL")).toBe("De Sebastopol");
		expect(formatStreetText("DE SEBASTOPOL", { capitalizeFirst: false })).toBe("de Sebastopol");
		expect(formatStreetText("RUE DU FAUBOURG SAINT-ANTOINE")).toBe("Rue du Faubourg Saint-Antoine");
		expect(formatStreetText("Rue déjà formatée")).toBe("Rue déjà formatée");
	});

	it("builds the street line from registry columns", () => {
		expect(
			formatStreetLine({ number: "139", typeLabel: "Boulevard", street: "DE SEBASTOPOL" }),
		).toBe("139 Boulevard de Sebastopol");
		expect(formatStreetLine({ number: "24", repetition: "B", street: "RUE DAUPHINE" })).toBe(
			"24 bis Rue Dauphine",
		);
		expect(formatStreetLine({ typeLabel: "Place", street: "D'ITALIE" })).toBe("Place d'Italie");
		expect(formatStreetLine({})).toBe("");
	});

	it("builds stable cache keys", () => {
		expect(addressKey("24 bis Rue Dauphine", "75006", "75106")).toBe(
			"24 BIS RUE DAUPHINE|75006|75106",
		);
		expect(addressKey("Rue de l'Église", null, null)).toBe("RUE DE L EGLISE||");
	});
});

describe("formatPhoneFr", () => {
	it.each([
		["+33155347620", "01 55 34 76 20"],
		["+33612345678", "06 12 34 56 78"],
		["+262262123456", "02 62 12 34 56"],
		["+590590123456", "05 90 12 34 56"],
		["+4122123456", "+4122123456"],
	])("%s -> %s", (e164, expected) => {
		expect(formatPhoneFr(e164)).toBe(expected);
	});
});
