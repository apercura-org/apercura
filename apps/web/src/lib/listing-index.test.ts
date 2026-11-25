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
		const nurses = suggestListings("infirmi", "fr").map((entry) => entry.slug);
		expect(nurses[0]).toBe("infirmier");
		expect(nurses).toContain("infirmier-puericulteur");
		// The retired psychiatric nurse code is not imported: never suggested.
		expect(nurses).not.toContain("infirmier-psychiatrique");
		expect(suggestListings("nurse", "en").map((entry) => entry.slug)).toContain("infirmier");
		// Physiotherapists are mapped but not imported.
		expect(suggestListings("kine", "fr")).toEqual([]);
		expect(suggestListings("", "fr")).toEqual([]);
	});

	it("resolves an exact label in either language, singular or plural", () => {
		expect(resolveListing("Cardiologues")).toBe("cardiologue");
		expect(resolveListing("médecin généraliste")).toBe("medecin-generaliste");
		expect(resolveListing("General practitioner")).toBe("medecin-generaliste");
		expect(resolveListing("Chirurgienne-dentiste")).toBe("chirurgien-dentiste");
		expect(resolveListing("sages-femmes")).toBe("sage-femme");
		expect(resolveListing("Infirmières")).toBe("infirmier");
		expect(resolveListing("infirmière puéricultrice")).toBe("infirmier-puericulteur");
		expect(resolveListing("cardio")).toBeNull();
		expect(resolveListing("Dupont")).toBeNull();
	});

	it("suggests and resolves each market's own listings only", () => {
		expect(suggestListings("Kardio", "de-AT").map((entry) => entry.slug)).toEqual(["kardiologie"]);
		expect(suggestListings("Zahn", "de-AT").map((entry) => entry.slug)).toContain("zahnaerzte");
		expect(suggestListings("Kardio", "de").map((entry) => entry.slug)).not.toContain("kardiologie");
		expect(resolveListing("Allgemeinmedizin", "AT")).toBe("allgemeinmedizin");
		expect(resolveListing("Kardiologie", "AT")).toBe("kardiologie");
		expect(resolveListing("Allgemeinmedizin", "FR")).not.toBe("allgemeinmedizin");
		expect(resolveListing("cardiologue", "AT")).toBeNull();
	});

	it("suggests and resolves the UK's practice listings in the UK only", () => {
		expect(suggestListings("GP", "en-GB").map((entry) => entry.slug)).toEqual(["gp-practices"]);
		expect(suggestListings("Pharm", "en-GB").map((entry) => entry.slug)).toEqual(["pharmacies"]);
		expect(suggestListings("Cardio", "en-GB")).toEqual([]);
		expect(suggestListings("GP practice", "en").map((entry) => entry.slug)).not.toContain(
			"gp-practices",
		);
		expect(resolveListing("dental practices", "GB")).toBe("dental-practices");
		expect(resolveListing("Pharmacies", "GB")).toBe("pharmacies");
		expect(resolveListing("GP practices", "FR")).toBeNull();
	});
});
