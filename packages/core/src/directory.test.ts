import { describe, expect, it } from "vitest";
import {
	isLandingIndexable,
	landingRoute,
	pageCount,
	parsePageSegment,
	parseSearchQuery,
	practitionerRoute,
	publicActivities,
} from "./directory";
import { parsePractitionerSegment } from "./slugs";
import { isListingSlug, isReservedSegment, RESERVED_SEGMENTS } from "./taxonomy";

// Synthetic, Luhn-valid number: it does not identify anyone.
const RPPS = "10000000009";
const SLUG = `exemple-martin-${RPPS}`;
const office = { practiceKind: "office", hasSite: true };

describe("practitioner route", () => {
	it("rejects a bad Luhn check before any lookup", () => {
		expect(parsePractitionerSegment("exemple-martin-10000000008")).toBeNull();
	});

	it("serves the canonical slug with the read model's indexing", () => {
		expect(practitionerRoute(SLUG, { slug: SLUG, indexable: true, activities: [office] })).toEqual({
			kind: "page",
			indexable: true,
		});
		expect(practitionerRoute(SLUG, { slug: SLUG, indexable: false, activities: [office] })).toEqual(
			{ kind: "page", indexable: false },
		);
	});

	it("redirects (308) when the name part differs", () => {
		for (const segment of [`autre-nom-${RPPS}`, RPPS, `exemple-${RPPS}`]) {
			expect(
				practitionerRoute(segment, { slug: SLUG, indexable: true, activities: [office] }),
			).toEqual({ kind: "redirect", to: SLUG });
		}
	});

	it("answers 404 when there is no page (unknown, removed, suppressed)", () => {
		expect(practitionerRoute(SLUG, null)).toEqual({ kind: "not_found" });
	});

	it("answers 404 without a public activity at a place", () => {
		const record = (activities: { practiceKind: string; hasSite: boolean }[]) => ({
			slug: SLUG,
			indexable: false,
			activities,
		});
		expect(practitionerRoute(SLUG, record([]))).toEqual({ kind: "not_found" });
		expect(
			practitionerRoute(SLUG, record([{ practiceKind: "non_clinical", hasSite: true }])),
		).toEqual({ kind: "not_found" });
		expect(practitionerRoute(SLUG, record([{ practiceKind: "locum", hasSite: false }]))).toEqual({
			kind: "not_found",
		});
		expect(practitionerRoute(SLUG, record([{ practiceKind: "locum", hasSite: true }]))).toEqual({
			kind: "page",
			indexable: false,
		});
	});

	it("keeps only public activities, in order", () => {
		const activities = [
			{ practiceKind: "hospital", hasSite: true, id: 1 },
			{ practiceKind: "non_clinical", hasSite: true, id: 2 },
			{ practiceKind: "office", hasSite: true, id: 3 },
		];
		expect(publicActivities(activities).map((activity) => activity.id)).toEqual([1, 3]);
	});
});

describe("landing thresholds", () => {
	it("answers 404 without practitioners", () => {
		expect(landingRoute(null)).toEqual({ kind: "not_found" });
		expect(landingRoute({ practitionerCount: 0, indexable: false })).toEqual({
			kind: "not_found",
		});
	});

	it("is noindex,follow below the threshold and indexed from it", () => {
		expect(landingRoute({ practitionerCount: 1, indexable: false })).toEqual({
			kind: "page",
			indexable: false,
		});
		expect(landingRoute({ practitionerCount: 3, indexable: true })).toEqual({
			kind: "page",
			indexable: true,
		});
	});

	it.each([
		[1, false, false],
		[2, false, false],
		[3, false, true],
		[2, true, true],
		[1, true, false],
		[12, false, true],
	])("%i practitioners, was indexed %s -> indexed %s", (count, was, expected) => {
		expect(isLandingIndexable(count, was)).toBe(expected);
	});
});

describe("page segments", () => {
	it("parses page numbers and flags the non-canonical ones", () => {
		expect(parsePageSegment("2")).toEqual({ page: 2, canonical: true });
		expect(parsePageSegment("1")).toEqual({ page: 1, canonical: false });
		expect(parsePageSegment("02")).toEqual({ page: 2, canonical: false });
		expect(parsePageSegment("0")).toBeNull();
		expect(parsePageSegment("paris-15e-arrondissement")).toBeNull();
		expect(parsePageSegment("123456")).toBeNull();
	});

	it("counts pages", () => {
		expect(pageCount(0)).toBe(1);
		expect(pageCount(20)).toBe(1);
		expect(pageCount(21)).toBe(2);
	});
});

describe("reserved segments", () => {
	it("never treats a reserved first segment as a listing", () => {
		for (const segment of RESERVED_SEGMENTS) {
			expect(isReservedSegment(segment)).toBe(true);
			expect(isListingSlug(segment)).toBe(false);
		}
		expect(isListingSlug("cardiologue")).toBe(true);
		expect(isListingSlug("sage-femme")).toBe(true);
		expect(isListingSlug("inconnu")).toBe(false);
	});
});

describe("search query", () => {
	it("trims, reads the department hint, an RPPS and a postcode", () => {
		expect(parseSearchQuery({ quoi: "  cardiologue ", ou: "Saint-Denis (974)" })).toEqual({
			who: "cardiologue",
			where: "Saint-Denis",
			departmentHint: "974",
		});
		expect(parseSearchQuery({ quoi: "100 000 000 09", ou: "75015" })).toMatchObject({
			rpps: RPPS,
			postcode: "75015",
		});
		expect(parseSearchQuery({ ou: "Ajaccio (2a)" }).departmentHint).toBe("2A");
	});

	it("reads browser coordinates and ignores invalid ones", () => {
		expect(parseSearchQuery({ pres: "48.8566,2.3522" }).near).toEqual({
			lat: 48.8566,
			lon: 2.3522,
		});
		expect(parseSearchQuery({ pres: "91,2" }).near).toBeUndefined();
		expect(parseSearchQuery({ pres: "here" }).near).toBeUndefined();
		expect(parseSearchQuery({}).who).toBe("");
	});
});
