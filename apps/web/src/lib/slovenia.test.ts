import { describe, expect, it } from "vitest";
import { inEveryLanguage, sitemapCountryOf } from "~/server/queries/sitemap-sql";
import {
	listingLabel,
	resolveListing,
	suggestListings,
	translateSearchTerm,
} from "./listing-index";
import {
	openDataSourcesOf,
	professionSlugOf,
	slovenianAttribution,
	slovenianDate,
	slovenianSourcesOf,
} from "./market";
import { isDepartmentSlug, placeLabel } from "./places";
import {
	displayId,
	marketSegmentOf,
	parseAnyPractitionerKey,
	parsePractitionerKey,
} from "./practitioner-key";
import { marketRef, parsePractitionerRef, practitionerRefOf } from "./practitioner-ref";
import { addressLines, cardTownLine, formatPhone } from "./practitioner-view";
import { parseReturnTo } from "./return-to";
import { MARKET_STATIC_PATHS, marketPagePath } from "./sitemap-xml";
import { SI_ACTIVITY_KEYS, slovenianActivitiesAt } from "./slovenian-practice";
import { medicalSpecialtiesOf, practitionerNodes } from "./structured-data";

/*
 * What the Slovenian pages (`/si`, #167) read: a doctor's key and reference, an address written
 * with its post office, the insurer's credit with the date of its list, the activities of a
 * practice with whether the doctor takes new patients there, the search's words, the sitemaps.
 */

describe("a Slovenian doctor's key", () => {
	it("is the insurer's number after `si`, read in Slovenia only", () => {
		const key = { country: "SI", idScheme: "SI-ZZZS", nationalId: "7774", namePart: "miran-kolar" };
		expect(parsePractitionerKey("sl-SI", "miran-kolar-si7774")).toEqual(key);
		expect(parsePractitionerKey("sl-SI", "miran-kolar-7774")).toBeNull();
		expect(parsePractitionerKey("sl-SI", "camille-19999990013")).toBeNull();
		expect(parsePractitionerKey("de-AT", "miran-kolar-si7774")).toBeNull();
		expect(parsePractitionerKey("cs-CZ", "miran-kolar-si7774")).toBeNull();
		expect(parseAnyPractitionerKey("miran-kolar-si7774")).toEqual(key);
		expect(marketSegmentOf("SI", "miran-kolar-si7774")).toBe("miran-kolar-si7774");
		expect(displayId({ idScheme: "SI-ZZZS", nationalId: "7774" })).toBe("7774");
	});

	it("reads as a reference alone, or at the end of a page address, never as another market's", () => {
		const ref = { country: "SI", idScheme: "SI-ZZZS", nationalId: "7774" };
		expect(parsePractitionerRef("si7774")).toEqual(ref);
		expect(parsePractitionerRef(" SI7774 ")).toEqual(ref);
		expect(parsePractitionerRef("https://apercura.org/si/zdravnik/miran-kolar-si7774")).toEqual(
			ref,
		);
		expect(practitionerRefOf(ref)).toBe("si7774");
		expect(marketRef("si7774", "SI")).toBe("si7774");
		// Austria's list keys and the UK's codes keep their market.
		expect(parsePractitionerRef("w7983")?.country).toBe("AT");
		expect(parsePractitionerRef("si07774")).toBeNull();
		expect(parseReturnTo("/pro/revendiquer?rpps=si7774")).toEqual({
			pathname: "/pro/revendiquer",
			query: { rpps: "si7774" },
		});
	});
});

describe("a Slovenian practice's address", () => {
	const site = {
		addressLine: "Zadobrova 49 b",
		addressComplement: null,
		postcode: "3211",
		placeName: "Celje",
		locality: "Škofja vas",
	};

	it("is written with its post office, not the municipality it is listed in", () => {
		expect(addressLines(site, "SI")).toEqual(["Zadobrova 49 b", "3211 Škofja vas"]);
		expect(addressLines({ ...site, locality: undefined }, "SI")).toEqual([
			"Zadobrova 49 b",
			"3211 Celje",
		]);
		// Other markets keep their place's name.
		expect(addressLines(site, "AT")).toEqual(["Zadobrova 49 b", "3211 Celje"]);
		expect(cardTownLine("3211", "Škofja vas", "SI")).toBe("3211 Škofja vas");
		expect(formatPhone("+38613077300")).toBe("01 307 73 00");
	});

	it("is in a statistical region, whose slug is a department's", () => {
		expect(isDepartmentSlug("osrednjeslovenska", "SI")).toBe(true);
		expect(isDepartmentSlug("obalno-kraska", "SI")).toBe(true);
		expect(isDepartmentSlug("12", "SI")).toBe(false);
		expect(
			placeLabel({ kind: "commune", code: "61", name: "Ljubljana", departmentCode: "8" }, "SI"),
		).toBe("Ljubljana");
	});
});

describe("the insurer's credit", () => {
	it("names the lists once, with the date of the newest one and the register's state", () => {
		expect(slovenianDate("2026-11-26")).toBe("26. 11. 2026");
		expect(slovenianAttribution("si-zzzs-sa", "2026-11-26")).toBe(
			"Vir: Zavod za zdravstveno zavarovanje Slovenije (ZZZS), Poimenski seznami zdravnikov, ki so lahko osebni zdravniki, CC BY 4.0, stanje 26. 11. 2026",
		);
		expect(slovenianAttribution("si-zzzs-sa", null)).not.toContain("stanje");
		const sources = slovenianSourcesOf(["si-zzzs-sa", "si-zzzs-zob", "si-zzzs-sa"], {
			"si-zzzs-sa": "2026-11-26",
			"si-zzzs-zob": "2026-11-27",
			"si-rpe": "2026-11-20",
		});
		expect(sources).toHaveLength(2);
		expect(sources[0]?.attribution).toMatch(/stanje 27\. 11\. 2026$/);
		expect(sources[1]?.attribution).toBe(
			"Vir: Geodetska uprava Republike Slovenije, Register prostorskih enot, stanje 20. 11. 2026",
		);
		expect(slovenianSourcesOf(["owner"])).toEqual([]);
		expect(
			openDataSourcesOf("SI", [{ source: "si-zzzs-gin" }], null, { dates: {} }).map(
				(source) => source.name,
			),
		).toHaveLength(2);
		expect(professionSlugOf("SI_DENTIST")).toBe("zobozdravnik");
	});
});

describe("the activities of a Slovenian practice", () => {
	const activity = (
		siteId: number,
		sectorCode: string,
		modeCode: string | null,
		source: string,
	) => ({
		source,
		modeCode,
		sectorCode,
		site: { id: siteId },
	});

	it("say, per ZZZS activity, whether the doctor takes new patients, dated by their list", () => {
		const activities = [
			activity(1, "404101", "accepting", "si-zzzs-zob"),
			activity(1, "404103", "closed", "si-zzzs-zob"),
			activity(2, "302001", "closed", "si-zzzs-sa"),
			activity(1, "404101", "accepting", "si-zzzs-zob"),
			activity(1, "999999", null, "owner"),
		];
		expect(slovenianActivitiesAt(activities, 1, { "si-zzzs-zob": "2026-11-27" })).toEqual([
			{ kind: "dentalAdults", acceptance: "accepting", asOf: "2026-11-27" },
			{ kind: "dentalYouth", acceptance: "closed", asOf: "2026-11-27" },
			{ kind: "other", acceptance: null, asOf: null },
		]);
		expect(slovenianActivitiesAt(activities, 3, {})).toEqual([]);
		expect(Object.keys(SI_ACTIVITY_KEYS)).toHaveLength(8);
	});
});

describe("Slovenia's search words and pages", () => {
	it("resolve in Slovenia only, and carry another market's search over", () => {
		expect(suggestListings("zoboz", "sl-SI").map((entry) => entry.slug)).toEqual(["zobozdravnik"]);
		expect(resolveListing("Družinska medicina", "SI")).toBe("druzinski-zdravnik");
		expect(resolveListing("Zobozdravniki", "AT")).toBeNull();
		expect(translateSearchTerm("dentiste", "FR", "SI")).toEqual({
			kind: "listing",
			slug: "zobozdravnik",
		});
		expect(translateSearchTerm("Kinderarzt", "AT", "SI")).toEqual({
			kind: "listing",
			slug: "otroski-zdravnik",
		});
		expect(translateSearchTerm("pharmacie", "FR", "SI")).toEqual({ kind: "unlisted" });
		expect(listingLabel("ginekolog", "sl-SI")).toBeTruthy();
	});

	it("print doctors as physicians and dentists, with their field", () => {
		expect(medicalSpecialtiesOf("otroski-zdravnik")).toEqual(["https://schema.org/Pediatric"]);
		const node = (professionCode: string) =>
			practitionerNodes({
				url: "https://apercura.org/si/zdravnik/ana-primer-si99001",
				professionCode,
				rpps: "99001",
				idScheme: "SI-ZZZS",
				country: "SI",
				name: "Ana Primer",
				givenName: "Ana",
				familyName: "Primer",
				honorificPrefix: null,
				occupation: "Družinska medicina",
				listingSlug: "druzinski-zdravnik",
				languages: [],
				photoUrl: null,
				website: null,
				places: [],
				bookingUrl: null,
			})[0] as { "@type": string };
		expect(node("SI_FAMILY_DOCTOR")["@type"]).toBe("IndividualPhysician");
		expect(node("SI_GYNAECOLOGIST")["@type"]).toBe("IndividualPhysician");
		expect(node("SI_DENTIST")["@type"]).toBe("Dentist");
	});

	it("have sitemaps of their own under /si, with Slovenian route segments", () => {
		expect(marketPagePath("si", "/")).toBe("/si");
		expect(marketPagePath("si", "/praticien/ana-primer-si99001")).toBe(
			"/si/zdravnik/ana-primer-si99001",
		);
		expect(marketPagePath("si", "/annuaire/osrednjeslovenska")).toBe(
			"/si/imenik/osrednjeslovenska",
		);
		expect(marketPagePath("si", "/zobozdravnik/osrednjeslovenska/ljubljana")).toBe(
			"/si/zobozdravnik/osrednjeslovenska/ljubljana",
		);
		expect(marketPagePath("si", "/mentions-legales")).toBe("/si/pravno-obvestilo");
		expect(MARKET_STATIC_PATHS.si).toContain("/accessibilite");
		expect(MARKET_STATIC_PATHS.si).not.toContain("/pro");
		expect(sitemapCountryOf("si")).toBe("SI");
		const chunk = { market: "si", kind: "praticiens", chunk: 0, lastmod: "2026-11-27", urls: 3 };
		expect(inEveryLanguage([chunk as never]).map((item) => item.market)).toEqual(["si"]);
	});
});
