import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { slugify } from "../slugify";
import {
	activityInScope,
	allListingSlugs,
	ameliSpecialtyCompatible,
	FR_AMELI_SPECIALTY_SLUGS,
	FR_DEFAULT_PROFESSIONS,
	FR_GENRE_CLASSES,
	FR_PROFESSIONS,
	FR_ROLE_CLASSES,
	FR_SECTOR_KINDS,
	FR_SPECIALTIES,
	hasBillingSectors,
	listingHasBillingSectors,
	listingSlugFor,
	parseProfessionList,
	practiceKindFor,
	RESERVED_SEGMENTS,
} from "./fr";
import { PRACTICE_KINDS } from "./types";

describe("professions", () => {
	it("enables exactly physicians, dental surgeons, midwives and nurses by default", () => {
		const enabled = Object.entries(FR_PROFESSIONS)
			.filter(([, entry]) => entry.enabled)
			.map(([code]) => code);
		expect(enabled.sort()).toEqual([...FR_DEFAULT_PROFESSIONS]);
		expect([...FR_DEFAULT_PROFESSIONS]).toEqual(["10", "40", "50", "60"]);
	});

	it("keeps the retired psychiatric nurse code out of the default scope", () => {
		expect(FR_PROFESSIONS["69"]).toMatchObject({ enabled: false, liberalOnly: true });
		expect(parseProfessionList(undefined)).not.toContain("69");
		expect(parseProfessionList("60,69")).toEqual(["60", "69"]);
	});

	it("imports nurses for their self-employed activities only", () => {
		expect(activityInScope("60", "L")).toBe(true);
		for (const mode of ["S", "B", "I", null, undefined, ""]) {
			expect(activityInScope("60", mode), String(mode)).toBe(false);
			expect(activityInScope("69", mode), String(mode)).toBe(false);
		}
		for (const code of ["10", "40", "50"]) {
			expect(activityInScope(code, "S")).toBe(true);
			expect(activityInScope(code, null)).toBe(true);
		}
	});

	it("never maps code 99", () => {
		expect(FR_PROFESSIONS["99"]).toBeUndefined();
		expect(() => parseProfessionList("10,99")).toThrow(/never imported/);
	});

	it("parses, deduplicates and sorts profession lists", () => {
		expect(parseProfessionList(undefined)).toEqual(["10", "40", "50", "60"]);
		expect(parseProfessionList(" 50, 10,10 ")).toEqual(["10", "50"]);
		expect(parseProfessionList("60")).toEqual(["60"]);
		expect(() => parseProfessionList("12")).toThrow(/Unknown profession/);
		expect(() => parseProfessionList(" , ")).toThrow(/At least one/);
	});
});

describe("specialty slugs", () => {
	it.each([
		["10", "SM53", "medecin-generaliste"],
		["10", "SM26", "medecin-generaliste"],
		["10", "SM54", "medecin-generaliste"],
		["10", "SM04", "cardiologue"],
		["10", "SM73", "cardiologue"],
		["10", "SM15", "dermatologue"],
		["10", "SM42", "psychiatre"],
		["10", "SM43", "pedopsychiatre"],
		["10", null, "medecin"],
		["10", "SCD01", "medecin"],
		["40", "SCD01", "orthodontiste"],
		["40", "SCD02", "chirurgien-oral"],
		["40", "SCD03", "specialiste-medecine-bucco-dentaire"],
		["40", null, "chirurgien-dentiste"],
		["40", "SM53", "chirurgien-dentiste"],
		["50", null, "sage-femme"],
		["50", "SM20", "sage-femme"],
		["60", "SI07", "infirmier-anesthesiste"],
		["60", null, "infirmier"],
		["60", "SI01", "infirmier-en-pratique-avancee"],
		["60", "SI05", "infirmier-en-pratique-avancee"],
		["60", "SI06", "infirmier-de-bloc-operatoire"],
		["60", "SI08", "infirmier-puericulteur"],
		["60", "SM53", "infirmier"],
		["10", "SI08", "medecin"],
		["69", null, "infirmier-psychiatrique"],
	])("profession %s with specialty %s lists as %s", (profession, specialty, slug) => {
		expect(listingSlugFor(profession, specialty)).toBe(slug);
	});

	it("returns null for unmapped professions", () => {
		expect(listingSlugFor("99", null)).toBeNull();
	});

	it("covers every TRE_R38 physician specialty from SM01 to SM95", () => {
		for (let index = 1; index <= 95; index++) {
			const code = `SM${String(index).padStart(2, "0")}`;
			expect(FR_SPECIALTIES[code], code).toBeDefined();
			expect(FR_SPECIALTIES[code]?.profession).toBe("10");
		}
	});

	it("uses well-formed slugs that never collide with reserved segments", () => {
		const reserved = new Set<string>(RESERVED_SEGMENTS);
		for (const slug of allListingSlugs()) {
			expect(slugify(slug)).toBe(slug);
			expect(reserved.has(slug), slug).toBe(false);
		}
	});

	it("never uses one slug for two professions, except shared specialties", () => {
		const professionsBySlug = new Map<string, Set<string>>();
		for (const entry of Object.values(FR_SPECIALTIES)) {
			const set = professionsBySlug.get(entry.slug) ?? new Set();
			set.add(entry.profession);
			professionsBySlug.set(entry.slug, set);
		}
		const shared = [...professionsBySlug]
			.filter(([, professions]) => professions.size > 1)
			.map(([slug]) => slug);
		// Oral surgery is an ordinal specialty of both physicians and dentists.
		expect(shared).toEqual(["chirurgien-oral"]);
	});

	it("maps Ameli specialty codes to existing listing slugs", () => {
		const slugs = allListingSlugs();
		for (const [code, compatible] of Object.entries(FR_AMELI_SPECIALTY_SLUGS)) {
			expect(compatible.length, code).toBeGreaterThan(0);
			for (const slug of compatible) expect(slugs.has(slug), `${code} ${slug}`).toBe(true);
		}
		expect(ameliSpecialtyCompatible("01", "medecin-generaliste")).toBe(true);
		expect(ameliSpecialtyCompatible("01", "medecin")).toBe(true);
		expect(ameliSpecialtyCompatible("01", "cardiologue")).toBe(false);
		expect(ameliSpecialtyCompatible("19", "chirurgien-dentiste")).toBe(true);
		expect(ameliSpecialtyCompatible("24", "medecin")).toBe(false);
		// Nurses: one Ameli code for every nurse listing, and nothing else.
		for (const entry of Object.values(FR_SPECIALTIES).filter((s) => s.profession === "60")) {
			expect(ameliSpecialtyCompatible("24", entry.slug), entry.slug).toBe(true);
		}
		expect(ameliSpecialtyCompatible("24", "infirmier")).toBe(true);
		expect(ameliSpecialtyCompatible("24", "sage-femme")).toBe(false);
		expect(ameliSpecialtyCompatible("01", "infirmier")).toBe(false);
	});

	it("states fees as sectors for physicians only", () => {
		expect(hasBillingSectors("10")).toBe(true);
		for (const code of ["40", "50", "60", "69"]) expect(hasBillingSectors(code), code).toBe(false);
		expect(hasBillingSectors(null)).toBe(true);
		expect(listingHasBillingSectors("medecin-generaliste")).toBe(true);
		expect(listingHasBillingSectors("infirmier")).toBe(false);
		expect(listingHasBillingSectors("infirmier-puericulteur")).toBe(false);
		expect(listingHasBillingSectors("sage-femme")).toBe(false);
		expect(listingHasBillingSectors("orthodontiste")).toBe(false);
		// Oral surgery lists physicians and dental surgeons.
		expect(listingHasBillingSectors("chirurgien-oral")).toBe(true);
		expect(listingHasBillingSectors("unknown-slug")).toBe(true);
	});
});

describe("practice kinds", () => {
	it("maps every TRE_R02 sector from SA01 to SA69", () => {
		for (let index = 1; index <= 69; index++) {
			const code = `SA${String(index).padStart(2, "0")}`;
			expect(PRACTICE_KINDS, code).toContain(FR_SECTOR_KINDS[code]);
		}
	});

	it("maps every TRE_R22 genre and the TRE_R21 roles seen in the registry", () => {
		for (const code of ["GENR01", "GENR02", "GENR03", "GENR04", "GENR13", "GENR99"]) {
			expect(FR_GENRE_CLASSES[code], code).toBeDefined();
		}
		for (const code of ["FON-01", "FON-02", "FON-17", "FON-22", "FON-29", "FON-33", "FON-AU"]) {
			expect(FR_ROLE_CLASSES[code], code).toBeDefined();
		}
	});

	it.each([
		[{ sectorCode: "SA07", roleCode: "FON-01", genreCode: "GENR01" }, "office"],
		[{ sectorCode: "SA08", roleCode: "FON-17", genreCode: "GENR01" }, "office"],
		[{ sectorCode: "SA09", roleCode: "FON-02", genreCode: "GENR01" }, "office"],
		[{ sectorCode: "SA05", roleCode: "FON-33", genreCode: "GENR01" }, "health_center"],
		[{ sectorCode: "SA52", roleCode: "FON-01", genreCode: "GENR01" }, "health_center"],
		[{ sectorCode: "SA01", roleCode: "FON-33", genreCode: "GENR01" }, "hospital"],
		[{ sectorCode: "SA04", roleCode: "FON-55", genreCode: "GENR01" }, "hospital"],
		[{ sectorCode: "SA07", roleCode: "FON-22", genreCode: "GENR01" }, "locum"],
		[{ sectorCode: "SA07", roleCode: "FON-01", genreCode: "GENR02" }, "locum"],
		[{ sectorCode: "SA01", roleCode: "FON-33", genreCode: "GENR03" }, "locum"],
		[{ sectorCode: "SA48", roleCode: "FON-29", genreCode: "GENR04" }, "non_clinical"],
		[{ sectorCode: "SA07", roleCode: "FON-01", genreCode: "GENR04" }, "non_clinical"],
		[{ sectorCode: "SA64", roleCode: "FON-33", genreCode: "GENR01" }, "non_clinical"],
		[{ sectorCode: "SA66", roleCode: "FON-29", genreCode: "GENR01" }, "non_clinical"],
	])("classifies %o as %s", (codes, kind) => {
		expect(practiceKindFor({ ...codes, hasSite: true })).toEqual({ kind, unknownCodes: [] });
	});

	it("never makes an activity without a site patient-facing", () => {
		expect(practiceKindFor({ roleCode: "FON-01", genreCode: "GENR01", hasSite: false }).kind).toBe(
			"non_clinical",
		);
		expect(practiceKindFor({ roleCode: "FON-22", hasSite: false }).kind).toBe("locum");
	});

	it("falls back to non_clinical and reports unknown codes", () => {
		expect(
			practiceKindFor({
				sectorCode: "SA99",
				roleCode: "FON-99",
				genreCode: "GENR01",
				hasSite: true,
			}),
		).toEqual({ kind: "non_clinical", unknownCodes: ["FON-99", "SA99"] });
		expect(practiceKindFor({ genreCode: "GENR77", hasSite: true }).unknownCodes).toEqual([
			"GENR77",
		]);
	});
});

describe("i18n labels", () => {
	const catalog = (locale: string) =>
		JSON.parse(
			readFileSync(
				join(import.meta.dirname, "../../../../apps/web/messages", `${locale}.json`),
				"utf8",
			),
		) as { taxonomy: Record<string, Record<string, string>> };

	it.each(["en", "fr", "de", "es", "it"])(
		"has a %s label for every listing slug, profession and role",
		(locale) => {
			const { taxonomy } = catalog(locale);
			for (const slug of allListingSlugs()) expect(taxonomy.listing?.[slug], slug).toBeTruthy();
			for (const { slug } of Object.values(FR_PROFESSIONS)) {
				expect(taxonomy.profession?.[slug], slug).toBeTruthy();
			}
			for (const [code, activity] of Object.entries(FR_ROLE_CLASSES)) {
				if (
					activity &&
					![
						"FON-10",
						"FON-11",
						"FON-12",
						"FON-13",
						"FON-14",
						"FON-15",
						"FON-16",
						"FON-27",
						"FON-28",
						"FON-30",
						"FON-35",
						"FON-38",
						"FON-44",
						"FON-53",
					].includes(code)
				) {
					expect(taxonomy.role?.[code], code).toBeTruthy();
				}
			}
		},
	);

	it("genders French labels with an ICU select that always has an `other` branch", () => {
		const { taxonomy } = catalog("fr");
		expect(taxonomy.listing?.["chirurgien-dentiste"]).toBe(
			"{gender, select, female {Chirurgienne-dentiste} other {Chirurgien-dentiste}}",
		);
		for (const value of Object.values(taxonomy.listing ?? {})) {
			if (value.includes("select")) expect(value).toMatch(/other \{[^}]+\}\}$/);
		}
	});
});
