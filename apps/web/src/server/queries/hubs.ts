import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { NOT_DEPARTMENT_CITY, REGION_LISTING_MARKETS } from "~/lib/places";
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
export type RegionGroup = {
	code: string;
	name: string;
	/** Slug of the region, where it has pages of its own (the UK), else empty. */
	slug: string;
	departments: PlaceCount[];
};

export type DirectoryIndex = { available: boolean; regions: RegionGroup[] };

/**
 * Departments of a market with at least one practitioner, grouped by region.
 * Austria has no regions: its Bundesländer come in one group without a name. The UK's
 * local authorities are grouped by England's regions and the other nations.
 */
export async function getDirectoryIndex(country = "FR"): Promise<DirectoryIndex> {
	"use cache";
	cacheTag(cacheTags.coarse.listing, cacheTags.coarse.place);
	if (!hasDatabaseUrl()) {
		cacheLife("minutes");
		return { available: false, regions: [] };
	}
	cacheLife("weeks");
	const rows = await getSql()<
		(PlaceCount & { regionCode: string; regionName: string; regionSlug: string })[]
	>`
		SELECT d.id, d.kind, d.code, d.name, d.slug, d.department_code AS "departmentCode",
			sum(lp.practitioner_count)::integer AS "practitionerCount",
			coalesce(r.code, '') AS "regionCode", coalesce(r.name, '') AS "regionName",
			coalesce(r.slug, '') AS "regionSlug"
		FROM directory.landing_pages lp
		JOIN directory.places d ON d.id = lp.place_id AND d.kind = 'department'
			AND d.country = ${country}
		LEFT JOIN directory.places r ON r.country = d.country AND r.kind = 'region'
			AND r.code = d.region_code
		GROUP BY d.id, r.code, r.name, r.slug
		-- UK authorities, Czech districts, Spanish and Italian provinces, German Kreise, Swiss
		-- districts and Estonian municipalities by name (their ONS, NUTS, INE, ISTAT, AGS, BFS and EHAK
		-- codes are no order a reader knows).
		ORDER BY r.name,
			CASE WHEN d.country IN ('GB', 'CZ', 'ES', 'IT', 'DE', 'CH', 'EE') THEN d.name ELSE d.code END
	`;
	const regions: RegionGroup[] = [];
	for (const { regionCode, regionName, regionSlug, ...department } of rows) {
		let region = regions.at(-1);
		if (!region || region.code !== regionCode) {
			region = {
				code: regionCode,
				name: regionName,
				slug: REGION_LISTING_MARKETS.has(country) ? regionSlug : "",
				departments: [],
			};
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

/** What a place hub of a market lists: specialties present, sub-places and establishments. */
export async function getPlaceHub(
	country: string,
	place: PlaceRef,
	isCity: boolean,
): Promise<PlaceHub> {
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
		place.kind === "region"
			? // A UK region: its local authorities.
				await sql<PlaceCount[]>`
					SELECT p.id, p.kind, p.code, p.name, p.slug, p.department_code AS "departmentCode",
						sum(lp.practitioner_count)::integer AS "practitionerCount"
					FROM directory.landing_pages lp
					JOIN directory.places p ON p.id = lp.place_id AND p.kind = 'department'
					WHERE p.country = ${country} AND p.region_code = ${place.code}
					GROUP BY p.id
					ORDER BY sum(lp.practitioner_count) DESC, p.name, p.id
				`
			: place.kind === "department"
				? await sql<PlaceCount[]>`
					SELECT p.id, p.kind, p.code, p.name, p.slug, p.department_code AS "departmentCode",
						sum(lp.practitioner_count)::integer AS "practitionerCount"
					FROM directory.landing_pages lp
					JOIN directory.places p ON p.id = lp.place_id
					LEFT JOIN directory.places parent ON parent.id = p.parent_id
					WHERE p.country = ${country} AND p.department_code = ${place.code}
						AND (p.kind = 'commune' OR (p.kind = 'arrondissement'
							AND NOT (${sql.unsafe(NOT_DEPARTMENT_CITY("parent"))})))
						AND ${sql.unsafe(NOT_DEPARTMENT_CITY("p"))}
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
				OR (pl.department_code = ${departmentCode} AND pl.country = ${country}))
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

/** Department slugs of a market prerendered at build time. */
export async function sampleDepartmentSlugs(limit: number, country = "FR"): Promise<string[]> {
	const rows = await getSql()<{ slug: string }[]>`
		SELECT d.slug FROM directory.landing_pages lp
		JOIN directory.places d ON d.id = lp.place_id AND d.kind = 'department'
			AND d.country = ${country}
		GROUP BY d.slug
		ORDER BY sum(lp.practitioner_count) DESC, d.slug
		LIMIT ${limit}
	`;
	return rows.map((row) => row.slug);
}

export type MarketOverview = {
	available: boolean;
	/** Practitioners with an indexable page, by profession code. */
	professions: { professionCode: string; practitionerCount: number }[];
	/** The market's largest specialty listings (market-wide pages). */
	listings: ListingCount[];
	/** Date (YYYY-MM-DD, UTC) of the latest page change, the figures' date. */
	updatedAt: string | null;
};

/**
 * What a market's home shows of its directory: how many practitioners have a page, by
 * profession, and its largest listings. Read from the read models of the market only.
 */
export async function getMarketOverview(country: string, limit = 12): Promise<MarketOverview> {
	"use cache";
	cacheTag(cacheTags.coarse.listing, cacheTags.coarse.practitioner);
	if (!hasDatabaseUrl()) {
		cacheLife("minutes");
		return { available: false, professions: [], listings: [], updatedAt: null };
	}
	cacheLife("days");
	const sql = getSql();
	const professions = await sql<{ professionCode: string; practitionerCount: number }[]>`
		SELECT payload->>'professionCode' AS "professionCode", count(*)::integer AS "practitionerCount"
		FROM directory.practitioner_pages
		WHERE indexable AND country = ${country}
		GROUP BY 1
		ORDER BY 2 DESC, 1
	`;
	const listings = await sql<ListingCount[]>`
		SELECT listing_slug AS "listingSlug", practitioner_count AS "practitionerCount", indexable
		FROM directory.landing_pages
		WHERE place_id IS NULL AND country = ${country} AND indexable
		ORDER BY practitioner_count DESC, listing_slug
		LIMIT ${limit}
	`;
	const [latest] = await sql<{ updatedAt: string | null }[]>`
		SELECT to_char(max(content_updated_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "updatedAt"
		FROM directory.practitioner_pages WHERE indexable AND country = ${country}
	`;
	return { available: true, professions, listings, updatedAt: latest?.updatedAt ?? null };
}
