import { describe, expect, it } from "vitest";
import { allAtListingSlugs } from "./at";
import { allCzListingSlugs } from "./cz";
import {
	allEsListingSlugs,
	allEsTaxonomySlugs,
	ES_DENTAL,
	ES_HEALTH_CENTRE,
	ES_HOSPITAL,
	ES_KIND_SLUGS,
	ES_LOCAL_CLINIC,
	ES_MEDICAL_PRACTICE,
	ES_OTHER_PRACTICE,
	ES_PHARMACY,
	ES_POLYCLINIC,
	ES_PROFESSIONS,
	ES_RESERVED_SEGMENTS,
	esCentreTypeCode,
	esKindSlugOf,
	esListingSlugFor,
	esProfessionOfListingSlug,
	esProfessionOfType,
	esUnitsOf,
	isEsListingSlug,
	primaryEsSpecialty,
} from "./es";
import { allListingSlugs } from "./fr";
import { allGbListingSlugs } from "./gb";

describe("the Spanish taxonomy", () => {
	it("imports the centre types patients visit, and only those", () => {
		expect(esCentreTypeCode("C251 - Clínicas Dentales")).toBe("C251");
		expect(esCentreTypeCode(" E1 - Oficinas de farmacia")).toBe("E1");
		expect(esCentreTypeCode("Tipo centro")).toBeNull();
		expect(esProfessionOfType("C11 - Hospitales Generales")).toBe(ES_HOSPITAL);
		expect(
			esProfessionOfType("C14 - Hospitales de salud mental y tratamiento de toxicomanías"),
		).toBe(ES_HOSPITAL);
		expect(esProfessionOfType("C231 - Centros de salud")).toBe(ES_HEALTH_CENTRE);
		expect(esProfessionOfType("C232 - Consultorios de atencion primaria")).toBe(ES_LOCAL_CLINIC);
		expect(esProfessionOfType("C21 - Consultas Médicas")).toBe(ES_MEDICAL_PRACTICE);
		expect(esProfessionOfType("C22")).toBe(ES_OTHER_PRACTICE);
		expect(esProfessionOfType("C24 - Centros Polivalentes")).toBe(ES_POLYCLINIC);
		expect(esProfessionOfType("C251 - Clínicas Dentales")).toBe(ES_DENTAL);
		expect(esProfessionOfType("E1 - Oficinas de farmacia")).toBe(ES_PHARMACY);
		// Mobile units, diagnostics, dialysis, mental health centres, opticians, first-aid kits.
		for (const type of [
			"C257",
			"C256",
			"C255",
			"C2511",
			"C190",
			"E2",
			"E3",
			"E5",
			"C2",
			"",
			null,
		]) {
			expect(esProfessionOfType(type)).toBeNull();
		}
	});

	it("reads the care units of a centre as the register lists them", () => {
		expect(
			esUnitsOf(
				"U.1 Medicina general/de familia,U.2 Enfermería,U.100 Transporte sanitario (carretera, aéreo, marítimo),U.104  Banco de oocitos,U.2 Enfermería,",
			),
		).toEqual([
			{ code: "U.1", label: "Medicina general/de familia" },
			{ code: "U.2", label: "Enfermería" },
			{ code: "U.100", label: "Transporte sanitario (carretera, aéreo, marítimo)" },
			{ code: "U.104", label: "Banco de oocitos" },
		]);
		expect(esUnitsOf("U.69 Psiquiatría")).toEqual([{ code: "U.69", label: "Psiquiatría" }]);
		expect(esUnitsOf("")).toEqual([]);
		expect(esUnitsOf(null)).toEqual([]);
	});

	it("lists a doctor's practice under its most specific unit", () => {
		expect(primaryEsSpecialty(ES_MEDICAL_PRACTICE, ["U.13", "U.7"])).toBe("U.7");
		expect(primaryEsSpecialty(ES_MEDICAL_PRACTICE, ["U.1", "U.48", "U.84"])).toBe("U.1");
		expect(primaryEsSpecialty(ES_MEDICAL_PRACTICE, ["U.48", "U.84"])).toBe("U.48");
		expect(primaryEsSpecialty(ES_MEDICAL_PRACTICE, ["U.59", "U.55"])).toBe("U.55");
		expect(primaryEsSpecialty(ES_MEDICAL_PRACTICE, ["U.84", "U.900", "U.101"])).toBeNull();
		expect(esListingSlugFor(ES_MEDICAL_PRACTICE, "U.7")).toBe("cardiologos");
		expect(esListingSlugFor(ES_MEDICAL_PRACTICE, "U.1")).toBe("medicina-general");
		expect(esListingSlugFor(ES_MEDICAL_PRACTICE, null)).toBe("consultas-medicas");
		expect(esListingSlugFor(ES_MEDICAL_PRACTICE, "U.900")).toBe("consultas-medicas");
	});

	it("lists another professional's practice under the other professions only", () => {
		expect(primaryEsSpecialty(ES_OTHER_PRACTICE, ["U.59", "U.4"])).toBe("U.4");
		expect(primaryEsSpecialty(ES_OTHER_PRACTICE, ["U.1", "U.59"])).toBe("U.59");
		expect(primaryEsSpecialty(ES_OTHER_PRACTICE, ["U.69"])).toBeNull();
		expect(
			primaryEsSpecialty(ES_OTHER_PRACTICE, ["U.900"], "CONSULTA DE PSICOLOGIA SANITARIA"),
		).toBe("U.70");
		expect(primaryEsSpecialty(ES_OTHER_PRACTICE, ["U.900"], "Centre de Psicologia")).toBe("U.70");
		expect(primaryEsSpecialty(ES_OTHER_PRACTICE, ["U.900"], "PSIKOLOGIA ZENTRUA")).toBe("U.70");
		expect(primaryEsSpecialty(ES_OTHER_PRACTICE, ["U.900"], "TEC SALUD Y SOCIAL SLU")).toBeNull();
		expect(primaryEsSpecialty(ES_OTHER_PRACTICE, ["U.900", "U.2"], "PSICOLOGIA")).toBe("U.2");
		expect(primaryEsSpecialty(ES_OTHER_PRACTICE, [], "PSICOLOGIA")).toBeNull();
		expect(esListingSlugFor(ES_OTHER_PRACTICE, "U.70")).toBe("psicologos");
		expect(esListingSlugFor(ES_OTHER_PRACTICE, "U.7")).toBe("otros-profesionales-sanitarios");
		expect(esListingSlugFor(ES_OTHER_PRACTICE, null)).toBe("otros-profesionales-sanitarios");
	});

	it("lists the other kinds under their own listing, whatever their units", () => {
		expect(primaryEsSpecialty(ES_DENTAL, ["U.44"])).toBeNull();
		expect(esListingSlugFor(ES_DENTAL, "U.7")).toBe("dentistas");
		expect(esListingSlugFor(ES_HEALTH_CENTRE, null)).toBe("centros-de-salud");
		expect(esListingSlugFor(ES_LOCAL_CLINIC, null)).toBe("centros-de-salud");
		expect(esListingSlugFor(ES_PHARMACY, null)).toBe("farmacias");
		expect(esListingSlugFor(ES_HOSPITAL, "U.69")).toBe("hospitales");
		expect(esListingSlugFor("XX", null)).toBeNull();
	});

	it("never shares a listing or kind slug with France, Austria, the United Kingdom or Czechia", () => {
		const others = new Set([
			...allListingSlugs(),
			...allAtListingSlugs(),
			...allGbListingSlugs(),
			...allCzListingSlugs(),
		]);
		expect([...allEsTaxonomySlugs()].filter((slug) => others.has(slug))).toEqual([]);
		for (const slug of allEsListingSlugs()) {
			expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
			expect(isEsListingSlug(slug)).toBe(true);
		}
		for (const segment of ES_RESERVED_SEGMENTS) expect(isEsListingSlug(segment)).toBe(false);
		// A kind is named in the singular, never as a listing.
		for (const slug of Object.values(ES_KIND_SLUGS)) expect(isEsListingSlug(slug)).toBe(false);
		expect(isEsListingSlug("zubni-lekar")).toBe(false);
		expect(esProfessionOfListingSlug("farmacias")).toBe(ES_PHARMACY);
		expect(esProfessionOfListingSlug("centros-de-salud")).toBe(ES_HEALTH_CENTRE);
		expect(esProfessionOfListingSlug("cardiologos")).toBeUndefined();
		expect(esKindSlugOf(ES_LOCAL_CLINIC)).toBe("consultorio-local");
		expect(esKindSlugOf("XX")).toBeNull();
		expect(Object.keys(ES_KIND_SLUGS).sort()).toEqual(Object.keys(ES_PROFESSIONS).sort());
	});
});
