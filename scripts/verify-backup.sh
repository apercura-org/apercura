#!/usr/bin/env bash
# Restores an Apercura database dump into a throwaway PostgreSQL container and runs smoke
# queries on it: the restore is the only proof that a backup works.
#
#   scripts/verify-backup.sh apercura-2026-11-22.dump
#
# The dump is a `pg_dump -Fc` of the whole database (docs/self-hosting.md#backups-and-restore).
# The container publishes no port, runs on a private Docker network and is removed on exit;
# nothing touches the database the dump came from. Patient fields stay encrypted: the check
# never needs, and never reads, the encryption keys.
#
# Checks: the restore itself, the extensions and schemas, the applied migrations, the booking
# overlap constraint, the database roles' grants (app, import, read-only), and row counts.
#
# Environment:
#   VERIFY_IMAGE              PostGIS image to restore into (default: the one CI uses)
#   VERIFY_MIN_PRACTITIONERS  fail below this many practitioners (default 1; 0 for an empty base)
#   VERIFY_EXPECTED_MIGRATIONS  fail unless exactly this many migrations are recorded
#                               (default: the number of migrations in packages/db/drizzle)
# Exit code 0 when every check passes, 1 otherwise.
set -euo pipefail

dump="${1:-}"
if [ -z "$dump" ] || [ ! -f "$dump" ]; then
	echo "usage: $0 <pg_dump custom-format file>" >&2
	exit 2
fi
command -v docker >/dev/null || { echo "docker is required" >&2; exit 2; }

root="$(cd "$(dirname "$0")/.." && pwd)"
image="${VERIFY_IMAGE:-postgis/postgis:17-3.7}"
min_practitioners="${VERIFY_MIN_PRACTITIONERS:-1}"
expected_migrations="${VERIFY_EXPECTED_MIGRATIONS:-$(find "$root/packages/db/drizzle" -maxdepth 1 -name '[0-9]*.sql' | wc -l | tr -d ' ')}"
name="apercura-verify-backup-$$"
password="verify-$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"

cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

echo "Starting a throwaway database ($image)…"
# The PostGIS image is published for amd64 only (arm64 hosts run it emulated).
docker run -d --name "$name" --network none --platform "${VERIFY_PLATFORM:-linux/amd64}" \
	-e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=postgres \
	"$image" >/dev/null
# The image runs its init scripts on a temporary server that only listens on the Unix socket,
# then restarts: the final server is the one answering on TCP (loopback, inside the container).
ready=false
for _ in $(seq 1 120); do
	if docker exec "$name" pg_isready -h 127.0.0.1 -U postgres -d postgres -q 2>/dev/null; then
		ready=true
		break
	fi
	sleep 1
done
if [ "$ready" != true ]; then
	echo "FAIL the throwaway database did not start" >&2
	docker logs "$name" 2>&1 | tail -n 20 >&2
	exit 1
fi
# A database from template0: the image's own init scripts add PostGIS objects to the default
# one, which the dump would then collide with.
docker exec "$name" createdb -h 127.0.0.1 -U postgres -T template0 apercura

sql() { docker exec -i "$name" psql -h 127.0.0.1 -U postgres -d apercura -v ON_ERROR_STOP=1 -tA "$@"; }

# Roles are cluster objects, not part of the dump: create them (no login) so the grants restore.
sql -c "DO \$\$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'apercura_app') THEN CREATE ROLE apercura_app NOLOGIN; END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'apercura_etl') THEN CREATE ROLE apercura_etl NOLOGIN; END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'apercura_readonly') THEN CREATE ROLE apercura_readonly NOLOGIN; END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'apercura_jobs') THEN CREATE ROLE apercura_jobs NOLOGIN; END IF;
END \$\$;" >/dev/null

echo "Restoring $(basename "$dump") ($(du -h "$dump" | cut -f1))…"
docker cp "$dump" "$name:/tmp/backup.dump"
started=$(date +%s)
if ! docker exec "$name" pg_restore -h 127.0.0.1 -U postgres -d apercura --exit-on-error --no-owner /tmp/backup.dump; then
	echo "FAIL restore: pg_restore reported an error" >&2
	exit 1
fi
echo "Restored in $(($(date +%s) - started)) s."

failures=0
check() { # label, SQL returning a single boolean
	local result
	result=$(sql -c "$2" 2>&1) || result="error: $result"
	if [ "$result" = "t" ]; then
		echo "ok   $1"
	else
		echo "FAIL $1 ($result)"
		failures=$((failures + 1))
	fi
}

check "extensions postgis, pg_trgm, unaccent, btree_gist" \
	"select count(*) = 4 from pg_extension where extname in ('postgis', 'pg_trgm', 'unaccent', 'btree_gist')"
check "schemas directory and care" \
	"select count(*) = 2 from pg_namespace where nspname in ('directory', 'care')"
check "$expected_migrations migrations recorded" \
	"select count(*) = $expected_migrations from drizzle.__drizzle_migrations"
check "booking overlap constraint (care.appointments_no_overlap)" \
	"select exists (select 1 from pg_constraint where conname = 'appointments_no_overlap' and contype = 'x')"
check "app role writes appointments" \
	"select has_table_privilege('apercura_app', 'care.appointments', 'INSERT')"
check "app role cannot rewrite the audit log" \
	"select not (has_table_privilege('apercura_app', 'care.audit_events', 'UPDATE') or has_table_privilege('apercura_app', 'care.audit_events', 'DELETE'))"
check "only the jobs role may purge the audit logs" \
	"select has_function_privilege('apercura_jobs', 'care.purge_audit_events(integer)', 'EXECUTE') and not has_function_privilege('apercura_app', 'care.purge_audit_events(integer)', 'EXECUTE')"
check "import role cannot reach patient data" \
	"select not has_schema_privilege('apercura_etl', 'care', 'USAGE')"
check "import role writes the directory" \
	"select has_table_privilege('apercura_etl', 'directory.practitioners', 'INSERT')"
check "read-only role reads the directory and writes nothing" \
	"select has_table_privilege('apercura_readonly', 'directory.practitioners', 'SELECT') and not has_table_privilege('apercura_readonly', 'directory.practitioners', 'INSERT')"
check "at least $min_practitioners practitioner(s)" \
	"select count(*) >= $min_practitioners from directory.practitioners"
check "the public read model is filled" \
	"select (select count(*) from directory.practitioners where status = 'active') = 0 or exists (select 1 from directory.practitioner_pages)"

echo
echo "Row counts:"
sql -F ' ' -c "
	select 'directory.practitioners', count(*) from directory.practitioners
	union all select 'directory.sites', count(*) from directory.sites
	union all select 'directory.activities', count(*) from directory.activities
	union all select 'directory.user', count(*) from directory.\"user\"
	union all select 'directory.claims', count(*) from directory.claims
	union all select 'care.calendars', count(*) from care.calendars
	union all select 'care.appointments', count(*) from care.appointments
	union all select 'care.audit_events', count(*) from care.audit_events
" | sed 's/^/  /'
last_import=$(sql -c "select coalesce(max(finished_at)::text, 'none') from directory.etl_runs where status = 'succeeded'" 2>/dev/null || echo "unknown")
echo "  latest succeeded import: $last_import"

echo
if [ "$failures" -gt 0 ]; then
	echo "$failures check(s) failed: this backup does not restore into a working Apercura database." >&2
	exit 1
fi
echo "Backup verified: it restores, and the restored database has its schema, constraints and grants."
