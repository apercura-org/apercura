import { describe, expect, it } from "vitest";
import { buildFeed, initials } from "./ics-feed";

const entry = {
	id: "8a7c1f1e-0000-4000-8000-000000000001",
	kind: "appointment" as const,
	status: "confirmed",
	typeName: "Consultation",
	startsAt: new Date("2026-11-23T08:00:00Z"),
	endsAt: new Date("2026-11-23T08:15:00Z"),
	revision: 2,
	patient: { firstName: "Jean-Marie", lastName: "Exemple Martin" },
};

const options = {
	name: "Agenda Apercura",
	stampedAt: new Date("2026-11-22T10:00:00Z"),
	host: "apercura.example",
	labels: { block: "Bloqué", pending: "[Demande]", appointment: "Rendez-vous" },
};

describe("private calendar feed", () => {
	it("prints initials by default and full names only when asked", () => {
		expect(initials("Jean-Marie", "Exemple Martin")).toBe("J. M. E. M.");
		expect(initials(null, "exemple")).toBe("E.");
		const feed = buildFeed({ ...options, entries: [entry], fullNames: false });
		expect(feed).toContain("SUMMARY:Consultation · J. M. E. M.");
		expect(feed).not.toContain("Exemple Martin");
		expect(buildFeed({ ...options, entries: [entry], fullNames: true })).toContain(
			"SUMMARY:Consultation · Jean-Marie Exemple Martin",
		);
	});

	it("publishes stable events: UID, SEQUENCE = revision, UTC times, requests tentative", () => {
		const feed = buildFeed({
			...options,
			fullNames: false,
			entries: [
				entry,
				{ ...entry, id: "b", status: "pending", revision: 1 },
				{ ...entry, id: "c", kind: "block", typeName: null, patient: null },
			],
		});
		expect(feed.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
		expect(feed).toContain("METHOD:PUBLISH\r\n");
		expect(feed).toContain(`UID:${entry.id}@apercura.example\r\n`);
		expect(feed).toContain("SEQUENCE:2\r\n");
		expect(feed).toContain("DTSTART:20261123T080000Z\r\n");
		expect(feed).toContain("SUMMARY:[Demande] Consultation · J. M. E. M.\r\nSTATUS:TENTATIVE");
		expect(feed).toContain("SUMMARY:Bloqué\r\n");
		expect(feed.endsWith("END:VCALENDAR\r\n")).toBe(true);
	});
});
