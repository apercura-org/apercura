/**
 * Schema `directory`: open data (places, practitioners, sites, activities),
 * practitioner-owned data and the read models built from them.
 *
 * Ownership (see docs/data-import.md):
 * - Import-owned tables and columns are rewritten by `etl:fr` on every run.
 * - Practitioner/app-owned tables and columns are never written by the import;
 *   the `apercura_etl` database role cannot even update them.
 *
 * Codes (INSEE, department, FINESS, postcodes, RPPS) are always text.
 */
import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	bigint,
	boolean,
	check,
	doublePrecision,
	index,
	integer,
	jsonb,
	primaryKey,
	real,
	smallint,
	text,
	timestamp,
	unique,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { directory } from "./schemas";
import { geographyPoint } from "./types";

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

/** Small key/value table for directory-wide metadata (e.g. last import run). */
export const meta = directory.table("meta", {
	key: text().primaryKey(),
	value: text().notNull(),
	updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Places (import-owned)
// ---------------------------------------------------------------------------

/** Regions, departments, communes and municipal arrondissements (Paris, Lyon, Marseille). */
export const places = directory.table(
	"places",
	{
		id: integer().primaryKey().generatedAlwaysAsIdentity(),
		kind: text().notNull(),
		/** INSEE code of the commune or arrondissement, department or region code. */
		code: text().notNull(),
		name: text().notNull(),
		/** Stored once, never recomputed (a rename keeps the old slug as an alias). */
		slug: text().notNull(),
		/** Department of the place, read from the source, never cut from a code. */
		departmentCode: text(),
		regionCode: text(),
		parentId: integer().references((): AnyPgColumn => places.id),
		centroid: geographyPoint(),
		population: integer(),
		postcodes: text().array().notNull().default(sql`'{}'::text[]`),
		/** Set when a commune merged into another one (pages redirect with a 308). */
		successorId: integer().references((): AnyPgColumn => places.id),
		sourceHash: text(),
		removedAt: timestamp({ withTimezone: true }),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		uniqueIndex("places_kind_code_uq").on(table.kind, table.code),
		uniqueIndex("places_top_slug_uq")
			.on(table.slug)
			.where(sql`${table.kind} in ('region', 'department')`),
		uniqueIndex("places_local_slug_uq")
			.on(table.departmentCode, table.slug)
			.where(sql`${table.kind} in ('commune', 'arrondissement')`),
		index("places_parent_idx").on(table.parentId),
		index("places_postcodes_idx").using("gin", table.postcodes),
		index("places_centroid_idx").using("gist", table.centroid),
		check(
			"places_kind_check",
			sql`${table.kind} in ('region', 'department', 'commune', 'arrondissement')`,
		),
	],
);

/** Former slugs of a place (rename): they redirect to the current slug. */
export const placeSlugAliases = directory.table(
	"place_slug_aliases",
	{
		id: integer().primaryKey().generatedAlwaysAsIdentity(),
		placeId: integer()
			.notNull()
			.references(() => places.id, { onDelete: "cascade" }),
		/** Department scope of the slug; null for regions and departments. */
		departmentCode: text(),
		slug: text().notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		unique("place_slug_aliases_uq").on(table.departmentCode, table.slug).nullsNotDistinct(),
	],
);

// ---------------------------------------------------------------------------
// Practitioners
// ---------------------------------------------------------------------------

/**
 * One person, identified by a national id (RPPS in France).
 * Import-owned columns: identity, profession, specialty, Ameli fields, source_*.
 * App-owned or computed columns: slug (set once), status, claim_status,
 * owner_org_id, indexable, next_free_at.
 */
export const practitioners = directory.table(
	"practitioners",
	{
		id: integer().primaryKey().generatedAlwaysAsIdentity(),
		// --- import-owned ---
		country: text().notNull().default("FR"),
		idScheme: text().notNull().default("RPPS"),
		nationalId: text().notNull(),
		/** `8` + RPPS: the identifier returned by Pro Santé Connect. */
		nationalPpId: text(),
		civilityCode: text(),
		/** Exercise title code (DR, PR…). */
		titleCode: text(),
		firstName: text().notNull(),
		lastName: text().notNull(),
		/** Names exactly as published by the source. */
		firstNameSource: text().notNull(),
		lastNameSource: text().notNull(),
		professionCode: text().notNull(),
		categoryCode: text(),
		primarySpecialtyCode: text(),
		/** Listing slug derived from profession and primary specialty. */
		listingSlug: text(),
		primaryPlaceId: integer().references(() => places.id),
		sourceHash: text(),
		qualificationsHash: text(),
		sourceSeenAt: timestamp({ withTimezone: true }),
		/** Consecutive import runs in which the person was absent from the source. */
		missingRuns: smallint().notNull().default(0),
		removedAt: timestamp({ withTimezone: true }),
		billingSector: text(),
		optam: text(),
		carteVitale: boolean(),
		apcv: boolean(),
		ameliMatchedAt: timestamp({ withTimezone: true }),
		// --- app-owned or computed ---
		/** Canonical path segment `{prenom-nom}-{rpps}`, assigned once at creation. */
		slug: text().notNull(),
		status: text().notNull().default("active"),
		claimStatus: text().notNull().default("unclaimed"),
		ownerOrgId: text(),
		indexable: boolean().notNull().default(false),
		/** Next free slot, denormalized by the booking module for result cards. */
		nextFreeAt: timestamp({ withTimezone: true }),
		/**
		 * Set while a removal request (GDPR art. 21) on an unclaimed page is being
		 * checked: the page is hidden at once (not indexable, out of listings,
		 * searches and sitemaps). The import keeps it hidden and cannot clear it.
		 */
		withheldAt: timestamp({ withTimezone: true }),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		uniqueIndex("practitioners_national_id_uq").on(table.country, table.idScheme, table.nationalId),
		uniqueIndex("practitioners_slug_uq").on(table.slug),
		index("practitioners_primary_place_idx").on(table.primaryPlaceId),
		index("practitioners_listing_idx")
			.on(table.listingSlug, table.primaryPlaceId)
			.where(sql`${table.indexable}`),
		check(
			"practitioners_status_check",
			sql`${table.status} in ('active', 'removed', 'suppressed')`,
		),
		check(
			"practitioners_claim_status_check",
			sql`${table.claimStatus} in ('unclaimed', 'pending', 'claimed')`,
		),
	],
);

/** Specialties, competences, capacities and diplomas (import-owned). */
export const practitionerQualifications = directory.table(
	"practitioner_qualifications",
	{
		id: integer().primaryKey().generatedAlwaysAsIdentity(),
		practitionerId: integer()
			.notNull()
			.references(() => practitioners.id, { onDelete: "cascade" }),
		/** `savoir_faire` or `diploma`. */
		source: text().notNull(),
		/** Source type code: S, CEX, PAC, C, CAPA, DNQ… for skills; DE, CES… for diplomas. */
		typeCode: text().notNull(),
		code: text().notNull(),
		label: text(),
		createdAt: createdAt(),
	},
	(table) => [
		uniqueIndex("practitioner_qualifications_uq").on(
			table.practitionerId,
			table.source,
			table.typeCode,
			table.code,
		),
	],
);

/**
 * Owner-owned page content. Never written by the import. Every text is plain
 * text (no HTML, no Markdown): pages print it as text.
 */
export const practitionerProfiles = directory.table("practitioner_profiles", {
	practitionerId: integer()
		.primaryKey()
		.references(() => practitioners.id, { onDelete: "cascade" }),
	/** Storage key of the re-encoded photo (`photos/{random}.webp`). */
	photoKey: text(),
	headline: text(),
	bio: text(),
	/** ISO 639-1 codes. */
	languages: text().array().notNull().default(sql`'{}'::text[]`),
	/** Owner's statement, prefilled from Ameli (`0`…`3`, as in practitioners). */
	billingSector: text(),
	/** `{ items: [{ label, amount, maxAmount? }], note? }`, amounts in euros. */
	fees: jsonb(),
	optam: text(),
	carteVitale: boolean(),
	/** `card`, `cash`, `cheque`, `transfer`. */
	paymentMethods: text().array().notNull().default(sql`'{}'::text[]`),
	/** `{ stepFree?, lift?, parking?, notes? }`. */
	accessibility: jsonb(),
	website: text(),
	showPhone: boolean().notNull().default(true),
	expertises: text().array().notNull().default(sql`'{}'::text[]`),
	/** Owner fields hidden on the public page (`photo`, `headline`, `bio`, `languages`…). */
	hiddenFields: text().array().notNull().default(sql`'{}'::text[]`),
	/** Set by the last onboarding step: until then the public page shows registry facts only. */
	publishedAt: timestamp({ withTimezone: true }),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
});

/** Former practitioner slugs (owner-owned): they redirect with a 308. */
export const practitionerSlugAliases = directory.table(
	"practitioner_slug_aliases",
	{
		id: integer().primaryKey().generatedAlwaysAsIdentity(),
		practitionerId: integer()
			.notNull()
			.references(() => practitioners.id, { onDelete: "cascade" }),
		slug: text().notNull(),
		createdAt: createdAt(),
	},
	(table) => [uniqueIndex("practitioner_slug_aliases_slug_uq").on(table.slug)],
);

/** GDPR objections and takedowns: the import skips them and the page answers 404. */
export const suppressions = directory.table(
	"suppressions",
	{
		id: integer().primaryKey().generatedAlwaysAsIdentity(),
		country: text().notNull().default("FR"),
		idScheme: text().notNull().default("RPPS"),
		nationalId: text().notNull(),
		reason: text().notNull(),
		createdBy: text(),
		createdAt: createdAt(),
	},
	(table) => [
		uniqueIndex("suppressions_national_id_uq").on(table.country, table.idScheme, table.nationalId),
	],
);

// ---------------------------------------------------------------------------
// Sites and activities
// ---------------------------------------------------------------------------

/** A place of practice: registry structure, FINESS establishment or owner-added place. */
export const sites = directory.table(
	"sites",
	{
		id: integer().primaryKey().generatedAlwaysAsIdentity(),
		/** `ans`, `finess` or `owner`. */
		source: text().notNull(),
		/** Stable source id (ANS: "Identifiant technique de la structure"). */
		sourceKey: text().notNull(),
		kind: text().notNull(),
		sectorCode: text(),
		name: text(),
		legalName: text(),
		tradeName: text(),
		addressLine: text(),
		addressComplement: text(),
		distribution: text(),
		postcode: text(),
		/** Commune code as published (may be a whole PLM city or missing). */
		communeCode: text(),
		communeLabel: text(),
		countryCode: text(),
		/** Resolved commune or arrondissement. */
		placeId: integer().references(() => places.id),
		location: geographyPoint(),
		/** `address`, `street` or `city`. */
		geoPrecision: text(),
		/** `finess`, `geocoder` or `centroid`. */
		geoSource: text(),
		/**
		 * BAN label of the address ("34 Avenue du Général Sarrail 75016 Paris"),
		 * when the geocoder matched it with a high score in the site's own commune.
		 */
		geoLabel: text(),
		/**
		 * The street line as displayed: the registry's number with the BAN's
		 * (accented) street name, when they name the same street. Null otherwise;
		 * `addressLine` stays the registry text, the source and the fallback.
		 */
		geoAddressLine: text(),
		addressHash: text(),
		phone: text(),
		phone2: text(),
		fax: text(),
		/** `direct` or `switchboard` (number shared by many practitioners). */
		phoneKind: text(),
		email: text(),
		siret: text(),
		siren: text(),
		finessEt: text(),
		finessEj: text(),
		finessName: text(),
		finessCategoryCode: text(),
		/** Public slug `{name}-{finess}`, for establishments only, set once. */
		slug: text(),
		sourceHash: text(),
		sourceSeenAt: timestamp({ withTimezone: true }),
		removedAt: timestamp({ withTimezone: true }),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		uniqueIndex("sites_source_key_uq").on(table.source, table.sourceKey),
		uniqueIndex("sites_slug_uq").on(table.slug),
		index("sites_place_idx").on(table.placeId),
		index("sites_finess_et_idx").on(table.finessEt),
		index("sites_location_idx").using("gist", table.location),
		index("sites_sitemap_idx")
			.on(table.id)
			.where(sql`${table.slug} is not null and ${table.removedAt} is null`),
		check(
			"sites_kind_check",
			sql`${table.kind} in ('office', 'health_center', 'hospital', 'locum', 'non_clinical')`,
		),
		check("sites_geo_precision_check", sql`${table.geoPrecision} in ('address', 'street', 'city')`),
	],
);

/** Practitioner <-> site link with mode, role, sector and derived practice kind. */
export const activities = directory.table(
	"activities",
	{
		id: integer().primaryKey().generatedAlwaysAsIdentity(),
		practitionerId: integer()
			.notNull()
			.references(() => practitioners.id, { onDelete: "cascade" }),
		/** Null for a locum without a fixed place. */
		siteId: integer().references(() => sites.id),
		source: text().notNull(),
		/** Hash of (RPPS, structure, mode, role, sector, genre). */
		sourceKey: text().notNull(),
		modeCode: text(),
		roleCode: text(),
		sectorCode: text(),
		genreCode: text(),
		skillTypeCode: text(),
		skillCode: text(),
		registrationAuthority: text(),
		practiceKind: text().notNull(),
		isPrimary: boolean().notNull().default(false),
		/** App-owned: hidden by the practitioner on the public page. */
		hidden: boolean().notNull().default(false),
		sourceHash: text(),
		sourceSeenAt: timestamp({ withTimezone: true }),
		removedAt: timestamp({ withTimezone: true }),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		uniqueIndex("activities_source_key_uq").on(table.source, table.sourceKey),
		index("activities_practitioner_idx").on(table.practitionerId),
		index("activities_site_idx").on(table.siteId),
		check(
			"activities_practice_kind_check",
			sql`${table.practiceKind} in ('office', 'health_center', 'hospital', 'locum', 'non_clinical')`,
		),
	],
);

// ---------------------------------------------------------------------------
// Import bookkeeping
// ---------------------------------------------------------------------------

/** One row per import run: scope, files (size, sha256), stats, guards. */
export const etlRuns = directory.table(
	"etl_runs",
	{
		id: integer().primaryKey().generatedAlwaysAsIdentity(),
		source: text().notNull(),
		/** running, succeeded, failed, blocked, skipped, dry_run. */
		status: text().notNull(),
		scope: jsonb().notNull(),
		dryRun: boolean().notNull().default(false),
		approvedRunId: integer(),
		files: jsonb(),
		stats: jsonb(),
		guards: jsonb(),
		error: text(),
		peakRssBytes: bigint({ mode: "number" }),
		startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		finishedAt: timestamp({ withTimezone: true }),
	},
	(table) => [index("etl_runs_source_status_idx").on(table.source, table.status, table.id)],
);

/** Geocoder results keyed by normalized address (`line|postcode|citycode`). */
export const geocodeCache = directory.table("geocode_cache", {
	addressKey: text().primaryKey(),
	latitude: doublePrecision(),
	longitude: doublePrecision(),
	score: real(),
	resultType: text(),
	resultCitycode: text(),
	/** `address`, `street`, `city` or null when the address was not found. */
	precision: text(),
	/** BAN label of the result and its parts ("34 Avenue du Général Sarrail 75016 Paris"). */
	resultLabel: text(),
	resultHousenumber: text(),
	resultName: text(),
	resultStreet: text(),
	resultPostcode: text(),
	resultCity: text(),
	/**
	 * True when the row was written with the label columns above. Rows cached
	 * before they existed are geocoded again once, by the next online import.
	 */
	withLabels: boolean().notNull().default(false),
	provider: text().notNull(),
	geocodedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/**
 * Mirror of the taxonomy in `packages/core`, rewritten by each import so SQL
 * can join on it. `specialty_code` is '' for "no specialty".
 */
export const taxonomyListingSlugs = directory.table(
	"taxonomy_listing_slugs",
	{
		professionCode: text().notNull(),
		specialtyCode: text().notNull(),
		listingSlug: text().notNull(),
	},
	(table) => [primaryKey({ columns: [table.professionCode, table.specialtyCode] })],
);

/** Ameli specialty code -> compatible listing slugs (strict Ameli matching). */
export const taxonomyAmeliSpecialties = directory.table(
	"taxonomy_ameli_specialties",
	{
		ameliCode: text().notNull(),
		listingSlug: text().notNull(),
	},
	(table) => [primaryKey({ columns: [table.ameliCode, table.listingSlug] })],
);

// ---------------------------------------------------------------------------
// Read models (computed, written only when content_hash changes)
// ---------------------------------------------------------------------------

export const practitionerPages = directory.table(
	"practitioner_pages",
	{
		practitionerId: integer()
			.primaryKey()
			.references(() => practitioners.id, { onDelete: "cascade" }),
		slug: text().notNull(),
		listingSlug: text(),
		departmentCode: text(),
		payload: jsonb().notNull(),
		indexable: boolean().notNull(),
		contentHash: text().notNull(),
		contentUpdatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		index("practitioner_pages_sitemap_idx")
			.on(table.departmentCode, table.practitionerId)
			.where(sql`${table.indexable}`),
	],
);

/** Listing pages: specialty x (France | department | commune | arrondissement). */
export const landingPages = directory.table(
	"landing_pages",
	{
		id: integer().primaryKey().generatedAlwaysAsIdentity(),
		/** `{listing slug}:{place id | fr}`. */
		key: text().notNull(),
		listingSlug: text().notNull(),
		placeId: integer().references(() => places.id, { onDelete: "cascade" }),
		practitionerCount: integer().notNull(),
		payload: jsonb().notNull(),
		indexable: boolean().notNull(),
		contentHash: text().notNull(),
		contentUpdatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex("landing_pages_key_uq").on(table.key),
		index("landing_pages_sitemap_idx").on(table.id).where(sql`${table.indexable}`),
	],
);

/** Search documents. `name_norm` is precomputed: `unaccent` cannot be indexed. */
export const searchDocs = directory.table(
	"search_docs",
	{
		practitionerId: integer()
			.primaryKey()
			.references(() => practitioners.id, { onDelete: "cascade" }),
		nameNorm: text().notNull(),
		listingSlug: text(),
		placeIds: integer().array().notNull().default(sql`'{}'::integer[]`),
		location: geographyPoint(),
		payload: jsonb().notNull(),
		indexable: boolean().notNull(),
		contentHash: text().notNull(),
		contentUpdatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		index("search_docs_name_trgm_idx").using("gin", sql`${table.nameNorm} gin_trgm_ops`),
		index("search_docs_location_idx").using("gist", table.location),
		index("search_docs_place_ids_idx").using("gin", table.placeIds),
	],
);

/** Cache tags to invalidate, drained after the import commits. */
export const invalidationOutbox = directory.table(
	"invalidation_outbox",
	{
		id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
		tag: text().notNull(),
		runId: integer(),
		attempts: integer().notNull().default(0),
		lastError: text(),
		createdAt: createdAt(),
	},
	(table) => [uniqueIndex("invalidation_outbox_tag_uq").on(table.tag)],
);
