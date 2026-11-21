/**
 * Status rules of the public directory pages, kept pure so they can be unit
 * tested and shared by the web app and the import.
 *
 * Every rule returns a decision the page applies before rendering anything:
 * `not_found` (404), `redirect` (308 to the canonical URL) or `page` with its
 * robots directive. Pages apply it before their first Suspense boundary so a
 * late `notFound()` can never turn into a 200.
 */
import type { PracticeKind } from "./taxonomy/types";

export type RouteDecision<Page> =
	| { kind: "not_found" }
	| { kind: "redirect"; to: string }
	| ({ kind: "page" } & Page);

/** The kinds a public page shows. `non_clinical` activities are never public. */
export const PUBLIC_PRACTICE_KINDS: readonly PracticeKind[] = [
	"office",
	"health_center",
	"hospital",
	"locum",
];

export type ActivitySummary = {
	practiceKind: PracticeKind | string;
	/** True when the activity is tied to a place with an address. */
	hasSite: boolean;
};

/**
 * Activities shown on a practitioner page: patient-facing or locum activities
 * at a place. People without a fixed place have no public page (they can still
 * claim their record from `/pro`), and non-clinical activities are not public.
 */
export function publicActivities<T extends ActivitySummary>(activities: readonly T[]): T[] {
	return activities.filter(
		(activity) =>
			activity.hasSite &&
			(PUBLIC_PRACTICE_KINDS as readonly string[]).includes(activity.practiceKind),
	);
}

export type PractitionerRecord = {
	/** Canonical segment `{prenom-nom}-{rpps}` from the read model. */
	slug: string;
	/** `indexable` from the read model (patient-facing activity at a commune). */
	indexable: boolean;
	activities: readonly ActivitySummary[];
};

/**
 * Decides what a practitioner URL answers, once the segment passed the Luhn
 * check (`parsePractitionerSegment`) and the read model was queried.
 *
 * - no page in the read model (unknown, removed after the grace period,
 *   suppressed on objection) or nothing public to show: 404;
 * - a segment that is not the canonical slug (wrong or outdated name): 308;
 * - otherwise the page, indexable only when the read model says so.
 */
export function practitionerRoute(
	segment: string,
	record: PractitionerRecord | null,
): RouteDecision<{ indexable: boolean }> {
	if (!record) return { kind: "not_found" };
	if (publicActivities(record.activities).length === 0) return { kind: "not_found" };
	if (segment !== record.slug) return { kind: "redirect", to: record.slug };
	return { kind: "page", indexable: record.indexable };
}

/** Practitioners a landing page needs before it is indexed. */
export const LANDING_INDEX_THRESHOLD = 3;
/** An indexed landing page is only deindexed below this count (no flapping). */
export const LANDING_DEINDEX_THRESHOLD = 2;

/**
 * Mirror of the indexing rule computed by `directory.refresh_landing_pages`:
 * indexed from 3 practitioners, and kept indexed down to 2 once it was.
 */
export function isLandingIndexable(count: number, wasIndexable: boolean): boolean {
	if (count >= LANDING_INDEX_THRESHOLD) return true;
	return wasIndexable && count >= LANDING_DEINDEX_THRESHOLD;
}

export type LandingRecord = { practitionerCount: number; indexable: boolean };

/**
 * A landing page exists only with at least one practitioner (0 -> 404); it is
 * `noindex,follow` until the read model marks it indexable.
 */
export function landingRoute(record: LandingRecord | null): RouteDecision<{ indexable: boolean }> {
	if (!record || record.practitionerCount < 1) return { kind: "not_found" };
	return { kind: "page", indexable: record.indexable };
}

/** Rows per page of a listing. */
export const LISTING_PAGE_SIZE = 20;
/** Page numbers have at most five digits; anything else is not a page number. */
const PAGE_SEGMENT = /^\d{1,5}$/;

/**
 * Parses a page-number path segment. Returns null when the segment is not a
 * page number at all (it may be a commune slug). `canonical` is false for page
 * 1 (served without a number) and for leading zeros: both redirect.
 */
export function parsePageSegment(segment: string): { page: number; canonical: boolean } | null {
	if (!PAGE_SEGMENT.test(segment)) return null;
	const page = Number(segment);
	if (page < 1) return null;
	return { page, canonical: page > 1 && String(page) === segment };
}

/** Number of pages for `total` rows (at least 1). */
export function pageCount(total: number, pageSize = LISTING_PAGE_SIZE): number {
	return Math.max(1, Math.ceil(total / pageSize));
}

export type SearchQuery = {
	/** Free text of "Who?" (name, specialty or profession), trimmed. */
	who: string;
	/** Free text of "Where?", without a trailing department hint. */
	where: string;
	/** Department code from a trailing `(75)` hint, when present. */
	departmentHint?: string;
	/** An 11-digit "Who?" is an RPPS lookup. */
	rpps?: string;
	/** Five digits in "Where?" are a postcode. */
	postcode?: string;
	/** Browser coordinates for "near me". */
	near?: { lat: number; lon: number };
};

const DEPARTMENT_HINT = /\s*\((\d{2,3}|2[ab])\)\s*$/i;

/** Normalizes the raw search parameters (`quoi`, `ou`, `pres`). Never throws. */
export function parseSearchQuery(params: {
	quoi?: string | null;
	ou?: string | null;
	pres?: string | null;
}): SearchQuery {
	const clean = (value: string | null | undefined) =>
		(value ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
	const who = clean(params.quoi);
	let where = clean(params.ou);
	const query: SearchQuery = { who, where };

	const hint = DEPARTMENT_HINT.exec(where);
	if (hint?.[1]) {
		query.departmentHint = hint[1].toUpperCase();
		where = where.slice(0, hint.index).trim();
		query.where = where;
	}
	const compactWho = who.replace(/\s/g, "");
	if (/^\d{11}$/.test(compactWho)) query.rpps = compactWho;
	if (/^\d{5}$/.test(where)) query.postcode = where;

	const near = /^(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/.exec(clean(params.pres));
	if (near?.[1] && near[2]) {
		const lat = Number(near[1]);
		const lon = Number(near[2]);
		if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) query.near = { lat, lon };
	}
	return query;
}
