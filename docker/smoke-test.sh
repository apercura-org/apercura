#!/bin/sh
# Smoke test of docker/compose.selfhost.yml from a clean state, on the SYNTHETIC fixtures of
# packages/etl/fixtures/fr (never real registry data). Used by CI; runs locally too:
#
#   docker/smoke-test.sh            # builds the image, starts the stack, checks it, removes it
#
# Throwaway secrets, its own project name and host port (SMOKE_PORT, default 3090). Everything,
# volumes included, is removed at the end unless SMOKE_KEEP=1.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
port="${SMOKE_PORT:-3090}"
project="${SMOKE_PROJECT:-apercura-smoke}"
image="${SMOKE_IMAGE:-apercura:smoke}"
work=$(mktemp -d)
env_file="$work/selfhost.env"

compose() {
	docker compose -p "$project" -f "$root/docker/compose.selfhost.yml" --env-file "$env_file" "$@"
}

cleanup() {
	status=$?
	if [ "$status" -ne 0 ]; then
		compose ps -a || true
		compose logs --no-color --tail 80 || true
	fi
	if [ "${SMOKE_KEEP:-0}" != "1" ]; then
		compose --profile dev --profile tools down -v --remove-orphans >/dev/null 2>&1 || true
	fi
	rm -rf "$work"
	exit "$status"
}
trap cleanup EXIT

hex() { openssl rand -hex 24; }

step() { printf '\n== %s\n' "$*"; }

step "Build the image"
docker build -f "$root/docker/Dockerfile" --build-arg "APP_URL=http://localhost:$port" -t "$image" "$root"

step "Write a throwaway environment"
{
	echo "APP_URL=http://localhost:$port"
	echo "APP_PORT=$port"
	echo "APERCURA_IMAGE=$image"
	echo "TRUSTED_PROXY_COUNT=0"
	echo "POSTGRES_PASSWORD=$(hex)"
	echo "APERCURA_APP_DB_PASSWORD=$(hex)"
	echo "APERCURA_ETL_DB_PASSWORD=$(hex)"
	echo "MINIO_ROOT_PASSWORD=$(hex)"
	echo "S3_SECRET_ACCESS_KEY=$(hex)"
	echo "MAILPIT_UI_PORT=$((port + 1))"
	docker run --rm "$image" keys
} >"$env_file"

step "Start the stack (postgres, migrate, minio, app, scheduler, mailpit)"
compose --profile dev up -d --wait --wait-timeout 300

step "Migrations are a no-op the second time"
compose run --rm --no-deps migrate | grep "Migrations applied"

step "Import the synthetic fixtures"
compose run --rm -v "$root/packages/etl/fixtures/fr:/fixtures:ro" etl --source-dir /fixtures --offline

step "Pages and health answer from the app container"
base="http://127.0.0.1:$port"
curl -fsS "$base/api/health" | grep -q '"ok"'
curl -fsS -o /dev/null "$base/"
curl -fsS -o /dev/null "$base/en"
slug=$(compose exec -T postgres psql -U postgres -d apercura -tA \
	-c "SELECT slug FROM directory.practitioner_pages WHERE indexable ORDER BY slug LIMIT 1")
test -n "$slug"
curl -fsS "$base/praticien/$slug" | grep -q "<h1"
echo "home, /en, /praticien/$slug and /api/health: OK"

step "Scheduled jobs run in the scheduler"
compose exec -T scheduler apercura jobs:tick | grep '"job":"tick"'

step "The import role cannot read patient data"
if compose exec -T postgres psql -U apercura_etl -d apercura -tA -c "SELECT 1 FROM care.appointments LIMIT 1" 2>/dev/null; then
	echo "apercura_etl can read care.appointments" >&2
	exit 1
fi

step "Smoke test passed"
