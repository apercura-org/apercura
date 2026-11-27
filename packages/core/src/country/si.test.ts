import { describe, expect, it } from "vitest";
import { claimPolicyOf } from "../claims";
import { formatPhoneSi, normalizeSiPostcode, toE164Si } from "../phone-si";
import {
	isValidSiSourceId,
	parseAtPractitionerSegment,
	parseCzFacilitySegment,
	parsePractitionerSegment,
	parseSiPractitionerSegment,
	SI_ID_SCHEME,
	siPractitionerSlug,
	slugifySl,
} from "../slugs";
import { isSiListingSlug } from "../taxonomy/si";
import { adapterOfSegment, SI_LIST_IDS, SI_REGIONS, slovenia } from "./index";

describe("the Slovenian adapter", () => {
	it("is a Slovenian-language directory market without booking or e-identity claims", () => {
		expect(slovenia.code).toBe("SI");
		expect(slovenia.segment).toBe("si");
		expect(slovenia.defaultLocale).toBe("sl");
		expect(slovenia.features).toEqual({ directory: true, booking: false, eIdentityClaim: false });
		expect(adapterOfSegment("si")).toBe(slovenia);
		expect(adapterOfSegment("sl")).toBeUndefined();
		expect(claimPolicyOf("SI").methods).toEqual(["document"]);
	});

	it("claims no health-data hosting certification", () => {
		expect(slovenia.healthDataHosting.regime).not.toBe("HDS");
		expect(slovenia.healthDataHosting.basis).toMatch(/^No hosting certification/);
	});

	it("has one time zone and refuses codes that are not statistical regions or municipalities", () => {
		expect(slovenia.timeZones).toEqual(["Europe/Ljubljana"]);
		for (const code of ["1", "8", "12", "61", "213"]) {
			expect(slovenia.timeZoneOf(code)).toBe("Europe/Ljubljana");
		}
		for (const code of ["0", "214", "75056", "SI01", ""]) {
			expect(() => slovenia.timeZoneOf(code), code).toThrow(RangeError);
		}
	});

	it("knows the twelve statistical regions", () => {
		expect(Object.keys(SI_REGIONS)).toHaveLength(12);
		expect(SI_REGIONS["8"]).toBe("Osrednjeslovenska");
		expect(SI_REGIONS["12"]).toBe("Obalno-kraška");
	});

	it("names the insurer's three lists and the spatial units under CC BY 4.0 with their credit", () => {
		expect(slovenia.registries.map((source) => source.id)).toEqual([...SI_LIST_IDS, "si-rpe"]);
		for (const source of slovenia.registries) {
			expect(source.licence).toContain("CC BY 4.0");
			expect(source.licenceUrl).toBe("https://creativecommons.org/licenses/by/4.0/deed.sl");
			expect(source.attribution).toMatch(/^Vir: /);
		}
		for (const id of SI_LIST_IDS) {
			const list = slovenia.registries.find((source) => source.id === id);
			expect(list?.provides).toEqual(["practitioners", "activities"]);
			expect(list?.attribution).toContain("Zavod za zdravstveno zavarovanje Slovenije (ZZZS)");
		}
		expect(slovenia.registries.at(-1)?.provides).toEqual(["places"]);
		expect(JSON.stringify(slovenia.registries)).not.toMatch(/zbornica/i);
	});

	it("keys a doctor by the insurer's number, in a segment no other market parses", () => {
		expect(slovenia.practitionerIds.map((scheme) => scheme.id)).toEqual([SI_ID_SCHEME]);
		expect(isValidSiSourceId("7774")).toBe(true);
		expect(isValidSiSourceId("07774")).toBe(false);
		expect(isValidSiSourceId("7774.0")).toBe(false);
		const slug = siPractitionerSlug("Muamer", "Mušić", "10350");
		expect(slug).toBe("muamer-music-si10350");
		expect(parseSiPractitionerSegment(slug)).toEqual({
			idScheme: SI_ID_SCHEME,
			nationalId: "10350",
			namePart: "muamer-music",
		});
		expect(parseSiPractitionerSegment("si10350")?.namePart).toBe("");
		expect(parseSiPractitionerSegment("muamer-music-10350")).toBeNull();
		expect(parseSiPractitionerSegment("muamer-music-si010350")).toBeNull();
		// Czech, Austrian and French parsers read none of them as theirs.
		expect(parseCzFacilitySegment(slug)).toBeNull();
		expect(parseAtPractitionerSegment(slug)).toBeNull();
		expect(parsePractitionerSegment(slug)).toBeNull();
		expect(siPractitionerSlug("", "", "7")).toBe("si7");
	});

	it("writes Slovenian letters without their marks, đ as d", () => {
		expect(slugifySl("Đurđica Šuštaršič Žgank")).toBe("durdica-sustarsic-zgank");
		expect(slugifySl("Škofja Loka")).toBe("skofja-loka");
		expect(slugifySl("Ćosić")).toBe("cosic");
	});

	it("normalizes and prints Slovenian phone numbers", () => {
		expect(toE164Si("01 30 77 300")).toBe("+38613077300");
		expect(toE164Si("+386 1 307 73 00")).toBe("+38613077300");
		expect(toE164Si("00386 41 123 456")).toBe("+38641123456");
		expect(toE164Si("041/123-456")).toBe("+38641123456");
		expect(toE164Si("+386 (0)3 428 11 00")).toBe("+38634281100");
		expect(toE164Si("080 1234")).toBe("+386801234");
		expect(toE164Si("+43 1 234567")).toBe("+431234567");
		expect(toE164Si("12345")).toBeNull();
		expect(toE164Si("")).toBeNull();
		expect(formatPhoneSi("+38613077300")).toBe("01 307 73 00");
		expect(formatPhoneSi("+38634281100")).toBe("03 428 11 00");
		expect(formatPhoneSi("+38641123456")).toBe("041 123 456");
		expect(formatPhoneSi("+38631123456")).toBe("031 123 456");
		expect(formatPhoneSi("+38670123456")).toBe("070 123 456");
		expect(formatPhoneSi("+386801234")).toBe("080 1234");
		expect(formatPhoneSi("+431234567")).toBe("+431234567");
	});

	it("reads four-digit postcodes and prints an address street first", () => {
		expect(normalizeSiPostcode("3211")).toBe("3211");
		expect(normalizeSiPostcode("SI-1000")).toBe("1000");
		expect(normalizeSiPostcode("1000.0")).toBe("1000");
		expect(normalizeSiPostcode("0100")).toBeNull();
		expect(normalizeSiPostcode("10000")).toBeNull();
		expect(
			slovenia.address.lines({ street: "Celjska cesta 24 B", postcode: "3212", city: "Vojnik" }),
		).toEqual(["Celjska cesta 24 B", "3212 Vojnik"]);
		expect(slovenia.address.postcode.test("6000")).toBe(true);
		expect(isSiListingSlug("zobozdravnik")).toBe(true);
	});

	it("names the market's own legal bases", () => {
		const bases = slovenia.legalPages.map((page) => page.basis).join(" ");
		expect(bases).toContain("ZEPT");
		expect(bases).toContain("ZVOP-2");
		expect(bases).not.toMatch(/LCEN|DSGVO|CNIL/);
		expect(slovenia.legalPages.map((page) => page.id)).toEqual([
			"legal-notice",
			"privacy",
			"terms",
			"accessibility",
		]);
	});
});
