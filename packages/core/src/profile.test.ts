import { describe, expect, it } from "vitest";
import {
	bookingReadiness,
	feesStated,
	hasMarkup,
	normalizePlainText,
	normalizeWebsite,
} from "./profile";

describe("plain text", () => {
	it("normalizes whitespace and strips control and bidi characters", () => {
		expect(normalizePlainText("  Médecin \t généraliste\n")).toBe("Médecin généraliste");
		expect(normalizePlainText("a\u202eb\u0007c")).toBe("abc");
		expect(normalizePlainText("Line 1  \r\n\r\n\r\n\r\nLine 2", { multiline: true })).toBe(
			"Line 1\n\nLine 2",
		);
	});

	it("detects HTML, entities and Markdown links", () => {
		expect(hasMarkup("<b>bold</b>")).toBe(true);
		expect(hasMarkup("<img src=x onerror=alert(1)>")).toBe(true);
		expect(hasMarkup("Tom &amp; Jerry")).toBe(true);
		expect(hasMarkup("[site](https://example.test)")).toBe(true);
		expect(hasMarkup("Consultations < 30 min, enfants > 6 ans")).toBe(false);
		expect(hasMarkup("Cabinet & centre")).toBe(false);
	});
});

describe("website", () => {
	it("accepts http(s) URLs and adds https when the scheme is missing", () => {
		expect(normalizeWebsite("cabinet-exemple.test")).toBe("https://cabinet-exemple.test/");
		expect(normalizeWebsite("http://cabinet-exemple.test/rdv")).toBe(
			"http://cabinet-exemple.test/rdv",
		);
	});

	it("refuses other schemes, credentials and bare words", () => {
		expect(normalizeWebsite("javascript:alert(1)")).toBeNull();
		expect(normalizeWebsite("https://user:pass@cabinet-exemple.test")).toBeNull();
		expect(normalizeWebsite("localhost")).toBeNull();
		expect(normalizeWebsite("")).toBeNull();
	});
});

describe("booking readiness (R.4127-53 II)", () => {
	const fees = { items: [{ label: "Consultation", amount: 30 }] };
	const now = new Date("2026-11-21T10:00:00Z");

	it("needs fees and payment methods", () => {
		expect(feesStated(fees)).toBe(true);
		expect(feesStated({ items: [{ label: " ", amount: 30 }] })).toBe(false);
		expect(
			bookingReadiness({
				verified: true,
				bookingOpensAt: null,
				fees: null,
				paymentMethods: [],
				now,
			}),
		).toEqual({ ready: false, blockers: ["fees", "paymentMethods"] });
	});

	it("waits for verification and the 7-day period", () => {
		const later = new Date("2026-11-28T10:00:00Z");
		expect(
			bookingReadiness({
				verified: true,
				bookingOpensAt: later,
				fees,
				paymentMethods: ["card"],
				now,
			}).blockers,
		).toEqual(["waitingPeriod"]);
		expect(
			bookingReadiness({
				verified: false,
				bookingOpensAt: null,
				fees,
				paymentMethods: ["card"],
				now,
			}).blockers,
		).toEqual(["notVerified"]);
		expect(
			bookingReadiness({
				verified: true,
				bookingOpensAt: now,
				fees,
				paymentMethods: ["card"],
				now,
			}),
		).toEqual({ ready: true, blockers: [] });
	});
});
