import { describe, expect, it } from "vitest";
import { buildIcs, escapeText, foldLine, icsUtc } from "~/lib/ics";
import { ipBucket } from "~/server/rate-limit-key";
import { isExclusionViolation, isUniqueViolation } from "./errors";
import { formatSlot, manageUrl } from "./format";
import { RETRY_DELAYS_MS, retryDelay } from "./outbox-worker";

describe("iCalendar", () => {
	const base = {
		uid: "0b6f6c1e-0000-4000-8000-000000000001@apercura.example",
		startsAt: new Date("2026-12-01T08:30:00.000Z"),
		endsAt: new Date("2026-12-01T09:00:00.000Z"),
		stampedAt: new Date("2026-11-21T10:00:00.000Z"),
		summary: "Rendez-vous — Dr Exemple, Test; ok",
		location: "1 rue de l’Exemple, 75011 Paris",
		organizer: { name: "Apercura", email: "no-reply@apercura.example" },
		attendee: { name: "Alex Exemple", email: "alex@example.test" },
	};

	it("writes a REQUEST with a stable UID, SEQUENCE = revision and UTC times", () => {
		const ics = buildIcs({ ...base, method: "REQUEST", sequence: 3 });
		expect(ics).toContain("METHOD:REQUEST\r\n");
		expect(ics).toContain(`UID:${base.uid}\r\n`);
		expect(ics).toContain("SEQUENCE:3\r\n");
		expect(ics).toContain("DTSTART:20261201T083000Z\r\n");
		expect(ics).toContain("DTEND:20261201T090000Z\r\n");
		expect(ics).toContain("STATUS:CONFIRMED\r\n");
		expect(ics).toContain("SUMMARY:Rendez-vous — Dr Exemple\\, Test\\; ok");
		expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
	});

	it("writes a CANCEL for the same UID", () => {
		const ics = buildIcs({ ...base, method: "CANCEL", sequence: 4 });
		expect(ics).toContain("METHOD:CANCEL\r\n");
		expect(ics).toContain("STATUS:CANCELLED\r\n");
		expect(ics).toContain(`UID:${base.uid}\r\n`);
	});

	it("folds lines at 75 octets without splitting characters", () => {
		const line = `SUMMARY:${"é".repeat(80)}`;
		const folded = foldLine(line);
		for (const part of folded.split("\r\n")) {
			expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
		}
		expect(folded.replace(/\r\n /g, "")).toBe(line);
	});

	it("escapes text and formats UTC stamps", () => {
		expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
		expect(icsUtc(new Date("2027-03-28T01:00:00.000Z"))).toBe("20270328T010000Z");
	});
});

describe("retry schedule", () => {
	it("waits 1 min, 5 min, 15 min, 1 h and 4 h with ±10% jitter, then gives up", () => {
		RETRY_DELAYS_MS.forEach((delay, index) => {
			expect(retryDelay(index + 1, () => 0)).toBe(Math.round(delay * 0.9));
			expect(retryDelay(index + 1, () => 1)).toBe(Math.round(delay * 1.1));
		});
		expect(retryDelay(RETRY_DELAYS_MS.length + 1)).toBeNull();
	});
});

describe("client buckets", () => {
	it("groups IPv6 addresses by /64 and keeps IPv4 addresses whole", () => {
		expect(ipBucket("2001:db8:1:2:aaaa::1")).toBe("2001:db8:1:2::/64");
		expect(ipBucket("2001:db8:1:2:ffff:ffff:ffff:ffff")).toBe("2001:db8:1:2::/64");
		expect(ipBucket("2001:db8::1")).toBe("2001:db8:0:0::/64");
		expect(ipBucket("203.0.113.7")).toBe("203.0.113.7");
		expect(ipBucket("::ffff:203.0.113.7")).toBe("203.0.113.7");
	});
});

describe("formatting", () => {
	it("shows the UTC offset when the wall-clock time occurs twice", () => {
		// 2026-10-25: Paris goes back from 03:00 to 02:00. 00:30Z and 01:30Z are both 02:30.
		const first = formatSlot(Date.parse("2026-10-25T00:30:00Z"), "Europe/Paris", "fr");
		const second = formatSlot(Date.parse("2026-10-25T01:30:00Z"), "Europe/Paris", "fr");
		expect(first.time).toMatch(/02:30.*UTC\+2/);
		expect(second.time).toMatch(/02:30.*UTC\+1/);
		expect(formatSlot(Date.parse("2026-12-01T08:30:00Z"), "Europe/Paris", "fr").time).toBe("09:30");
	});

	it("keeps the manage token in the URL fragment", () => {
		const url = new URL(manageUrl("en", "token123"));
		expect(url.pathname).toBe("/en/rdv");
		expect(url.search).toBe("");
		expect(url.hash).toBe("#t=token123");
	});
});

describe("Postgres errors", () => {
	it("finds SQLSTATE codes through Drizzle's wrapping", () => {
		const wrapped = { cause: { code: "23P01" } };
		expect(isExclusionViolation(wrapped)).toBe(true);
		expect(isExclusionViolation({ code: "23505" })).toBe(false);
		expect(isUniqueViolation({ cause: { code: "23505", constraint_name: "x_uq" } }, "x_uq")).toBe(
			true,
		);
	});
});
