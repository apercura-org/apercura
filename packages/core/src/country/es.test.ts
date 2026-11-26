import { describe, expect, it } from "vitest";
import { claimPolicyOf } from "../claims";
import { formatPhoneEs, normalizeEsPostcode, toE164Es } from "../phone-es";
import {
	ES_ID_SCHEME,
	esCentreSlug,
	isValidEsSourceId,
	parseCzFacilitySegment,
	parseEsCentreSegment,
} from "../slugs";
import { isEsListingSlug } from "../taxonomy/es";
import { adapterOfSegment, ES_COMMUNITIES, ES_PROVINCE_COMMUNITIES, spain } from "./index";

describe("the Spanish adapter", () => {
	it("is a Spanish-language directory market without booking or e-identity claims", () => {
		expect(spain.code).toBe("ES");
		expect(spain.segment).toBe("es");
		expect(spain.defaultLocale).toBe("es");
		expect(spain.features).toEqual({ directory: true, booking: false, eIdentityClaim: false });
		expect(adapterOfSegment("es")).toBe(spain);
		expect(claimPolicyOf("ES").methods).toEqual(["document"]);
	});

	it("claims no health-data hosting certification", () => {
		expect(spain.healthDataHosting.regime).not.toBe("HDS");
		expect(spain.healthDataHosting.basis).toMatch(/^No hosting certification/);
	});

	it("puts the Canary Islands one hour behind the mainland and refuses unknown codes", () => {
		expect(spain.timeZones).toEqual(["Europe/Madrid", "Atlantic/Canary"]);
		for (const code of ["28", "08", "07", "51", "52", "C13"]) {
			expect(spain.timeZoneOf(code)).toBe("Europe/Madrid");
		}
		for (const code of ["35", "38", "C05"]) expect(spain.timeZoneOf(code)).toBe("Atlantic/Canary");
		for (const code of ["53", "00", "C20", "75", "ES300"]) {
			expect(() => spain.timeZoneOf(code)).toThrow(RangeError);
		}
		for (const code of Object.keys(ES_PROVINCE_COMMUNITIES)) {
			expect(spain.timeZones).toContain(spain.timeZoneOf(code));
		}
	});

	it("knows the 19 communities and cities and the community of each of the 52 provinces", () => {
		expect(Object.keys(ES_COMMUNITIES)).toHaveLength(19);
		expect(Object.keys(ES_PROVINCE_COMMUNITIES)).toHaveLength(52);
		for (const community of Object.values(ES_PROVINCE_COMMUNITIES)) {
			expect(ES_COMMUNITIES[community]).toBeTruthy();
		}
		expect(ES_PROVINCE_COMMUNITIES["28"]).toBe("13");
		expect(ES_PROVINCE_COMMUNITIES["08"]).toBe("09");
	});

	it("names the register and the IGN with the attribution each asks for", () => {
		expect(spain.registries.map((source) => source.id)).toEqual(["es-regcess", "es-ign"]);
		const [regcess, ign] = spain.registries;
		expect(regcess?.attribution).toBe("Fuente: Ministerio de Sanidad, REGCESS");
		expect(regcess?.licenceUrl).toBe("https://www.sanidad.gob.es/avisoLegal/home.htm");
		expect(ign?.licence).toContain("CC BY 4.0");
		expect(ign?.attribution).toMatch(/^Obra derivada de .+ CC-BY 4\.0 ign\.es$/);
	});

	it("identifies a centre by its REGCESS code", () => {
		const [scheme] = spain.practitionerIds;
		expect(scheme?.id).toBe(ES_ID_SCHEME);
		for (const ccn of ["1003000254", "0802000515", "1906000001"]) {
			expect(isValidEsSourceId(ccn)).toBe(true);
		}
		for (const ccn of ["802000515", "2003000254", "0003000254", "10030002541", "10030a0254", ""]) {
			expect(isValidEsSourceId(ccn)).toBe(false);
		}
		expect(esCentreSlug("CLÍNICA DENTAL Sonrisa", "1003000254")).toBe(
			"clinica-dental-sonrisa-1003000254",
		);
		expect(esCentreSlug("", "1003000254")).toBe("1003000254");
		expect(parseEsCentreSegment("clinica-dental-sonrisa-1003000254")).toEqual({
			idScheme: ES_ID_SCHEME,
			nationalId: "1003000254",
			namePart: "clinica-dental-sonrisa",
		});
		expect(parseEsCentreSegment("0802000515")?.nationalId).toBe("0802000515");
		expect(parseEsCentreSegment("centro-2-0802000515")?.namePart).toBe("centro-2");
		expect(parseEsCentreSegment("clinica-802000515")).toBeNull();
		expect(parseEsCentreSegment("Clinica-1003000254")).toBeNull();
		// A Czech facility number never reads as a Spanish code, nor the reverse.
		expect(parseCzFacilitySegment("clinica-1003000254")).toBeNull();
		expect(parseEsCentreSegment("lekarna-54227")).toBeNull();
	});

	it("normalizes and prints Spanish phone numbers", () => {
		expect(toE164Es("965950865")).toBe("+34965950865");
		expect(toE164Es("965 95 08 65")).toBe("+34965950865");
		expect(toE164Es("+34 965 950 865")).toBe("+34965950865");
		expect(toE164Es("0034965950865")).toBe("+34965950865");
		expect(toE164Es("34965950865")).toBe("+34965950865");
		expect(toE164Es("965939033, 965988900")).toBe("+34965939033");
		expect(toE164Es("965939033 / 965988900")).toBe("+34965939033");
		expect(toE164Es("965939033 - 965988900")).toBe("+34965939033");
		expect(toE164Es("653655567")).toBe("+34653655567");
		expect(toE164Es("+33472000000")).toBe("+33472000000");
		for (const raw of ["", null, undefined, "12345", "565950865", "0965950865", "9659508651"]) {
			expect(toE164Es(raw)).toBeNull();
		}
		expect(formatPhoneEs("+34965950865")).toBe("965 950 865");
		expect(formatPhoneEs("+33472000000")).toBe("+33472000000");
		expect(spain.phone.format(spain.phone.toE164("917 654 321") ?? "")).toBe("917 654 321");
	});

	it("writes five-digit postcodes and two-line addresses", () => {
		expect(normalizeEsPostcode("03110")).toBe("03110");
		expect(normalizeEsPostcode(" 3110 ")).toBe("03110");
		expect(normalizeEsPostcode("28001")).toBe("28001");
		for (const raw of ["", null, "53000", "00100", "280", "280011", "A8001"]) {
			expect(normalizeEsPostcode(raw)).toBeNull();
		}
		expect(spain.address.postcode.test("52001")).toBe(true);
		expect(
			spain.address.lines({ street: "Calle Ponent, 15", postcode: "03110", city: "Mutxamel" }),
		).toEqual(["Calle Ponent, 15", "03110 Mutxamel"]);
		expect(spain.address.lines({ street: null, postcode: null, city: "Madrid" })).toEqual([
			"Madrid",
		]);
	});

	it("serves its listing slugs and never a route segment", () => {
		expect(spain.taxonomy.isListingSlug("dentistas")).toBe(true);
		expect(isEsListingSlug("centro")).toBe(false);
		expect(spain.legalPages.map((page) => page.id)).toEqual([
			"legal-notice",
			"privacy",
			"terms",
			"accessibility",
		]);
	});
});
