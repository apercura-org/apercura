import { describe, expect, it } from "vitest";
import { CHECKLIST_ITEMS, CHECKLIST_TARGET, completionOf } from "./completion";

const empty = {
	publishedAt: null,
	photo: null,
	bio: null,
	languages: [],
	fees: { items: [] },
	paymentMethods: [],
	accessibility: { stepFree: null, lift: null, parking: null, notes: null },
	hasHours: false,
	bookingOpen: false,
};

describe("completion checklist", () => {
	it("starts at zero for a page with nothing added", () => {
		const completion = completionOf(empty);
		expect(completion.score).toBe(0);
		expect(completion.done).toBe(0);
		expect(completion.total).toBe(CHECKLIST_ITEMS.length);
		expect(completion.items.map((item) => item.key)).toEqual([...CHECKLIST_ITEMS]);
	});

	it("reaches 100 only when every item is done", () => {
		const full = completionOf({
			publishedAt: new Date(),
			photo: { key: "x", url: "/x" },
			bio: "Cabinet de médecine générale (exemple).",
			languages: ["fr"],
			fees: { items: [{ label: "Consultation", amount: 30 }] },
			paymentMethods: ["card"],
			accessibility: { stepFree: true, lift: null, parking: null, notes: null },
			hasHours: true,
			bookingOpen: true,
		});
		expect(full.score).toBe(100);
		const almost = completionOf({ ...empty, publishedAt: new Date(), bookingOpen: true });
		expect(almost.done).toBe(2);
		expect(almost.score).toBe(22);
	});

	it("does not count a blank presentation or blank accessibility notes", () => {
		const blank = completionOf({
			...empty,
			bio: "   ",
			accessibility: { stepFree: null, lift: null, parking: null, notes: "  " },
		});
		expect(blank.items.find((item) => item.key === "bio")?.done).toBe(false);
		expect(blank.items.find((item) => item.key === "accessibility")?.done).toBe(false);
		// "No step-free access" is an answer too.
		const answered = completionOf({
			...empty,
			accessibility: { stepFree: false, lift: null, parking: null, notes: null },
		});
		expect(answered.items.find((item) => item.key === "accessibility")?.done).toBe(true);
	});

	it("sends agenda items to the agenda settings, the rest to the editor", () => {
		expect(CHECKLIST_TARGET.hours).toBe("agenda");
		expect(CHECKLIST_TARGET.booking).toBe("agenda");
		expect(CHECKLIST_TARGET.photo).toBe("editor");
	});
});
