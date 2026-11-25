import { describe, expect, it } from "vitest";
import {
	AT_DENTIST,
	AT_DOCTOR,
	AT_RESERVED_SEGMENTS,
	AT_SPECIALTIES,
	allAtListingSlugs,
	atListingSlugFor,
	atSpecialtyCodeOf,
	isAtListingSlug,
	primaryAtSpecialty,
} from "./at";
import { allListingSlugs } from "./fr";

describe("the Austrian taxonomy", () => {
	it("reads the Vienna and Styria spellings of one specialty as one code", () => {
		const code = (raw: string) => {
			const label = atSpecialtyCodeOf(raw);
			return label.kind === "specialty" ? label.code : label.kind;
		};
		expect(code("Allgemeinmedizin")).toBe("allgemeinmedizin");
		expect(code("AM - Allgemein Medizin")).toBe("allgemeinmedizin");
		expect(code("FA - Allgemeinmedizin und Familienmedizin")).toBe("allgemein-und-familienmedizin");
		expect(code("Allgemein- und Familienmedizin")).toBe("allgemein-und-familienmedizin");
		expect(code("Frauenheilkunde u. Geburtshilfe")).toBe("frauenheilkunde-und-geburtshilfe");
		expect(code("FA - Frauenheilkunde und Geburtshilfe")).toBe("frauenheilkunde-und-geburtshilfe");
		expect(code("Radiologie (ÄAO 1989)")).toBe("radiologie");
		expect(code("Orthopädie und Traumalogie")).toBe("orthopaedie-und-traumatologie");
		expect(code("Pharmakologie und Toxikologie")).toBe("pharmakologie-und-toxikologie");
		expect(code("FA - Psychatrie und Neurologie")).toBe("psychiatrie-und-neurologie");
		expect(code("Innere Medizin u. Hämatologie u. Internistische Onkologie")).toBe(
			"innere-medizin-und-haematologie-und-internistische-onkologie",
		);
		expect(code("FA - Plastische, ästhetische u. rekonstruktive Chirurgie")).toBe(
			"plastische-rekonstruktive-und-aesthetische-chirurgie",
		);
	});

	it("lists doctors without a specialty under the profession and reports unknown labels", () => {
		expect(atSpecialtyCodeOf("Approbierte*r Ärzt*in")).toEqual({ kind: "none" });
		expect(atSpecialtyCodeOf("FA - Approbierter Arzt")).toEqual({ kind: "none" });
		expect(atSpecialtyCodeOf("unbekannt")).toEqual({ kind: "none" });
		expect(atSpecialtyCodeOf("")).toEqual({ kind: "none" });
		expect(atSpecialtyCodeOf("Erfundene Heilkunde")).toEqual({
			kind: "unknown",
			key: "erfundene-heilkunde",
		});
		expect(atListingSlugFor(AT_DOCTOR, null)).toBe("aerzte");
		expect(atListingSlugFor(AT_DOCTOR, "erfundene-heilkunde")).toBe("aerzte");
		expect(atListingSlugFor(AT_DOCTOR, "innere-medizin-und-kardiologie")).toBe("kardiologie");
		expect(atListingSlugFor("10", "allgemeinmedizin")).toBeNull();
		expect(atListingSlugFor(AT_DENTIST, null)).toBe("zahnaerzte");
		expect(atListingSlugFor(AT_DENTIST, "allgemeinmedizin")).toBe("zahnaerzte");
	});

	it("keeps listing slugs German, apart from the French ones and from the route segments", () => {
		const french = allListingSlugs();
		for (const slug of allAtListingSlugs()) {
			expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
			expect(french.has(slug)).toBe(false);
			expect(AT_RESERVED_SEGMENTS as readonly string[]).not.toContain(slug);
			expect(isAtListingSlug(slug)).toBe(true);
		}
		expect(isAtListingSlug("arzt")).toBe(false);
		expect(isAtListingSlug("cardiologue")).toBe(false);
		for (const code of Object.keys(AT_SPECIALTIES)) expect(code).toMatch(/^[a-z0-9-]+$/);
	});

	it("lists a specialist who is also a general practitioner as the specialist", () => {
		expect(primaryAtSpecialty(["allgemeinmedizin", "innere-medizin", "allgemeinmedizin"])).toBe(
			"innere-medizin",
		);
		expect(primaryAtSpecialty(["kardiologie", "urologie", "urologie"])).toBe("urologie");
		expect(primaryAtSpecialty(["urologie", "kardiologie"])).toBe("kardiologie");
		expect(primaryAtSpecialty(["allgemeinmedizin", "allgemein-und-familienmedizin"])).toBe(
			"allgemein-und-familienmedizin",
		);
		expect(primaryAtSpecialty([null, null])).toBeNull();
		expect(primaryAtSpecialty([])).toBeNull();
	});
});
