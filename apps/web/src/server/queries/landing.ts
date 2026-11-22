import "server-only";

import { LISTING_PAGE_SIZE } from "@apercura/core";
import { cacheLife, cacheTag } from "next/cache";
import { label } from "~/lib/practitioner-view";
import { cacheTags } from "../cache-tags";
import { getSql } from "../db";
import type { LandingPayload, PlaceRef, PractitionerLink } from "./types";

export type LandingRow = {
	id: number;
	key: string;
	practitionerCount: number;
	indexable: boolean;
	payload: LandingPayload;
	/** YYYY-MM-DD (UTC) of the last content change. */
	updatedAt: string;
};

export type ListedPractitioner = PractitionerLink & {
	billingSector: string | null;
	optam: string | null;
	carteVitale: boolean | null;
	practiceKind: string;
	siteName: string | null;
	addressLine: string | null;
	postcode: string | null;
	placeName: string | null;
};

export type NearbyPlace = PlaceRef & {
	practitionerCount: number;
	indexable: boolean;
	departmentSlug: string;
};

export type EstablishmentLink = { slug: string; name: string; practitionerCount: number };

export type LandingPage = {
	landing: LandingRow;
	rows: ListedPractitioner[];
	/** Other places of the same listing: communes of the department, or the nearest communes. */
	nearby: NearbyPlace[];
	establishments: EstablishmentLink[];
};

export type LandingScope = {
	listingSlug: string;
	/** Null for the France-wide specialty hub. */
	place: PlaceRef | null;
	/** Lyon and Marseille: the city groups its arrondissements. */
	isCity: boolean;
	page: number;
};

/**
 * One page of a listing (`listing slug x place`): the read-model row from
 * `landing_pages` (null when the listing has no practitioner there), its
 * practitioners in alphabetical order, nearby places and establishments.
 */
export async function getLandingPage(scope: LandingScope): Promise<LandingPage | null> {
	"use cache";
	// Lists and counts of neighbours change with other pages: refreshed weekly at
	// most, and at once when this listing's members change (its tag).
	cacheLife("weeks");
	const { listingSlug, place, isCity, page } = scope;
	cacheTag(cacheTags.coarse.listing, cacheTags.listing(listingSlug, place?.id ?? null));
	const sql = getSql();

	const key = `${listingSlug}:${place?.id ?? "fr"}`;
	const [landing] = await sql<LandingRow[]>`
		SELECT id, key, practitioner_count AS "practitionerCount", indexable, payload,
			to_char(content_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "updatedAt"
		FROM directory.landing_pages WHERE key = ${key}
	`;
	if (!landing) return null;

	const offset = (page - 1) * LISTING_PAGE_SIZE;
	const placeId = place?.id ?? null;
	const departmentCode = place?.kind === "department" ? place.code : null;
	// The France-wide hub links to departments; it does not list practitioners.
	const rows =
		!place || offset >= landing.practitionerCount
			? []
			: await sql<ListedPractitioner[]>`
				WITH members AS (
					SELECT DISTINCT ON (p.id) p.id, p.slug, p.title_code, p.civility_code, p.first_name,
						p.last_name, p.listing_slug, p.billing_sector, p.optam, p.carte_vitale,
						a.practice_kind, s.name AS site_name,
						coalesce(s.geo_address_line, s.address_line) AS address_line, s.postcode, pl.name AS place_name
					FROM directory.practitioners p
					JOIN directory.activities a ON a.practitioner_id = p.id AND a.removed_at IS NULL
						AND NOT a.hidden AND a.practice_kind IN ('office', 'health_center', 'hospital')
					JOIN directory.sites s ON s.id = a.site_id AND s.removed_at IS NULL
					JOIN directory.places pl ON pl.id = s.place_id
					WHERE p.indexable AND p.listing_slug = ${listingSlug}
						AND (
							s.place_id = ${placeId}
							OR (${isCity} AND pl.parent_id = ${placeId})
							OR pl.department_code = ${departmentCode}
						)
					ORDER BY p.id, a.is_primary DESC, a.id
				)
				SELECT id, slug, title_code AS "titleCode", civility_code AS "civilityCode",
					first_name AS "firstName", last_name AS "lastName", listing_slug AS "listingSlug",
					billing_sector AS "billingSector", optam, carte_vitale AS "carteVitale",
					practice_kind AS "practiceKind", site_name AS "siteName", address_line AS "addressLine",
					postcode, place_name AS "placeName"
				FROM members
				ORDER BY directory.text_norm(last_name), directory.text_norm(first_name), id
				LIMIT ${LISTING_PAGE_SIZE} OFFSET ${offset}
			`;
	for (const row of rows) {
		cacheTag(cacheTags.practitioner(row.id));
		row.siteName = label(row.siteName);
		row.addressLine = label(row.addressLine);
	}

	const nearby = await nearbyPlaces(listingSlug, place);
	const establishments = (place ? await establishmentsOf(listingSlug, place, isCity) : []).map(
		(item) => ({ ...item, name: label(item.name) ?? item.name }),
	);
	return { landing, rows, nearby, establishments };
}

/**
 * Places a listing page links to: every commune of the department (by count),
 * the nearest communes of a commune, or the departments of France.
 */
async function nearbyPlaces(listingSlug: string, place: PlaceRef | null): Promise<NearbyPlace[]> {
	const sql = getSql();
	if (!place) {
		return sql<NearbyPlace[]>`
			SELECT p.id, p.kind, p.code, p.name, p.slug, p.department_code AS "departmentCode",
				lp.practitioner_count AS "practitionerCount", lp.indexable, p.slug AS "departmentSlug"
			FROM directory.landing_pages lp
			JOIN directory.places p ON p.id = lp.place_id AND p.kind = 'department'
			WHERE lp.listing_slug = ${listingSlug}
			ORDER BY p.code
		`;
	}
	if (place.kind === "department") {
		return sql<NearbyPlace[]>`
			SELECT p.id, p.kind, p.code, p.name, p.slug, p.department_code AS "departmentCode",
				lp.practitioner_count AS "practitionerCount", lp.indexable,
				${place.slug} AS "departmentSlug"
			FROM directory.landing_pages lp
			JOIN directory.places p ON p.id = lp.place_id AND p.kind IN ('commune', 'arrondissement')
			WHERE lp.listing_slug = ${listingSlug} AND p.department_code = ${place.code}
			ORDER BY lp.practitioner_count DESC, p.name, p.id
			LIMIT 40
		`;
	}
	return sql<NearbyPlace[]>`
		SELECT p.id, p.kind, p.code, p.name, p.slug, p.department_code AS "departmentCode",
			lp.practitioner_count AS "practitionerCount", lp.indexable, d.slug AS "departmentSlug"
		FROM directory.places origin
		JOIN directory.landing_pages lp ON lp.listing_slug = ${listingSlug}
		JOIN directory.places p ON p.id = lp.place_id AND p.kind IN ('commune', 'arrondissement')
			AND p.id <> origin.id AND p.code <> '75056'
			AND (origin.parent_id IS NULL OR p.id <> origin.parent_id)
			AND (p.parent_id IS NULL OR p.parent_id <> origin.id)
		JOIN directory.places d ON d.kind = 'department' AND d.code = p.department_code
		WHERE origin.id = ${place.id} AND origin.centroid IS NOT NULL AND p.centroid IS NOT NULL
		ORDER BY p.centroid <-> origin.centroid, p.id
		LIMIT 8
	`;
}

/** Establishments (hospitals, health centres) where the listing's practitioners work in the place. */
async function establishmentsOf(
	listingSlug: string,
	place: PlaceRef,
	isCity: boolean,
): Promise<EstablishmentLink[]> {
	const sql = getSql();
	const departmentCode = place.kind === "department" ? place.code : null;
	return sql<EstablishmentLink[]>`
		SELECT s.slug, coalesce(s.finess_name, s.name) AS name,
			count(DISTINCT p.id)::integer AS "practitionerCount"
		FROM directory.practitioners p
		JOIN directory.activities a ON a.practitioner_id = p.id AND a.removed_at IS NULL
			AND NOT a.hidden AND a.practice_kind IN ('hospital', 'health_center')
		JOIN directory.sites s ON s.id = a.site_id AND s.removed_at IS NULL AND s.slug IS NOT NULL
		JOIN directory.places pl ON pl.id = s.place_id
		WHERE p.indexable AND p.listing_slug = ${listingSlug}
			AND (s.place_id = ${place.id} OR (${isCity} AND pl.parent_id = ${place.id})
				OR pl.department_code = ${departmentCode})
		GROUP BY s.slug, coalesce(s.finess_name, s.name)
		ORDER BY count(DISTINCT p.id) DESC, 2, 1
		LIMIT 12
	`;
}

/** Listing x place pairs prerendered at build time (largest pages first). */
export async function sampleLandingParams(limit: number) {
	return getSql()<{ listingSlug: string; departmentSlug: string; placeSlug: string | null }[]>`
		SELECT lp.listing_slug AS "listingSlug",
			CASE WHEN p.kind = 'department' THEN p.slug ELSE d.slug END AS "departmentSlug",
			CASE WHEN p.kind = 'department' THEN NULL ELSE p.slug END AS "placeSlug"
		FROM directory.landing_pages lp
		JOIN directory.places p ON p.id = lp.place_id
		LEFT JOIN directory.places d ON d.kind = 'department' AND d.code = p.department_code
		WHERE lp.indexable
		ORDER BY lp.practitioner_count DESC, lp.id
		LIMIT ${limit}
	`;
}

/** Specialty hubs prerendered at build time. */
export async function sampleListingSlugs(limit: number): Promise<string[]> {
	const rows = await getSql()<{ slug: string }[]>`
		SELECT listing_slug AS slug FROM directory.landing_pages
		WHERE place_id IS NULL AND indexable
		ORDER BY practitioner_count DESC, listing_slug
		LIMIT ${limit}
	`;
	return rows.map((row) => row.slug);
}
