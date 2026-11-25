#!/bin/sh
# First start of the self-hosted database only (docker-entrypoint-initdb.d): creates the four
# roles of Apercura with the passwords of the environment. Migration 0004 then finds them
# and only applies the grants. A convenience, not a requirement: the `migrate` service
# (packages/db/src/roles.ts) sets the same passwords after the migrations on every deploy, so
# a password changes with its variable and a redeploy, and a stack where this file is not
# mounted (Coolify skips single-file bind mounts) still converges.
set -eu

: "${APERCURA_APP_DB_PASSWORD:?APERCURA_APP_DB_PASSWORD is required}"
: "${APERCURA_ETL_DB_PASSWORD:?APERCURA_ETL_DB_PASSWORD is required}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
	-v app_password="$APERCURA_APP_DB_PASSWORD" \
	-v etl_password="$APERCURA_ETL_DB_PASSWORD" \
	-v readonly_password="${APERCURA_READONLY_DB_PASSWORD:-}" \
	-v jobs_password="${APERCURA_JOBS_DB_PASSWORD:-}" <<'SQL'
SELECT format('CREATE ROLE apercura_app LOGIN PASSWORD %L', :'app_password') \gexec
SELECT format('CREATE ROLE apercura_etl LOGIN PASSWORD %L', :'etl_password') \gexec
-- Without a password the read-only role stays NOLOGIN (support and audits, enable it later).
SELECT CASE WHEN :'readonly_password' = ''
	THEN 'CREATE ROLE apercura_readonly NOLOGIN'
	ELSE format('CREATE ROLE apercura_readonly LOGIN PASSWORD %L', :'readonly_password')
END \gexec
-- The audit log retention of the scheduler (migration 0016 grants it one function, no table).
SELECT CASE WHEN :'jobs_password' = ''
	THEN 'CREATE ROLE apercura_jobs NOLOGIN'
	ELSE format('CREATE ROLE apercura_jobs LOGIN PASSWORD %L', :'jobs_password')
END \gexec
SQL
