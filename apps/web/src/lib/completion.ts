/**
 * The completion checklist of an owned page: what patients look for, in the order the editor
 * and the agenda settings let the owner fill it in. Plain data, shared by the statistics page,
 * the dashboard and their tests.
 */

export const CHECKLIST_ITEMS = [
	"published",
	"photo",
	"bio",
	"languages",
	"fees",
	"paymentMethods",
	"accessibility",
	"hours",
	"booking",
] as const;

export type ChecklistItem = (typeof CHECKLIST_ITEMS)[number];

/** Where each item is completed: the page editor or the agenda settings (owner only). */
export const CHECKLIST_TARGET: Record<ChecklistItem, "editor" | "agenda"> = {
	published: "editor",
	photo: "editor",
	bio: "editor",
	languages: "editor",
	fees: "editor",
	paymentMethods: "editor",
	accessibility: "editor",
	hours: "agenda",
	booking: "agenda",
};

export interface CompletionInput {
	publishedAt: Date | string | null;
	photo: unknown;
	bio: string | null;
	languages: readonly string[];
	fees: { items: readonly unknown[] };
	paymentMethods: readonly string[];
	accessibility: {
		stepFree: boolean | null;
		lift: boolean | null;
		parking: boolean | null;
		notes: string | null;
	};
	/** At least one weekly opening window in an agenda of this page. */
	hasHours: boolean;
	/** An agenda of this page is open to online booking. */
	bookingOpen: boolean;
}

export interface Completion {
	items: { key: ChecklistItem; done: boolean }[];
	done: number;
	total: number;
	/** Whole percent, rounded down: 100 only once every item is done. */
	score: number;
}

export function completionOf(input: CompletionInput): Completion {
	const a = input.accessibility;
	const state: Record<ChecklistItem, boolean> = {
		published: input.publishedAt !== null,
		photo: Boolean(input.photo),
		bio: Boolean(input.bio?.trim()),
		languages: input.languages.length > 0,
		fees: input.fees.items.length > 0,
		paymentMethods: input.paymentMethods.length > 0,
		accessibility:
			a.stepFree !== null || a.lift !== null || a.parking !== null || Boolean(a.notes?.trim()),
		hours: input.hasHours,
		booking: input.bookingOpen,
	};
	const items = CHECKLIST_ITEMS.map((key) => ({ key, done: state[key] }));
	const done = items.filter((item) => item.done).length;
	return {
		items,
		done,
		total: items.length,
		score: Math.floor((done / items.length) * 100),
	};
}
