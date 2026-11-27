import { describe, expect, it } from "vitest";
import { allAtListingSlugs } from "./at";
import { careKindOfListing, equivalentListing } from "./care-kinds";
import { allChListingSlugs } from "./ch";
import { allCzListingSlugs } from "./cz";
import { allDeListingSlugs } from "./de";
import { allEsListingSlugs } from "./es";
import { allListingSlugs } from "./fr";
import { allGbListingSlugs } from "./gb";
import { allItListingSlugs } from "./it";
import {
	allLtListingSlugs,
	isLtListingSlug,
	LT_DEFAULT_PROFESSIONS,
	LT_DENTAL,
	LT_HOSPITAL,
	LT_LABORATORY,
	LT_MENTAL_HEALTH,
	LT_NURSING,
	LT_OPTOMETRY,
	LT_PRIMARY_CARE,
	LT_REHABILITATION,
	LT_RESERVED_SEGMENTS,
	LT_SPECIALIST,
	type LtService,
	ltKindOfServices,
	ltListingSlugFor,
	ltProfessionOfListingSlug,
} from "./lt";

const service = (name: string, mode: string, group = "", level = "0", type = ""): LtService => ({
	mode,
	group,
	level,
	type,
	name,
});

describe("the Lithuanian taxonomy", () => {
	it("lists every kind of institution on its own", () => {
		expect(LT_DEFAULT_PROFESSIONS.map((code) => ltListingSlugFor(code, null))).toEqual([
			"ligonines",
			"seimos-medicina",
			"medicinos-centrai",
			"odontologijos-klinikos",
			"psichikos-sveikatos-centrai",
			"reabilitacija",
			"slauga",
			"laboratorijos",
			"optometrijos-kabinetai",
		]);
		expect(ltListingSlugFor("XX", null)).toBeNull();
	});

	it("reads an address's kind from its services, the most specific first", () => {
		const family = service("Šeimos medicina", "1", "1", "1");
		const cardiology = service("Suaugusiųjų kardiologija", "1", "1", "2");
		const dentistry = service("Odontologija", "1", "2", "2");
		const hygienist = service("Burnos higienisto praktika", "1", "3");
		const intensive = service(
			"Reanimacija ir intensyvioji terapija II (suaugusiųjų)",
			"2",
			"",
			"2",
		);
		const nursing = service("Bendrosios praktikos slauga", "3", "", "0", "4");
		const physio = service("Kineziterapija", "3");
		const psychiatry = service("Psichikos sveikatos priežiūra", "1", "1", "1");
		const lab = service("Laboratorinė diagnostika", "3");
		const optometry = service("Optometrininko praktika", "3");
		const echoscopy = service("Echoskopija", "1", "1", "0");

		expect(ltKindOfServices([family, intensive])).toBe(LT_HOSPITAL);
		expect(ltKindOfServices([cardiology, family, dentistry])).toBe(LT_PRIMARY_CARE);
		expect(ltKindOfServices([dentistry, cardiology])).toBe(LT_SPECIALIST);
		expect(ltKindOfServices([dentistry, hygienist])).toBe(LT_DENTAL);
		expect(ltKindOfServices([hygienist])).toBe(LT_DENTAL);
		expect(ltKindOfServices([psychiatry, nursing])).toBe(LT_MENTAL_HEALTH);
		expect(ltKindOfServices([echoscopy])).toBe(LT_SPECIALIST);
		expect(ltKindOfServices([lab])).toBe(LT_LABORATORY);
		expect(ltKindOfServices([nursing, physio])).toBe(LT_NURSING);
		expect(ltKindOfServices([service("Akušerio praktika", "3", "", "0", "1")])).toBe(LT_NURSING);
		expect(ltKindOfServices([physio, service("Gydomasis masažas", "3")])).toBe(LT_REHABILITATION);
		expect(ltKindOfServices([optometry])).toBe(LT_OPTOMETRY);
	});

	it("leaves out the addresses patients do not visit for care", () => {
		expect(ltKindOfServices([])).toBeNull();
		expect(ltKindOfServices([service("privalomasis higienos įgūdžių mokymas", "0")])).toBeNull();
		expect(
			ltKindOfServices([
				service("kenkėjų kontrolė (dezinfekcija, dezinsekcija, deratizacija)", "0"),
			]),
		).toBeNull();
		expect(ltKindOfServices([service("Greitoji medicinos pagalba", "1")])).toBeNull();
		expect(
			ltKindOfServices([service("Išplėstinės praktikos vaistininko praktika", "3")]),
		).toBeNull();
		expect(ltKindOfServices([service("Biobankas", "0")])).toBeNull();
	});

	it("never shares a listing slug with another market", () => {
		const others = new Set([
			...allListingSlugs(),
			...allAtListingSlugs(),
			...allGbListingSlugs(),
			...allCzListingSlugs(),
			...allEsListingSlugs(),
			...allItListingSlugs(),
			...allDeListingSlugs(),
			...allChListingSlugs(),
		]);
		expect([...allLtListingSlugs()].filter((slug) => others.has(slug))).toEqual([]);
		for (const slug of allLtListingSlugs()) {
			expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
			expect(isLtListingSlug(slug)).toBe(true);
		}
		for (const segment of LT_RESERVED_SEGMENTS) expect(isLtListingSlug(segment)).toBe(false);
		expect(ltProfessionOfListingSlug("ligonines")).toBe(LT_HOSPITAL);
		expect(ltProfessionOfListingSlug("ligonine")).toBeUndefined();
	});

	it("carries searches over from the other markets", () => {
		expect(equivalentListing("chirurgien-dentiste", "FR", "LT")).toBe("odontologijos-klinikos");
		expect(equivalentListing("medecin-generaliste", "FR", "LT")).toBe("seimos-medicina");
		expect(equivalentListing("gp-practices", "GB", "LT")).toBe("seimos-medicina");
		expect(equivalentListing("ospedali", "IT", "LT")).toBe("ligonines");
		expect(equivalentListing("cardiologue", "FR", "LT")).toBe("medicinos-centrai");
		expect(equivalentListing("ligonines", "LT", "DE")).toBe("krankenhaeuser");
		expect(equivalentListing("pharmacien", "FR", "LT")).toBeNull();
		expect(careKindOfListing("medicinos-centrai", "LT")).toBe("specialist-care");
		expect(careKindOfListing("odontologijos-klinikos", "LT")).toBe("dentistry");
	});
});
