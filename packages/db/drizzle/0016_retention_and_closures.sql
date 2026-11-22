CREATE TABLE "care"."organization_closures" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"requested_by" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purge_by" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "care"."organization_closures" ADD CONSTRAINT "organization_closures_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "directory"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_created_idx" ON "care"."audit_events" USING btree ("created_at");--> statement-breakpoint

-- Custom migration: retention of the audit logs, practice closures, session IP addresses.
--
-- 1. apercura_jobs: the role of the retention sub-job of `jobs:tick` (DATABASE_URL_JOBS). It has
--    no table privilege at all: it may only call care.purge_audit_events(), which runs with the
--    rights of its owner (the migration role, owner of the tables). The app role stays
--    append-only on both audit logs and cannot call the function.
--    Created NOLOGIN without a password, like the roles of 0004 (on a managed database where the
--    migration user lacks CREATEROLE, create it beforehand); enable it with
--      ALTER ROLE apercura_jobs WITH LOGIN PASSWORD '...';
-- 2. Grants on care.organization_closures (same as the other booking tables).
-- 3. Practitioner sessions keep a truncated IP address (IPv4 /24, IPv6 /48), written by the app
--    (`truncateIp`); the rows stored before are truncated here. The read-only role reads neither
--    the address nor the user agent.
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'apercura_jobs') THEN
		CREATE ROLE apercura_jobs NOLOGIN;
	END IF;
	EXECUTE format('GRANT CONNECT ON DATABASE %I TO apercura_jobs', current_database());
END
$$;
--> statement-breakpoint
-- Name resolution of the function only: no table, sequence or default privilege.
GRANT USAGE ON SCHEMA care TO apercura_jobs;
--> statement-breakpoint

-- Deletes the rows of both audit logs older than the retention (in months, at least 6: the
-- CNIL recommends keeping access logs 6 months to a year). The cutoff is computed here from the
-- server clock, so a caller cannot erase recent rows by passing a date.
CREATE OR REPLACE FUNCTION care.purge_audit_events(p_retention_months integer)
RETURNS TABLE (care_rows bigint, platform_rows bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
	cutoff timestamptz;
BEGIN
	IF p_retention_months IS NULL OR p_retention_months < 6 THEN
		RAISE EXCEPTION 'audit log retention must be at least 6 months (got %)', p_retention_months
			USING ERRCODE = '22023';
	END IF;
	cutoff := now() - make_interval(months => p_retention_months);
	DELETE FROM care.audit_events WHERE created_at < cutoff;
	GET DIAGNOSTICS care_rows = ROW_COUNT;
	DELETE FROM directory.platform_audit_events WHERE created_at < cutoff;
	GET DIAGNOSTICS platform_rows = ROW_COUNT;
	RETURN NEXT;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION care.purge_audit_events(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION care.purge_audit_events(integer) TO apercura_jobs;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON care.organization_closures TO apercura_app;
--> statement-breakpoint
REVOKE ALL ON care.organization_closures FROM apercura_etl;
--> statement-breakpoint
GRANT SELECT ON care.organization_closures TO apercura_readonly;
--> statement-breakpoint

-- Same rule and text as `truncateIp` (apps/web/src/server/auth/client-ip.ts, which a test
-- compares with this function): `203.0.113.0/24`, `2001:db8:1::/48`; an IPv4-mapped IPv6
-- address counts as IPv4; anything that is not an address gives null.
CREATE OR REPLACE FUNCTION directory.truncate_ip(p_ip text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
	SELECT CASE
		WHEN p_ip ~* '^::ffff:[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' THEN
			CASE WHEN pg_input_is_valid(substring(p_ip FROM 8), 'inet')
				THEN text(network(set_masklen(substring(p_ip FROM 8)::inet, 24)))
			END
		WHEN pg_input_is_valid(p_ip, 'inet') THEN
			CASE family(p_ip::inet)
				WHEN 4 THEN text(network(set_masklen(p_ip::inet, 24)))
				ELSE text(network(set_masklen(p_ip::inet, 48)))
			END
	END
$$;
--> statement-breakpoint
UPDATE directory.session SET ip_address = directory.truncate_ip(ip_address)
WHERE ip_address IS NOT NULL;
--> statement-breakpoint
REVOKE SELECT (ip_address, user_agent) ON directory.session FROM apercura_readonly;
