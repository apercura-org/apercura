import { describe, expect, it } from "vitest";
import {
	labelForms,
	listingLabel,
	normalizeText,
	resolveListing,
	resolveSearchTerm,
	suggestListings,
	translateSearchTerm,
} from "./listing-index";

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
		expect(resolveListing("cardiolo")).toBeNull();
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

	it("suggests and resolves Czechia's listings in Czechia only, by plural or singular", () => {
		expect(suggestListings("Kardio", "cs-CZ").map((entry) => entry.slug)).toEqual(["kardiolog"]);
		expect(suggestListings("lékárn", "cs-CZ").map((entry) => entry.slug)).toEqual(["lekarna"]);
		expect(resolveListing("Praktický lékař", "CZ")).toBe("prakticky-lekar");
		expect(resolveListing("Praktičtí lékaři", "CZ")).toBe("prakticky-lekar");
		expect(resolveListing("zubni lekar", "CZ")).toBe("zubni-lekar");
		expect(resolveListing("Kardiologové", "FR")).toBeNull();
		expect(suggestListings("Kardio", "fr").map((entry) => entry.slug)).not.toContain("kardiolog");
	});

	it("suggests and resolves Spain's listings in Spain only, by plural or singular", () => {
		expect(suggestListings("Cardiol", "es-ES").map((entry) => entry.slug)).toEqual(["cardiologos"]);
		expect(suggestListings("farmac", "es-ES").map((entry) => entry.slug)).toEqual(["farmacias"]);
		expect(resolveListing("Dentistas", "ES")).toBe("dentistas");
		expect(resolveListing("Clínica dental", "ES")).toBe("dentistas");
		expect(resolveListing("farmacia", "ES")).toBe("farmacias");
		expect(resolveListing("Cardiólogos", "ES")).toBe("cardiologos");
		expect(resolveListing("Farmacias", "FR")).toBeNull();
		expect(suggestListings("Cardiol", "es").map((entry) => entry.slug)).not.toContain(
			"cardiologos",
		);
	});

	it("carries a term over to another market by kind of care", () => {
		const listing = (slug: string) => ({ kind: "listing", slug });
		// The page's own words first: "dentiste" typed on /fr, for Bristol, Wien, Brno.
		expect(translateSearchTerm("dentiste", "FR", "GB")).toEqual(listing("dental-practices"));
		expect(translateSearchTerm("un dentiste", "FR", "AT")).toEqual(listing("zahnaerzte"));
		expect(translateSearchTerm("Dentistes", "FR", "CZ")).toEqual(listing("zubni-lekar"));
		expect(translateSearchTerm("médecin généraliste", "FR", "GB")).toEqual(listing("gp-practices"));
		expect(translateSearchTerm("dentist", "GB", "FR")).toEqual(listing("chirurgien-dentiste"));
		expect(translateSearchTerm("GP", "GB", "AT")).toEqual(listing("allgemeinmedizin"));
		expect(translateSearchTerm("Hausarzt", "AT", "CZ")).toEqual(listing("prakticky-lekar"));
		// A profession France maps but does not list yet still names its kind of care.
		expect(translateSearchTerm("pharmacie", "FR", "GB")).toEqual(listing("pharmacies"));
		// Then the words of the market searched: "zubař" typed on a French page, for Brno.
		expect(translateSearchTerm("zubař", "FR", "CZ")).toEqual(listing("zubni-lekar"));
		// Spain: "dentiste" typed on /fr, "zubař" on /cz, "Zahnarzt" on /at, for Madrid.
		expect(translateSearchTerm("dentiste", "FR", "ES")).toEqual(listing("dentistas"));
		expect(translateSearchTerm("zubař", "CZ", "ES")).toEqual(listing("dentistas"));
		expect(translateSearchTerm("Zahnarzt", "AT", "ES")).toEqual(listing("dentistas"));
		expect(translateSearchTerm("GP", "GB", "ES")).toEqual(listing("centros-de-salud"));
		expect(translateSearchTerm("médecin généraliste", "FR", "ES")).toEqual(
			listing("centros-de-salud"),
		);
		expect(translateSearchTerm("pharmacie", "FR", "ES")).toEqual(listing("farmacias"));
		// A Spanish word typed on a French page, for Madrid; and back.
		expect(translateSearchTerm("médico de cabecera", "FR", "ES")).toEqual(
			listing("centros-de-salud"),
		);
		expect(translateSearchTerm("dentista", "ES", "FR")).toEqual(listing("chirurgien-dentiste"));
		// Germany: "hôpital" typed on /fr, "hospital" on /es or /gb, "pharmacie" on /fr, for Berlin.
		expect(translateSearchTerm("hôpital", "FR", "DE")).toEqual(listing("krankenhaeuser"));
		expect(translateSearchTerm("hospital", "ES", "DE")).toEqual(listing("krankenhaeuser"));
		expect(translateSearchTerm("hospital", "GB", "DE")).toEqual(listing("krankenhaeuser"));
		expect(translateSearchTerm("pharmacie", "FR", "DE")).toEqual(listing("apotheken"));
		expect(translateSearchTerm("Kinderklinik", "AT", "DE")).toEqual(listing("kinderkliniken"));
		expect(translateSearchTerm("dentiste", "FR", "DE")).toEqual({ kind: "unlisted" });
		expect(translateSearchTerm("Hausarzt", "DE", "AT")).toEqual(listing("allgemeinmedizin"));
		expect(translateSearchTerm("Zahnarzt", "GB", "AT")).toEqual(listing("zahnaerzte"));
		// Italy: "pharmacie" typed on /fr, "lékárna" on /cz, "pharmacy" on /gb, for Roma.
		expect(translateSearchTerm("pharmacie", "FR", "IT")).toEqual(listing("farmacie"));
		expect(translateSearchTerm("lékárna", "CZ", "IT")).toEqual(listing("farmacie"));
		expect(translateSearchTerm("pharmacy", "GB", "IT")).toEqual(listing("farmacie"));
		expect(translateSearchTerm("hôpital", "FR", "IT")).toEqual(listing("ospedali"));
		expect(translateSearchTerm("parapharmacie", "FR", "IT")).toEqual(listing("parafarmacie"));
		expect(translateSearchTerm("farmacia", "IT", "GB")).toEqual(listing("pharmacies"));
		expect(translateSearchTerm("dentiste", "FR", "IT")).toEqual({ kind: "unlisted" });
		// Care the market searched does not list, and names.
		expect(translateSearchTerm("cardiologue", "FR", "GB")).toEqual({ kind: "unlisted" });
		expect(translateSearchTerm("pharmacie", "FR", "AT")).toEqual({ kind: "unlisted" });
		expect(translateSearchTerm("Dupont", "FR", "GB")).toBeNull();
		expect(translateSearchTerm("", "FR", "GB")).toBeNull();
	});

	it("reads a term in its own market as the search always did", () => {
		for (const word of ["dentiste", "pharmacie", "Dupont", "GP"]) {
			expect(translateSearchTerm(word, "FR", "FR")).toEqual(resolveSearchTerm(word, "FR"));
		}
	});

	it("names a listing in a locale's words", () => {
		expect(listingLabel("dental-practices", "en-GB")).toBe("Dental practices");
		expect(listingLabel("chirurgien-dentiste", "fr")).toBe("Chirurgien-dentiste");
		expect(listingLabel("chirurgien-dentiste", "en-GB")).toBeNull();
		// A label resolves back to its listing in its market.
		for (const [slug, locale, country] of [
			["dental-practices", "en-GB", "GB"],
			["zahnaerzte", "de-AT", "AT"],
			["zubni-lekar", "cs-CZ", "CZ"],
			["dentistas", "es-ES", "ES"],
			["farmacie", "it-IT", "IT"],
			["case-di-cura", "it-IT", "IT"],
			["krankenhaeuser", "de-DE", "DE"],
			["reha-kliniken", "de-DE", "DE"],
			["chirurgien-dentiste", "en", "FR"],
		] as const) {
			expect(resolveListing(listingLabel(slug, locale) ?? "", country)).toBe(slug);
		}
	});
});

describe("Italy's listings", () => {
	it("are suggested and resolved in Italy only, plural or singular", () => {
		expect(suggestListings("farmac", "it-IT").map((entry) => entry.slug)[0]).toBe("farmacie");
		expect(suggestListings("ospedal", "it-IT").map((entry) => entry.slug)[0]).toBe("ospedali");
		expect(resolveListing("Farmacie", "IT")).toBe("farmacie");
		expect(resolveListing("Farmacia", "IT")).toBe("farmacie");
		expect(resolveListing("Casa di cura accreditata", "IT")).toBe("case-di-cura");
		expect(resolveListing("Farmacie", "FR")).toBeNull();
		expect(suggestListings("ospedal", "it").map((entry) => entry.slug)).not.toContain("ospedali");
	});
});

describe("Switzerland's listings", () => {
	it("are suggested and resolved in Switzerland only, in each of its languages", () => {
		expect(suggestListings("Spit", "de-CH").map((entry) => entry.slug)[0]).toBe("spital");
		expect(suggestListings("hôpi", "fr-CH").map((entry) => entry.slug)[0]).toBe("spital");
		expect(suggestListings("ospe", "it-CH").map((entry) => entry.slug)[0]).toBe("spital");
		expect(resolveListing("Spitäler", "CH")).toBe("spital");
		expect(resolveListing("Spital", "CH")).toBe("spital");
		expect(resolveListing("Pharmacies", "CH")).toBe("apotheke");
		expect(resolveListing("Casa per anziani", "CH")).toBe("pflegeheim");
		expect(resolveListing("Spitäler", "AT")).toBeNull();
		expect(suggestListings("Spit", "de-AT").map((entry) => entry.slug)).not.toContain("spital");
		expect(listingLabel("spital", "fr-CH")).toBe("Hôpitaux");
	});

	it("carry a search typed in another market over to Switzerland's kind of care", () => {
		const listing = (slug: string) => ({ kind: "listing", slug });
		expect(translateSearchTerm("pharmacie", "FR", "CH")).toEqual(listing("apotheke"));
		expect(translateSearchTerm("farmacia", "IT", "CH")).toEqual(listing("apotheke"));
		expect(translateSearchTerm("pharmacy", "GB", "CH")).toEqual(listing("apotheke"));
		expect(translateSearchTerm("ospedale", "IT", "CH")).toEqual(listing("spital"));
		expect(translateSearchTerm("Apotheke", "CH", "IT")).toEqual(listing("farmacie"));
		expect(translateSearchTerm("dentiste", "FR", "CH")).toEqual({ kind: "unlisted" });
	});
});
