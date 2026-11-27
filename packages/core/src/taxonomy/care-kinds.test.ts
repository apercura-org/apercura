import { describe, expect, it } from "vitest";
import { allAtListingSlugs } from "./at";
import {
	CARE_KINDS,
	type CareMarket,
	careKindOfListing,
	careKindsOfListing,
	equivalentListing,
	listingOfCareKind,
} from "./care-kinds";
import { allChListingSlugs } from "./ch";
import { allCyListingSlugs } from "./cy";
import { allCzListingSlugs } from "./cz";
import { allDeListingSlugs } from "./de";
import { allEeListingSlugs } from "./ee";
import { allEsListingSlugs } from "./es";
import { allFiListingSlugs } from "./fi";
import { allListingSlugs } from "./fr";
import { allGbListingSlugs } from "./gb";
import { allIeListingSlugs } from "./ie";
import { allItListingSlugs } from "./it";
import { allLtListingSlugs } from "./lt";
import { allNoListingSlugs } from "./no";
import { allPlListingSlugs } from "./pl";
import { allSiListingSlugs } from "./si";

const LISTINGS: Record<CareMarket, Set<string>> = {
	FR: allListingSlugs(),
	AT: allAtListingSlugs(),
	GB: allGbListingSlugs(),
	CZ: allCzListingSlugs(),
	ES: allEsListingSlugs(),
	IT: allItListingSlugs(),
	DE: allDeListingSlugs(),
	CH: allChListingSlugs(),
	EE: allEeListingSlugs(),
	PL: allPlListingSlugs(),
	NO: allNoListingSlugs(),
	IE: allIeListingSlugs(),
	FI: allFiListingSlugs(),
	LT: allLtListingSlugs(),
	SI: allSiListingSlugs(),
	CY: allCyListingSlugs(),
};

describe("the kinds of care shared by the markets", () => {
	it("lead to listing slugs of each market only", () => {
		const unknown: string[] = [];
		for (const [kind, listings] of Object.entries(CARE_KINDS)) {
			for (const [market, slug] of Object.entries(listings)) {
				if (!LISTINGS[market as CareMarket].has(slug)) unknown.push(`${kind} ${market} ${slug}`);
			}
		}
		expect(unknown).toEqual([]);
	});

	it("are listed in at least two markets", () => {
		const alone = Object.entries(CARE_KINDS)
			.filter(([, listings]) => Object.keys(listings).length < 2)
			.map(([kind]) => kind);
		expect(alone).toEqual([]);
	});

	it("read a listing back as the first kind leading to it", () => {
		expect(careKindOfListing("dental-practices", "GB")).toBe("dentistry");
		expect(careKindsOfListing("dental-practices", "GB")).toEqual(["dentistry", "orthodontics"]);
		expect(careKindsOfListing("orthodontiste", "FR")).toEqual(["orthodontics"]);
		expect(careKindsOfListing("aide-soignant", "FR")).toEqual([]);
		expect(careKindOfListing("zahnaerzte", "AT")).toBe("dentistry");
		expect(careKindOfListing("orthodontiste", "FR")).toBe("orthodontics");
		expect(careKindOfListing("chirurgie", "AT")).toBe("general-surgery");
		expect(careKindOfListing("chirurgien-dentiste", "GB")).toBeNull();
		expect(careKindOfListing("aide-soignant", "FR")).toBeNull();
		expect(listingOfCareKind("pharmacy", "AT")).toBeNull();
		expect(listingOfCareKind("general-practice", "CZ")).toBe("prakticky-lekar");
	});

	it("map a listing of one market to the same care in another", () => {
		expect(equivalentListing("chirurgien-dentiste", "FR", "GB")).toBe("dental-practices");
		expect(equivalentListing("chirurgien-dentiste", "FR", "AT")).toBe("zahnaerzte");
		expect(equivalentListing("chirurgien-dentiste", "FR", "CZ")).toBe("zubni-lekar");
		expect(equivalentListing("dental-practices", "GB", "FR")).toBe("chirurgien-dentiste");
		expect(equivalentListing("gp-practices", "GB", "AT")).toBe("allgemeinmedizin");
		expect(equivalentListing("orthodontiste", "FR", "GB")).toBe("dental-practices");
		expect(equivalentListing("kardiolog", "CZ", "FR")).toBe("cardiologue");
		expect(equivalentListing("cardiologue", "FR", "GB")).toBeNull();
		expect(equivalentListing("hospitales", "ES", "DE")).toBe("krankenhaeuser");
		expect(equivalentListing("ospedali", "IT", "DE")).toBe("krankenhaeuser");
		expect(equivalentListing("pharmacien", "FR", "DE")).toBe("apotheken");
		expect(equivalentListing("cardiologue", "FR", "DE")).toBeNull();
		expect(equivalentListing("pharmacien", "FR", "AT")).toBeNull();
		expect(equivalentListing("cardiologue", "FR", "FR")).toBe("cardiologue");
		expect(equivalentListing("chirurgien-dentiste", "FR", "ES")).toBe("dentistas");
		expect(equivalentListing("medecin-generaliste", "FR", "ES")).toBe("centros-de-salud");
		expect(equivalentListing("gp-practices", "GB", "ES")).toBe("centros-de-salud");
		expect(equivalentListing("cirujanos", "ES", "FR")).toBe("chirurgien-general");
		expect(equivalentListing("podologos", "ES", "CZ")).toBeNull();
		expect(equivalentListing("chirurgien-dentiste", "FR", "PL")).toBe("stomatologia");
		expect(equivalentListing("cardiologue", "FR", "PL")).toBe("poradnie-kardiologiczne");
		expect(equivalentListing("krankenhaeuser", "DE", "PL")).toBe("szpitale");
		expect(equivalentListing("przychodnie-poz", "PL", "GB")).toBe("gp-practices");
		expect(equivalentListing("pharmacien", "FR", "PL")).toBeNull();
		// Slovenia lists its personal doctors: family doctors, children's doctors, gynaecologists
		// and dentists, and nothing else.
		expect(equivalentListing("chirurgien-dentiste", "FR", "SI")).toBe("zobozdravnik");
		expect(equivalentListing("orthodontiste", "FR", "SI")).toBe("zobozdravnik");
		expect(equivalentListing("medecin-generaliste", "FR", "SI")).toBe("druzinski-zdravnik");
		expect(equivalentListing("gp-practices", "GB", "SI")).toBe("druzinski-zdravnik");
		expect(equivalentListing("detsky-lekar", "CZ", "SI")).toBe("otroski-zdravnik");
		expect(equivalentListing("frauenheilkunde", "AT", "SI")).toBe("ginekolog");
		expect(equivalentListing("zobozdravnik", "SI", "AT")).toBe("zahnaerzte");
		expect(equivalentListing("druzinski-zdravnik", "SI", "FR")).toBe("medecin-generaliste");
		expect(equivalentListing("pharmacien", "FR", "SI")).toBeNull();
		expect(equivalentListing("cardiologue", "FR", "SI")).toBeNull();
	});
});
