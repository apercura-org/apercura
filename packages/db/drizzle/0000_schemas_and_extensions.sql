-- Custom migration: Postgres schemas and extensions every later migration relies on.
-- Requires a role allowed to run CREATE EXTENSION (see DATABASE_URL_MIGRATE).
CREATE SCHEMA IF NOT EXISTS directory;--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS care;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;
