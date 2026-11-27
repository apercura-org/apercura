import { describe, expect, it } from "vitest";
import { allAtListingSlugs } from "./at";
import { allChListingSlugs } from "./ch";
import { allCzListingSlugs } from "./cz";
import { allDeTaxonomySlugs } from "./de";
import { allEeTaxonomySlugs } from "./ee";
import { allEsTaxonomySlugs } from "./es";
import {
	allFiListingSlugs,
	allFiTaxonomySlugs,
	FI_CHILD_HEALTH,
	FI_DENTAL,
	FI_EMERGENCY,
	FI_HEALTH_CENTRE,
	FI_HOSPITAL,
	FI_KIND_SLUGS,
	FI_LABORATORY,
	FI_MENTAL_HEALTH,
	FI_PROFESSIONS,
	FI_PUBLIC_ORGANIZATION_TYPES,
	FI_REHABILITATION,
	FI_RESERVED_SEGMENTS,
	type FiService,
	fiKindSlugOf,
	fiListingSlugFor,
	fiLocationKind,
	fiProfessionOfListingSlug,
	isFiListingSlug,
} from "./fi";
import { allListingSlugs } from "./fr";
import { allGbListingSlugs } from "./gb";
import { allItListingSlugs } from "./it";
import { allPlListingSlugs } from "./pl";

const service = (...classes: string[]): FiService => ({ classes, name: null });
const doctor = service("P5", "P5.1");

describe("the Finnish taxonomy", () => {
	it("tells a location's kind by its name, in Finnish or Swedish", () => {
		expect(fiLocationKind(["Hervannan terveysasema"], [doctor])).toBe(FI_HEALTH_CENTRE);
		expect(fiLocationKind(["Sysmän sote-keskus"], [doctor])).toBe(FI_HEALTH_CENTRE);
		expect(fiLocationKind(["Hälsostationen i Jakobstad"], [doctor])).toBe(FI_HEALTH_CENTRE);
		expect(fiLocationKind(["Keskustan hammashoitola"], [doctor])).toBe(FI_DENTAL);
		expect(fiLocationKind(["Kampin neuvola"], [doctor])).toBe(FI_CHILD_HEALTH);
		expect(fiLocationKind(["Tays Keskussairaala, yhteispäivystys Acuta"], [doctor])).toBe(
			FI_EMERGENCY,
		);
		expect(fiLocationKind(["Lasten tehovalvontaosasto, Tays Keskussairaala"], [doctor])).toBe(
			FI_HOSPITAL,
		);
		expect(fiLocationKind(["Kauhajoen psykiatrinen poliklinikka"], [doctor])).toBe(
			FI_MENTAL_HEALTH,
		);
		expect(fiLocationKind(["Lasten ja nuorten kuntoutuksen palvelupiste"], [doctor])).toBe(
			FI_REHABILITATION,
		);
		expect(fiLocationKind(["Katriinan sairaalan röntgen"], [doctor])).toBe(FI_LABORATORY);
		// Either name of a bilingual location.
		expect(fiLocationKind(["Palvelupiste", "Tandvården i Närpes"], [doctor])).toBe(FI_DENTAL);
	});

	it("falls back on the classes of the health services, never on primary care alone", () => {
		expect(fiLocationKind(["Haavakeskus"], [service("P5", "P5.6")])).toBe(FI_HOSPITAL);
		expect(fiLocationKind(["Saimaanraitti"], [service("P5.7", "P5.17")])).toBe(FI_MENTAL_HEALTH);
		expect(fiLocationKind(["Palvelupiste X"], [service("P5.10")])).toBe(FI_DENTAL);
		expect(fiLocationKind(["Diabeteshoitaja, Esimerkkilä"], [doctor])).toBeNull();
	});

	it("lists no school, home care, housing, social service, office or Kela point", () => {
		for (const name of [
			"Karjalan koulun opiskeluhuolto, Mynämäki",
			"Skolhälsovård, Holm skola",
			"Himangan kotihoito",
			"Nivalan ryhmäkoti Kestintupa",
			"Kempeleen sosiaalipalvelujen toimipiste",
			"Asiakaspalvelupiste Satasairaala",
			"Kelan asiointipiste",
			"Hoitotarvikejakelu, Reisjärvi",
			"Työterveyshuolto Pohde, Haapavesi",
			"Kourulan päiväkoti",
		]) {
			expect(fiLocationKind([name], [doctor, service("P5.6"), service("P5.7")]), name).toBeNull();
		}
		// No health service at all: a library, whatever its name.
		expect(fiLocationKind(["Esimerkkilän terveysasema"], [service("P20")])).toBeNull();
		expect(fiLocationKind(["Esimerkkilän terveysasema"], [])).toBeNull();
		// Food safety is not care.
		expect(fiLocationKind(["Ympäristöterveys"], [service("P5.21")])).toBeNull();
	});

	it("lists the locations of public organisers only", () => {
		for (const type of ["Region", "Municipality", "RegionalOrganization", "State", "SotePublic"]) {
			expect(FI_PUBLIC_ORGANIZATION_TYPES.has(type)).toBe(true);
		}
		for (const type of ["Company", "Organization", "SotePrivate"]) {
			expect(FI_PUBLIC_ORGANIZATION_TYPES.has(type)).toBe(false);
		}
	});

	it("lists every kind under its own listing", () => {
		expect(fiListingSlugFor(FI_HOSPITAL, null)).toBe("sairaalat");
		expect(fiListingSlugFor(FI_HEALTH_CENTRE)).toBe("terveysasemat");
		expect(fiListingSlugFor(FI_DENTAL)).toBe("hammashoitolat");
		expect(fiListingSlugFor(FI_LABORATORY, "P5.4")).toBe("laboratoriot-ja-kuvantaminen");
		expect(fiListingSlugFor("XX")).toBeNull();
	});

	it("never shares a listing or kind slug with another market", () => {
		const others = new Set([
			...allListingSlugs(),
			...allAtListingSlugs(),
			...allGbListingSlugs(),
			...allCzListingSlugs(),
			...allEsTaxonomySlugs(),
			...allItListingSlugs(),
			...allDeTaxonomySlugs(),
			...allChListingSlugs(),
			...allEeTaxonomySlugs(),
			...allPlListingSlugs(),
		]);
		expect([...allFiTaxonomySlugs()].filter((slug) => others.has(slug))).toEqual([]);
		for (const slug of allFiListingSlugs()) {
			expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
			expect(isFiListingSlug(slug)).toBe(true);
		}
		for (const segment of FI_RESERVED_SEGMENTS) expect(isFiListingSlug(segment)).toBe(false);
		// A kind is named in the singular, never as a listing.
		for (const slug of Object.values(FI_KIND_SLUGS)) expect(isFiListingSlug(slug)).toBe(false);
		expect(fiProfessionOfListingSlug("neuvolat")).toBe(FI_CHILD_HEALTH);
		expect(fiProfessionOfListingSlug("kardiologia")).toBeUndefined();
		expect(fiKindSlugOf(FI_DENTAL)).toBe("hammashoitola");
		expect(fiKindSlugOf(FI_EMERGENCY)).toBe("paivystyspiste");
		expect(fiKindSlugOf(null)).toBeNull();
		expect(Object.keys(FI_KIND_SLUGS).sort()).toEqual(Object.keys(FI_PROFESSIONS).sort());
	});
});
