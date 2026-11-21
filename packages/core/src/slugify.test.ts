import { describe, expect, it } from "vitest";
import { slugify } from "./slugify";

describe("slugify", () => {
	it.each([
		["Marie Dubois", "marie-dubois"],
		["Hélène Lefèvre", "helene-lefevre"],
		["François Çélik", "francois-celik"],
		["Île-de-France", "ile-de-france"],
		["Noël Ëloïse Aÿ", "noel-eloise-ay"],
		["Œdipe Lætitia", "oedipe-laetitia"],
		["cœur", "coeur"],
		["Saint-Étienne", "saint-etienne"],
		["L'Haÿ-les-Roses", "l-hay-les-roses"],
		["Côte d’Armor", "cote-d-armor"],
		["Médecin   généraliste", "medecin-generaliste"],
		["--Dr. Jean--Paul  ", "dr-jean-paul"],
		["Chirurgien-dentiste (ODF)", "chirurgien-dentiste-odf"],
		["75015 Paris", "75015-paris"],
	])("slugifies %j to %j", (input, expected) => {
		expect(slugify(input)).toBe(expected);
	});

	it("returns an empty string when nothing survives", () => {
		expect(slugify(" '’ - ")).toBe("");
	});

	it("is idempotent", () => {
		const once = slugify("Pédiatre à Aix-en-Provence");
		expect(slugify(once)).toBe(once);
	});
});
