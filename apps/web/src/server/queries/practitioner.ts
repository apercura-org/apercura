import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { bookingEnabled } from "../booking/config";
import { cacheTags } from "../cache-tags";
import { getSql } from "../db";
import type { PlaceRef, PractitionerLink, PractitionerPayload } from "./types";

export type PractitionerPage = {
	practitionerId: number;
	slug: string;
	indexable: boolean;
	/** Date (YYYY-MM-DD, UTC) the page's facts last changed in the sources. */
	updatedAt: string;
	payload: PractitionerPayload;
	/** Primary commune or arrondissement, and its department. */
	commune: PlaceRef | null;
	department: PlaceRef | null;
	/** Which listing pages of the breadcrumb trail exist (no link to a 404). */
	listings: { france: boolean; department: boolean; commune: boolean };
	/** The next six practitioners of the same listing in the commune (ring by md5(RPPS)). */
	neighbours: PractitionerLink[];
	/**
	 * Online booking: open when the practitioner has an open agenda (and FEATURE_BOOKING is on).
	 * `nextFreeAt` (ISO instant) is the denormalized next free slot, read in `timeZone`. The
	 * booking module revalidates the page's tag whenever either changes.
	 */
	booking: { open: boolean; nextFreeAt: string | null; timeZone: string | null };
};

type PageRow = {
	practitionerId: number;
	slug: string;
	indexable: boolean;
	updatedAt: string;
	payload: PractitionerPayload;
	nextFreeAt: Date | null;
	bookingTimeZone: string | null;
};

/**
 * The practitioner page of an RPPS number, from the `practitioner_pages` read
 * model, or null when there is none (unknown, removed or suppressed). Cached
 * until the import revalidates `practitioner:{id}` (or `practitioner:*`).
 */
export async function getPractitionerPage(rpps: string): Promise<PractitionerPage | null> {
	"use cache";
	cacheTag(cacheTags.coarse.practitioner);
	const sql = getSql();

	const [row] = await sql<PageRow[]>`
		SELECT pg.practitioner_id AS "practitionerId", pg.slug, pg.indexable, pg.payload,
			to_char(pg.content_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "updatedAt",
			p.next_free_at AS "nextFreeAt",
			(SELECT c.time_zone FROM care.calendars c
				WHERE c.practitioner_id = p.id AND c.status = 'open'
				ORDER BY c.created_at LIMIT 1) AS "bookingTimeZone"
		FROM directory.practitioners p
		JOIN directory.practitioner_pages pg ON pg.practitioner_id = p.id
		WHERE p.country = 'FR' AND p.id_scheme = 'RPPS' AND p.national_id = ${rpps}
	`;
	if (!row) {
		// A page can appear with the next import; the import tags it by id, which
		// an unknown number does not have yet, so a miss is only kept for a day.
		// A known practitioner without a page (withheld, or removed by its owner, who
		// may restore it) is tagged by id: the import that brings the page back
		// expires the miss at once.
		const [known] = await sql<{ id: number }[]>`
			SELECT id FROM directory.practitioners
			WHERE country = 'FR' AND id_scheme = 'RPPS' AND national_id = ${rpps}
		`;
		if (known) cacheTag(cacheTags.practitioner(known.id));
		cacheLife("days");
		return null;
	}
	cacheLife("max");
	cacheTag(cacheTags.practitioner(row.practitionerId));

	const { payload } = row;
	const placeId = payload.primaryPlaceId;
	const places = placeId
		? await sql<PlaceRef[]>`
				SELECT c.id, c.kind, c.code, c.name, c.slug, c.department_code AS "departmentCode"
				FROM directory.places c WHERE c.id = ${placeId}
				UNION ALL
				SELECT d.id, d.kind, d.code, d.name, d.slug, d.department_code
				FROM directory.places c
				JOIN directory.places d ON d.kind = 'department' AND d.code = c.department_code
				WHERE c.id = ${placeId}
			`
		: [];
	const commune = places.find((place) => place.kind !== "department") ?? null;
	const department = places.find((place) => place.kind === "department") ?? null;
	if (commune) cacheTag(cacheTags.place(commune.id));

	const listingSlug = payload.listingSlug;
	const listings = { france: false, department: false, commune: false };
	let neighbours: PractitionerLink[] = [];
	if (listingSlug) {
		const keys = [
			`${listingSlug}:fr`,
			department ? `${listingSlug}:${department.id}` : null,
			commune ? `${listingSlug}:${commune.id}` : null,
		].filter((key): key is string => key !== null);
		const existing = await sql<{ key: string }[]>`
			SELECT key FROM directory.landing_pages WHERE key = ANY (${keys}::text[])
		`;
		const found = new Set(existing.map((item) => item.key));
		listings.france = found.has(`${listingSlug}:fr`);
		listings.department = department ? found.has(`${listingSlug}:${department.id}`) : false;
		listings.commune = commune ? found.has(`${listingSlug}:${commune.id}`) : false;
		if (commune) cacheTag(cacheTags.listing(listingSlug, commune.id));

		if (placeId) {
			// Ring of the indexable practitioners of the same listing in the same
			// commune, ordered by md5(RPPS): the six after this one, wrapping around.
			neighbours = await sql<PractitionerLink[]>`
				WITH ring AS (
					SELECT p.id, p.slug, p.title_code, p.civility_code, p.first_name, p.last_name,
						p.listing_slug, md5(p.national_id) AS position
					FROM directory.practitioners p
					WHERE p.indexable AND p.listing_slug = ${listingSlug}
						AND p.primary_place_id = ${placeId} AND p.id <> ${row.practitionerId}
				)
				SELECT id, slug, title_code AS "titleCode", civility_code AS "civilityCode",
					first_name AS "firstName", last_name AS "lastName", listing_slug AS "listingSlug"
				FROM ring
				ORDER BY (position <= md5(${payload.nationalId})), position
				LIMIT 6
			`;
			for (const neighbour of neighbours) cacheTag(cacheTags.practitioner(neighbour.id));
		}
	}

	return {
		practitionerId: row.practitionerId,
		slug: row.slug,
		indexable: row.indexable,
		updatedAt: row.updatedAt,
		payload,
		commune,
		department,
		listings,
		neighbours,
		booking: {
			open: bookingEnabled() && row.bookingTimeZone !== null,
			nextFreeAt: row.nextFreeAt ? new Date(row.nextFreeAt).toISOString() : null,
			timeZone: row.bookingTimeZone,
		},
	};
}

/**
 * A few practitioner slugs prerendered at build time (`generateStaticParams`
 * needs at least one with `ensureStatic`). Every other page is rendered on its
 * first request and cached.
 */
export async function samplePractitionerSlugs(limit: number): Promise<string[]> {
	const rows = await getSql()<{ slug: string }[]>`
		SELECT slug FROM directory.practitioner_pages
		WHERE indexable
		ORDER BY practitioner_id
		LIMIT ${limit}
	`;
	return rows.map((row) => row.slug);
}
