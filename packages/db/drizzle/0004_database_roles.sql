-- Custom migration: database roles and grants.
--
-- - apercura_app:      the web app, read/write on `directory` and `care`.
-- - apercura_etl:      the open data import, `directory` only. No access to
--                      `care`; cannot write practitioner-owned data.
-- - apercura_readonly: support and audits, read-only on both schemas.
--
-- Roles are created idempotently, NOLOGIN and without a password: passwords are
-- set outside migrations (see docs/data-import.md), e.g.
--   ALTER ROLE apercura_etl WITH LOGIN PASSWORD '...';
-- Creating roles needs CREATEROLE. On a managed database where the migration
-- user lacks it, create the three roles beforehand: this migration then only
-- applies the grants. Requires PostgreSQL 17+ (MAINTAIN privilege).
DO $$
DECLARE
	role_name text;
BEGIN
	FOREACH role_name IN ARRAY ARRAY['apercura_app', 'apercura_etl', 'apercura_readonly'] LOOP
		IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
			EXECUTE format('CREATE ROLE %I NOLOGIN', role_name);
		END IF;
	END LOOP;
	EXECUTE format(
		'GRANT CONNECT ON DATABASE %I TO apercura_app, apercura_etl, apercura_readonly',
		current_database()
	);
END
$$;
--> statement-breakpoint

-- No implicit access through PUBLIC.
REVOKE ALL ON SCHEMA directory FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON SCHEMA care FROM PUBLIC;
--> statement-breakpoint

-- apercura_app: everything on both schemas, now and for future tables.
GRANT USAGE ON SCHEMA directory, care TO apercura_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA directory, care TO apercura_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA directory, care TO apercura_app;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA directory TO apercura_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA directory, care
	GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO apercura_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA directory, care
	GRANT USAGE, SELECT ON SEQUENCES TO apercura_app;
--> statement-breakpoint

-- apercura_readonly: read everything, now and for future tables.
GRANT USAGE ON SCHEMA directory, care TO apercura_readonly;
--> statement-breakpoint
GRANT SELECT ON ALL TABLES IN SCHEMA directory, care TO apercura_readonly;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA directory, care GRANT SELECT ON TABLES TO apercura_readonly;
--> statement-breakpoint

-- apercura_etl: `directory` only, table by table. There are deliberately no
-- default privileges for this role: a new table stays out of its reach until a
-- migration grants it explicitly.
REVOKE ALL ON SCHEMA care FROM apercura_etl;
--> statement-breakpoint
GRANT USAGE ON SCHEMA directory TO apercura_etl;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA directory TO apercura_etl;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA directory TO apercura_etl;
--> statement-breakpoint

-- Import-owned tables and read models: full write access.
GRANT SELECT, INSERT, UPDATE, DELETE ON
	directory.meta,
	directory.places,
	directory.place_slug_aliases,
	directory.practitioner_qualifications,
	directory.sites,
	directory.etl_runs,
	directory.geocode_cache,
	directory.practitioner_pages,
	directory.landing_pages,
	directory.search_docs,
	directory.invalidation_outbox
TO apercura_etl;
--> statement-breakpoint

-- Staging and taxonomy mirrors: truncated and reloaded on every run, analyzed
-- after loading.
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, MAINTAIN ON
	directory.stg_ans_activities,
	directory.stg_ans_qualifications,
	directory.stg_finess,
	directory.stg_ameli,
	directory.stg_quarantine,
	directory.taxonomy_listing_slugs,
	directory.taxonomy_ameli_specialties
TO apercura_etl;
--> statement-breakpoint

-- Practitioner-owned tables: read-only (the public page merges them).
GRANT SELECT ON
	directory.practitioner_profiles,
	directory.practitioner_slug_aliases,
	directory.suppressions
TO apercura_etl;
--> statement-breakpoint

-- Mixed tables: the import may insert rows but only update the columns it owns.
-- practitioners: never slug, claim_status, owner_org_id, next_free_at.
-- activities: never hidden.
GRANT SELECT, INSERT ON directory.practitioners, directory.activities TO apercura_etl;
--> statement-breakpoint
GRANT UPDATE (
	national_pp_id, civility_code, title_code, first_name, last_name, first_name_source,
	last_name_source, profession_code, category_code, primary_specialty_code, listing_slug,
	primary_place_id, source_hash, qualifications_hash, source_seen_at, missing_runs, removed_at,
	billing_sector, optam, carte_vitale, apcv, ameli_matched_at, status, indexable, updated_at
) ON directory.practitioners TO apercura_etl;
--> statement-breakpoint
GRANT UPDATE (
	site_id, mode_code, role_code, sector_code, genre_code, skill_type_code, skill_code,
	registration_authority, practice_kind, is_primary, source_hash, source_seen_at, removed_at,
	updated_at
) ON directory.activities TO apercura_etl;
