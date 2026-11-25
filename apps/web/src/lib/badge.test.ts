import { describe, expect, it } from "vitest";
import { LOCALES } from "~/i18n/locales";
import { BADGE_HEIGHT, BADGE_WIDTH, badgeFile, badgeLocale, badgeSvg } from "./badge";
import { qrPath, qrSvgDocument } from "./qr";

const colors = { paper: "#ffffff", ink: "#1b2025", inkMuted: "#54585f", edge: "#71757a" };

describe("the embeddable badge", () => {
	it("has one file per interface locale, and nothing else resolves", () => {
		for (const locale of LOCALES) expect(badgeLocale(badgeFile(locale))).toBe(locale);
		for (const file of ["apercura-xx.svg", "apercura-fr.png", "../apercura-fr.svg", "fr.svg"]) {
			expect(badgeLocale(file), file).toBeNull();
		}
	});

	it("is plain SVG: no script, no external reference, escaped text", () => {
		const svg = badgeSvg({ lead: `Find <me> & "you"`, brand: "Apercura" }, colors);
		expect(svg).toContain(`width="${BADGE_WIDTH}" height="${BADGE_HEIGHT}"`);
		expect(svg).toContain("Find &lt;me&gt; &amp; &quot;you&quot;");
		expect(svg).not.toMatch(/<script|href=|url\(|@import|on\w+=/i);
	});
});

describe("QR codes", () => {
	it("draws the same modules in the page, the SVG file and the PNG", () => {
		const url = "https://apercura.example/fr/praticien/exemple-martin-10000000009";
		const { d, size } = qrPath(url);
		expect(size).toBeGreaterThan(21);
		const svg = qrSvgDocument(url, "QR code <test>");
		expect(svg).toContain(`viewBox="0 0 ${size} ${size}"`);
		expect(svg).toContain(d);
		expect(svg).toContain("<title>QR code &lt;test&gt;</title>");
		expect(svg).not.toMatch(/<script/i);
	});
});
