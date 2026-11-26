import { describe, expect, it } from "vitest";
import { allAtListingSlugs } from "./at";
import {
	CARE_KINDS,
	type CareMarket,
	careKindOfListing,
	equivalentListing,
	listingOfCareKind,
} from "./care-kinds";
import { allCzListingSlugs } from "./cz";
import { allEsListingSlugs } from "./es";
import { allListingSlugs } from "./fr";
import { allGbListingSlugs } from "./gb";

const LISTINGS: Record<CareMarket, Set<string>> = {
	FR: allListingSlugs(),
	AT: allAtListingSlugs(),
	GB: allGbListingSlugs(),
	CZ: allCzListingSlugs(),
	ES: allEsListingSlugs(),
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
		expect(equivalentListing("pharmacien", "FR", "AT")).toBeNull();
		expect(equivalentListing("cardiologue", "FR", "FR")).toBe("cardiologue");
		expect(equivalentListing("chirurgien-dentiste", "FR", "ES")).toBe("dentistas");
		expect(equivalentListing("medecin-generaliste", "FR", "ES")).toBe("centros-de-salud");
		expect(equivalentListing("gp-practices", "GB", "ES")).toBe("centros-de-salud");
		expect(equivalentListing("cirujanos", "ES", "FR")).toBe("chirurgien-general");
		expect(equivalentListing("podologos", "ES", "CZ")).toBeNull();
	});
});
