import { describe, expect, it } from "vitest";
import {
	DEFAULT_VIEW_LIMITS,
	fromOurPage,
	isLikelyBot,
	optedOut,
	shouldCountView,
	ViewLimiter,
} from "./page-views";

const BROWSER =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const PHONE =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

const headers = (values: Record<string, string>) => new Headers(values);
const visit = (ip: string, extra: Record<string, string> = {}) =>
	headers({
		"user-agent": BROWSER,
		"sec-fetch-site": "same-origin",
		"x-forwarded-for": ip,
		...extra,
	});

describe("page views: who counts", () => {
	it("leaves crawlers, previews, monitors, headless browsers and scripts out", () => {
		for (const agent of [
			"Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
			"Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
			"facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
			"WhatsApp/2.23.20.0",
			"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0.0.0 Safari/537.36",
			"Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36 Chrome-Lighthouse",
			"curl/8.7.1",
			"python-requests/2.32.3",
			"Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)",
			"UptimeRobot/2.0",
			"",
		]) {
			expect(isLikelyBot(agent), agent).toBe(true);
		}
		expect(isLikelyBot(null)).toBe(true);
	});

	it("counts ordinary desktop and phone browsers", () => {
		expect(isLikelyBot(BROWSER)).toBe(false);
		expect(isLikelyBot(PHONE)).toBe(false);
	});

	it("honours Global Privacy Control and Do Not Track", () => {
		expect(optedOut(headers({ "sec-gpc": "1" }))).toBe(true);
		expect(optedOut(headers({ dnt: "1" }))).toBe(true);
		expect(optedOut(headers({ dnt: "0" }))).toBe(false);
	});

	it("only counts beacons from our own pages, never a prefetch", () => {
		expect(fromOurPage(headers({ "sec-fetch-site": "same-origin" }))).toBe(true);
		expect(fromOurPage(headers({ "sec-fetch-site": "cross-site" }))).toBe(false);
		expect(fromOurPage(headers({ "sec-fetch-site": "same-site" }))).toBe(false);
		expect(fromOurPage(headers({ "sec-purpose": "prefetch" }))).toBe(false);
		// Old browsers send no Sec-Fetch-Site: the limits still apply.
		expect(fromOurPage(headers({}))).toBe(true);
	});
});

describe("page views: limits kept in memory", () => {
	const now = Date.UTC(2026, 10, 25, 9, 0, 0);

	it("counts one view of a page per visitor every 30 minutes", () => {
		const limiter = new ViewLimiter();
		expect(limiter.allow("203.0.113.7", 1, now)).toBe(true);
		expect(limiter.allow("203.0.113.7", 1, now + 60_000)).toBe(false);
		expect(limiter.allow("203.0.113.8", 1, now + 60_000)).toBe(true);
		expect(limiter.allow("203.0.113.7", 2, now + 60_000)).toBe(true);
		expect(limiter.allow("203.0.113.7", 1, now + 31 * 60_000)).toBe(true);
	});

	it("treats an IPv6 /64 as one visitor", () => {
		const limiter = new ViewLimiter();
		expect(limiter.allow("2001:db8:1:2::10", 1, now)).toBe(true);
		expect(limiter.allow("2001:db8:1:2::99", 1, now)).toBe(false);
	});

	it("caps one visitor at 30 counted views an hour across pages", () => {
		const limiter = new ViewLimiter();
		let counted = 0;
		for (let page = 1; page <= 50; page++) {
			if (limiter.allow("198.51.100.4", page, now + page)) counted++;
		}
		expect(counted).toBe(DEFAULT_VIEW_LIMITS.perClientPerHour);
	});

	it("caps a page when visitors cannot be told apart (no trusted proxy)", () => {
		const limiter = new ViewLimiter({ ...DEFAULT_VIEW_LIMITS, perPageWithoutClientPerHour: 3 });
		const results = Array.from({ length: 5 }, (_, index) => limiter.allow(null, 9, now + index));
		expect(results).toEqual([true, true, true, false, false]);
	});

	it("forgets everything at the change of day (a new random key)", () => {
		const limiter = new ViewLimiter();
		expect(limiter.allow("203.0.113.7", 1, now)).toBe(true);
		expect(limiter.allow("203.0.113.7", 1, now + 24 * 3_600_000)).toBe(true);
	});

	it("stays bounded under a flood of distinct addresses", () => {
		const limiter = new ViewLimiter({ ...DEFAULT_VIEW_LIMITS, maxEntries: 100 });
		for (let index = 0; index < 1_000; index++) {
			limiter.allow(`10.0.${Math.floor(index / 250)}.${index % 250}`, 1, now);
		}
		expect(limiter.size).toBeLessThanOrEqual(100);
	});

	it("puts every rule together", () => {
		const limiter = new ViewLimiter();
		const options = { limiter, trustedProxies: "1" };
		expect(shouldCountView(visit("203.0.113.20"), 5, now, options)).toBe(true);
		expect(shouldCountView(visit("203.0.113.20"), 5, now, options)).toBe(false);
		expect(shouldCountView(visit("203.0.113.21", { dnt: "1" }), 5, now, options)).toBe(false);
		expect(
			shouldCountView(visit("203.0.113.22", { "sec-fetch-site": "cross-site" }), 5, now, options),
		).toBe(false);
		expect(
			shouldCountView(visit("203.0.113.23", { "user-agent": "curl/8.7.1" }), 5, now, options),
		).toBe(false);
	});
});
