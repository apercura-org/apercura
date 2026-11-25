import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { label } from "~/lib/practitioner-view";
import { cacheTags } from "../cache-tags";
import { getSql } from "../db";
import type { PlaceRef, PractitionerLink } from "./types";

export type EstablishmentPage = {
	siteId: number;
	slug: string;
	name: string;
	kind: string;
	finessEt: string;
	addressLine: string | null;
	addressComplement: string | null;
	postcode: string | null;
	placeName: string | null;
	latitude: number | null;
	longitude: number | null;
	geoPrecision: string | null;
	phone: string | null;
	commune: PlaceRef | null;
	department: PlaceRef | null;
	/** Practitioners with a public page and a patient-facing activity here, alphabetical. */
	practitioners: (PractitionerLink & { indexable: boolean })[];
	updatedAt: string;
};

export type EstablishmentLookup =
	| { kind: "found"; page: EstablishmentPage }
	| { kind: "moved"; slug: string }
	| { kind: "not_found" };

/**
 * An establishment page by its slug, or by its trailing FINESS number when the
 * name part is outdated (308). An establishment without any practitioner page
 * has nothing to show: 404.
 */
export async function getEstablishment(slug: string, finess: string): Promise<EstablishmentLookup> {
	"use cache";
	// Practitioners joining or leaving are not tagged on the site: refreshed weekly.
	cacheLife("weeks");
	cacheTag(cacheTags.coarse.site);
	const sql = getSql();

	type Row = Omit<EstablishmentPage, "commune" | "department" | "practitioners"> & {
		placeId: number | null;
	};
	const [site] = await sql<Row[]>`
		SELECT s.id AS "siteId", s.slug, coalesce(s.finess_name, s.name, s.slug) AS name, s.kind,
			s.finess_et AS "finessEt", coalesce(s.geo_address_line, s.address_line) AS "addressLine",
			s.address_complement AS "addressComplement", s.postcode, pl.name AS "placeName",
			s.place_id AS "placeId",
			round(ST_Y(s.location::geometry)::numeric, 6)::float8 AS latitude,
			round(ST_X(s.location::geometry)::numeric, 6)::float8 AS longitude,
			s.geo_precision AS "geoPrecision", s.phone,
			to_char(s.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "updatedAt"
		FROM directory.sites s
		LEFT JOIN directory.places pl ON pl.id = s.place_id
		WHERE s.removed_at IS NULL AND s.slug IS NOT NULL
			AND (s.slug = ${slug} OR s.finess_et = ${finess})
		ORDER BY (s.slug = ${slug}) DESC, s.id
		LIMIT 1
	`;
	if (!site) return { kind: "not_found" };
	cacheTag(cacheTags.site(site.siteId));
	if (site.slug !== slug) return { kind: "moved", slug: site.slug };

	type Listed = PractitionerLink & { indexable: boolean };
	const rows = await sql<(Listed & { sort_last: string; sort_first: string })[]>`
		SELECT DISTINCT p.id, p.slug, p.title_code AS "titleCode", p.civility_code AS "civilityCode",
			p.first_name AS "firstName", p.last_name AS "lastName", p.listing_slug AS "listingSlug",
			p.indexable, directory.text_norm(p.last_name) AS sort_last,
			directory.text_norm(p.first_name) AS sort_first
		FROM directory.activities a
		JOIN directory.practitioners p ON p.id = a.practitioner_id AND p.status = 'active'
		JOIN directory.practitioner_pages pg ON pg.practitioner_id = p.id
		WHERE a.site_id = ${site.siteId} AND a.removed_at IS NULL AND NOT a.hidden
			AND a.practice_kind IN ('office', 'health_center', 'hospital')
		ORDER BY sort_last, sort_first, p.id
	`;
	if (rows.length === 0) return { kind: "not_found" };
	const practitioners: Listed[] = rows.map(
		({ sort_last: _last, sort_first: _first, ...item }) => item,
	);

	const places = site.placeId
		? await sql<PlaceRef[]>`
				SELECT c.id, c.kind, c.code, c.name, c.slug, c.department_code AS "departmentCode"
				FROM directory.places c WHERE c.id = ${site.placeId}
				UNION ALL
				SELECT d.id, d.kind, d.code, d.name, d.slug, d.department_code
				FROM directory.places c
				JOIN directory.places d ON d.country = c.country AND d.kind = 'department'
					AND d.code = c.department_code
				WHERE c.id = ${site.placeId}
			`
		: [];
	const { placeId: _placeId, ...rest } = site;
	rest.name = label(rest.name) ?? rest.name;
	rest.addressLine = label(rest.addressLine);
	rest.addressComplement = label(rest.addressComplement);
	return {
		kind: "found",
		page: {
			...rest,
			commune: places.find((place) => place.kind !== "department") ?? null,
			department: places.find((place) => place.kind === "department") ?? null,
			practitioners,
		},
	};
}

/** Establishment slugs prerendered at build time. */
export async function sampleEstablishmentSlugs(limit: number): Promise<string[]> {
	const rows = await getSql()<{ slug: string }[]>`
		SELECT s.slug FROM directory.sites s
		JOIN directory.activities a ON a.site_id = s.id AND a.removed_at IS NULL
			AND a.practice_kind IN ('hospital', 'health_center')
		JOIN directory.practitioners p ON p.id = a.practitioner_id AND p.indexable
		WHERE s.slug IS NOT NULL AND s.removed_at IS NULL
		GROUP BY s.slug
		ORDER BY count(DISTINCT p.id) DESC, s.slug
		LIMIT ${limit}
	`;
	return rows.map((row) => row.slug);
}
