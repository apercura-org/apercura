import { describe, expect, it } from "vitest";
import { labelForms, normalizeText, resolveListing, suggestListings } from "./listing-index";

describe("listing index", () => {
	it("normalizes like directory.text_norm()", () => {
		expect(normalizeText("  Médecin-Généraliste ")).toBe("medecin generaliste");
		expect(normalizeText("Sœur")).toBe("soeur");
	});

	it("reads every form of a gendered label, other first", () => {
		expect(
			labelForms("{gender, select, female {Chirurgienne-dentiste} other {Chirurgien-dentiste}}"),
		).toEqual(["Chirurgien-dentiste", "Chirurgienne-dentiste"]);
		expect(labelForms("Cardiologue")).toEqual(["Cardiologue"]);
	});

	it("suggests listings by word prefix, in v1 professions only", () => {
		expect(suggestListings("cardio", "fr").map((entry) => entry.slug)).toContain("cardiologue");
		expect(suggestListings("dentiste", "fr").map((entry) => entry.slug)).toContain(
			"chirurgien-dentiste",
		);
		expect(suggestListings("general pract", "en").map((entry) => entry.slug)).toContain(
			"medecin-generaliste",
		);
		expect(suggestListings("infirmier", "fr")).toEqual([]);
		expect(suggestListings("", "fr")).toEqual([]);
	});

	it("resolves an exact label in either language, singular or plural", () => {
		expect(resolveListing("Cardiologues")).toBe("cardiologue");
		expect(resolveListing("médecin généraliste")).toBe("medecin-generaliste");
		expect(resolveListing("General practitioner")).toBe("medecin-generaliste");
		expect(resolveListing("Chirurgienne-dentiste")).toBe("chirurgien-dentiste");
		expect(resolveListing("sages-femmes")).toBe("sage-femme");
		expect(resolveListing("cardio")).toBeNull();
		expect(resolveListing("Dupont")).toBeNull();
	});
});
