import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { label } from "~/lib/practitioner-view";
import { cacheTags } from "../cache-tags";
import { getSql, hasDatabaseUrl } from "../db";
import type { PlaceRef } from "./types";

/*
 * Place hubs (`/annuaire`, `/annuaire/{dept}`, `/annuaire/{dept}/{commune}`).
 * Every practitioner has exactly one listing slug, so summing the
 * `landing_pages` counts of a place gives its number of distinct practitioners.
 */

export type ListingCount = { listingSlug: string; practitionerCount: number; indexable: boolean };
export type PlaceCount = PlaceRef & { practitionerCount: number };
export type RegionGroup = { code: string; name: string; departments: PlaceCount[] };

export type DirectoryIndex = { available: boolean; regions: RegionGroup[] };

/** Departments with at least one practitioner, grouped by region. */
export async function getDirectoryIndex(): Promise<DirectoryIndex> {
	"use cache";
	cacheTag(cacheTags.coarse.listing, cacheTags.coarse.place);
	if (!hasDatabaseUrl()) {
		cacheLife("minutes");
		return { available: false, regions: [] };
	}
	cacheLife("weeks");
	const rows = await getSql()<(PlaceCount & { regionCode: string; regionName: string })[]>`
		SELECT d.id, d.kind, d.code, d.name, d.slug, d.department_code AS "departmentCode",
			sum(lp.practitioner_count)::integer AS "practitionerCount",
			coalesce(r.code, '') AS "regionCode", coalesce(r.name, '') AS "regionName"
		FROM directory.landing_pages lp
		JOIN directory.places d ON d.id = lp.place_id AND d.kind = 'department'
		LEFT JOIN directory.places r ON r.kind = 'region' AND r.code = d.region_code
		GROUP BY d.id, r.code, r.name
		ORDER BY r.name, d.code
	`;
	const regions: RegionGroup[] = [];
	for (const { regionCode, regionName, ...department } of rows) {
		let region = regions.at(-1);
		if (!region || region.code !== regionCode) {
			region = { code: regionCode, name: regionName, departments: [] };
			regions.push(region);
		}
		region.departments.push(department);
	}
	return { available: true, regions };
}

export type EstablishmentCount = { slug: string; name: string; practitionerCount: number };

export type PlaceHub = {
	total: number;
	listings: ListingCount[];
	/** Communes of a department (Paris: its arrondissements), or a city's arrondissements. */
	places: PlaceCount[];
	establishments: EstablishmentCount[];
};

/** What a place hub lists: specialties present, sub-places and establishments. */
export async function getPlaceHub(place: PlaceRef, isCity: boolean): Promise<PlaceHub> {
	"use cache";
	cacheLife("weeks");
	cacheTag(cacheTags.coarse.listing, cacheTags.place(place.id));
	const sql = getSql();

	const listings = await sql<ListingCount[]>`
		SELECT listing_slug AS "listingSlug", practitioner_count AS "practitionerCount", indexable
		FROM directory.landing_pages
		WHERE place_id = ${place.id}
		ORDER BY practitioner_count DESC, listing_slug
	`;
	const total = listings.reduce((sum, listing) => sum + listing.practitionerCount, 0);

	const places =
		place.kind === "department"
			? await sql<PlaceCount[]>`
					SELECT p.id, p.kind, p.code, p.name, p.slug, p.department_code AS "departmentCode",
						sum(lp.practitioner_count)::integer AS "practitionerCount"
					FROM directory.landing_pages lp
					JOIN directory.places p ON p.id = lp.place_id
					LEFT JOIN directory.places parent ON parent.id = p.parent_id
					WHERE p.department_code = ${place.code}
						AND (p.kind = 'commune' OR (p.kind = 'arrondissement' AND parent.code = '75056'))
						AND p.code <> '75056'
					GROUP BY p.id
					ORDER BY sum(lp.practitioner_count) DESC, p.name, p.id
				`
			: isCity
				? await sql<PlaceCount[]>`
						SELECT p.id, p.kind, p.code, p.name, p.slug, p.department_code AS "departmentCode",
							sum(lp.practitioner_count)::integer AS "practitionerCount"
						FROM directory.landing_pages lp
						JOIN directory.places p ON p.id = lp.place_id
						WHERE p.parent_id = ${place.id} AND p.kind = 'arrondissement'
						GROUP BY p.id
						ORDER BY p.code
					`
				: [];

	const departmentCode = place.kind === "department" ? place.code : null;
	const establishments = await sql<EstablishmentCount[]>`
		SELECT s.slug, coalesce(s.finess_name, s.name) AS name,
			count(DISTINCT p.id)::integer AS "practitionerCount"
		FROM directory.sites s
		JOIN directory.places pl ON pl.id = s.place_id
		JOIN directory.activities a ON a.site_id = s.id AND a.removed_at IS NULL AND NOT a.hidden
			AND a.practice_kind IN ('hospital', 'health_center')
		JOIN directory.practitioners p ON p.id = a.practitioner_id AND p.indexable
		WHERE s.slug IS NOT NULL AND s.removed_at IS NULL
			AND (s.place_id = ${place.id} OR (${isCity} AND pl.parent_id = ${place.id})
				OR pl.department_code = ${departmentCode})
		GROUP BY s.slug, coalesce(s.finess_name, s.name)
		ORDER BY count(DISTINCT p.id) DESC, 2, 1
		LIMIT 24
	`;
	return {
		total,
		listings,
		places,
		establishments: establishments.map((item) => ({
			...item,
			name: label(item.name) ?? item.name,
		})),
	};
}

/** Department slugs prerendered at build time. */
export async function sampleDepartmentSlugs(limit: number): Promise<string[]> {
	const rows = await getSql()<{ slug: string }[]>`
		SELECT d.slug FROM directory.landing_pages lp
		JOIN directory.places d ON d.id = lp.place_id AND d.kind = 'department'
		GROUP BY d.slug
		ORDER BY sum(lp.practitioner_count) DESC, d.slug
		LIMIT ${limit}
	`;
	return rows.map((row) => row.slug);
}
