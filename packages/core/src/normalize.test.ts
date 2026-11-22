import { describe, expect, it } from "vitest";
import {
	addressKey,
	buildAccentDictionary,
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

	it.each([
		["GHU APHP NUP SITE BICHAT", "GHU AP-HP NUP Site Bichat"],
		["GHU APHP SUN SITE PITIE SALPETRIERE", "GHU AP-HP SUN Site Pitie Salpetriere"],
		["GHU APHP HU PSSD SITE AVICENNE", "GHU AP-HP HU PSSD Site Avicenne"],
		["GHU CUP SITE NECKER ENFANTS MALADES", "GHU CUP Site Necker Enfants Malades"],
		["GHU APHP SITE USLD PAUL BROUSSE", "GHU AP-HP Site USLD Paul Brousse"],
		["CABINET DU DR HU", "Cabinet du Dr Hu"],
		["Cabinet du Dr SEbastien Dubois", "Cabinet du Dr Sebastien Dubois"],
		["CABINET DU DR BEn ADAM", "Cabinet du Dr Ben Adam"],
		["CABINET DU DR McDONALD", "Cabinet du Dr McDONALD"],
		["Cabinet du Dr McDonald", "Cabinet du Dr McDonald"],
		["Cabinet du Dr MacLean", "Cabinet du Dr MacLean"],
		["Cabinet LeBlanc", "Cabinet LeBlanc"],
		["Cmpp d Eaubonne", "CMPP d’Eaubonne"],
		["Irm du Gâtinais - Site du Cham", "IRM du Gâtinais - Site du Cham"],
		["CDS MEDICAL ST JACQUES", "CDS Medical St Jacques"],
		["PITIE SALPETRIERE", "Pitie Salpetriere"],
		["47 BOULEVARD DE L HOPITAL", "47 Boulevard de l’Hopital"],
		["CENTRE D IMAGERIE", "Centre d’Imagerie"],
		["L HOPITAL", "L’Hopital"],
		["EHPAD LES LILAS", "EHPAD les Lilas"],
		["GHU AP-HP CENTRE", "GHU AP-HP Centre"],
		["CABINET DU DR StEphane GHEZ", "Cabinet du Dr Stephane Ghez"],
		["SELARL DU CH DE TULLE", "SELARL du CH de Tulle"],
	])("formats %j word by word as %j", (raw, expected) => {
		expect(formatStreetText(raw)).toBe(expected);
	});

	it("is idempotent on labels formatted by earlier imports", () => {
		expect(formatStreetText("Ghu Aphp Sun Site Pitie Salpetriere")).toBe(
			"GHU AP-HP SUN Site Pitie Salpetriere",
		);
		expect(formatStreetText("47 Boulevard de l Hopital")).toBe("47 Boulevard de l’Hopital");
		for (const raw of [
			"GHU APHP NUP",
			"DE L HOPITAL",
			"Cds Medical St Jacques",
			"Cabinet du Dr SEbastien Dubois",
			"Cabinet du Dr HElEne Aelion",
			"CABINET DU DR GwenaElle LEROY",
		]) {
			const once = formatStreetText(raw);
			expect(formatStreetText(once)).toBe(once);
		}
	});

	it.each([
		["Cabinet du Dr HElEne Aelion", "Cabinet du Dr Helene Aelion"],
		["CABINET DU DR BenoIt MARTIN", "Cabinet du Dr Benoit Martin"],
		["CABINET DU DR ChloE ADAM", "Cabinet du Dr Chloe Adam"],
		["CABINET DU DR FrEdEric PETIT", "Cabinet du Dr Frederic Petit"],
		["CABINET DU DR AnaIs ROUX", "Cabinet du Dr Anais Roux"],
		["CABINET DU DR GwenaElle LEROY", "Cabinet du Dr Gwenaelle Leroy"],
		["CABINET DU DR Marie-HElEne FAURE", "Cabinet du Dr Marie-Helene Faure"],
		["CABINET DU DR LEa GIRARD", "Cabinet du Dr Lea Girard"],
		["CABINET DU DR GUl KAYA", "Cabinet du Dr Gul Kaya"],
		["Cabinet LeBlanc", "Cabinet LeBlanc"],
		["Cabinet du Dr McDonald", "Cabinet du Dr McDonald"],
		["Cabinet du Dr DeAngelis", "Cabinet du Dr DeAngelis"],
		["CENTRE CMPP", "Centre CMPP"],
	])("lowercases the stray capitals of accented letters in %j", (raw, expected) => {
		expect(formatStreetText(raw)).toBe(expected);
	});

	describe("with an accent dictionary", () => {
		const accents = buildAccentDictionary([
			"Hélène",
			"Benoît",
			"Chloé",
			"Frédéric",
			"Anaïs",
			"Marie-Gwenaëlle",
			"Laëtitia",
			"Gül",
			"Léa",
			["Raphaël", 3],
			["Raphaél", 1],
			"Saint-Rémy-lès-Chevreuse",
			"Lé",
			"HÉLOÏSE",
			"Élodie",
			"Deangelis",
		]);

		it("keys accented words by their registry spelling", () => {
			expect(accents.get("HElEne")).toBe("Hélène");
			expect(accents.get("GwenaElle")).toBe("Gwenaëlle");
			expect(accents.get("REmy")).toBe("Rémy");
			// The most frequent form wins.
			expect(accents.get("RaphaEl")).toBe("Raphaël");
			// No key that a word in capitals, or with only a leading accent, would match.
			expect(accents.has("LE")).toBe(false);
			expect(accents.has("HElOIse")).toBe(false);
			expect(accents.has("Elodie")).toBe(false);
			expect(accents.has("Deangelis")).toBe(false);
			expect(accents.has("lEs")).toBe(false);
		});

		it.each([
			["Cabinet du Dr HElEne Aelion", "Cabinet du Dr Hélène Aelion"],
			["CABINET DU DR BenoIt MARTIN", "Cabinet du Dr Benoît Martin"],
			["CABINET DU DR ChloE ADAM", "Cabinet du Dr Chloé Adam"],
			["CABINET DU DR FrEdEric PETIT", "Cabinet du Dr Frédéric Petit"],
			["CABINET DU DR AnaIs ROUX", "Cabinet du Dr Anaïs Roux"],
			["CABINET DU DR GwenaElle LEROY", "Cabinet du Dr Gwenaëlle Leroy"],
			["CABINET DU DR Marie-HElEne FAURE", "Cabinet du Dr Marie-Hélène Faure"],
			["CABINET DU DR LaEtitia MOREL", "Cabinet du Dr Laëtitia Morel"],
			["CABINET DU DR LEa GIRARD", "Cabinet du Dr Léa Girard"],
			["CABINET DU DR GUl KAYA", "Cabinet du Dr Gül Kaya"],
			["MAISON DE SANTE DE SAINT REmy", "Maison de Sante de Saint Rémy"],
			// Not in the dictionary: the stray capitals are lowercased.
			["CABINET DU DR JErOme BLANC", "Cabinet du Dr Jerome Blanc"],
			// Words in capitals and deliberate camel case are untouched.
			["CABINET LE HELENE", "Cabinet le Helene"],
			["Cabinet du Dr DeAngelis", "Cabinet du Dr DeAngelis"],
			["Cabinet LeBlanc", "Cabinet LeBlanc"],
		])("restores %j as %j", (raw, expected) => {
			expect(formatStreetText(raw, { accents })).toBe(expected);
		});

		it("stores a form that reads the same when displayed", () => {
			for (const raw of [
				"Cabinet du Dr HElEne Aelion",
				"CABINET DU DR FrEdEric PETIT",
				"CABINET DU DR JErOme BLANC",
				"Cabinet du Dr DeAngelis",
			]) {
				const stored = formatStreetText(raw, { accents });
				expect(formatStreetText(stored, { accents })).toBe(stored);
				expect(formatStreetText(stored)).toBe(stored);
			}
		});
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
