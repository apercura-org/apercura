ALTER TABLE "care"."calendars" ADD COLUMN "ics_token_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "care"."calendars" ADD COLUMN "ics_full_names" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- The read-only role sees the feed option, never the token hash (see 0010_care_grants.sql).
GRANT SELECT (ics_token_created_at, ics_full_names) ON care.calendars TO apercura_readonly;
