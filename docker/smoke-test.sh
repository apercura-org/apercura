#!/bin/sh
# Smoke test of the Compose files from a clean state, on the SYNTHETIC fixtures of
# packages/etl/fixtures/fr (never real registry data). Used by CI; runs locally too:
#
#   docker/smoke-test.sh            # both variants below, one after the other
#   docker/smoke-test.sh selfhost   # docker/compose.selfhost.yml: the whole stack
#   docker/smoke-test.sh external   # docker/compose.app.yml alone, against a PostGIS and a
#                                   # MinIO started apart, fresh and without any init script
#                                   # (the Coolify layout)
#
# Builds the image first unless SMOKE_BUILD=0 (and it exists). Throwaway secrets, its own
# project names, containers and host port (SMOKE_PORT, default 3090). Everything it creates,
# volumes included, is removed at the end unless SMOKE_KEEP=1.
set -eu

variant="${1:-all}"
root=$(cd "$(dirname "$0")/.." && pwd)
port="${SMOKE_PORT:-3090}"
base_project="${SMOKE_PROJECT:-apercura-smoke}"
image="${SMOKE_IMAGE:-apercura:smoke}"
# A fictitious publisher: production refuses to start without the facts of the legal pages,
# which static pages bake at build time.
publisher="Éditeur fictif du test de fumée"

case "$variant" in
all)
	"$0" selfhost
	SMOKE_BUILD=0 "$0" external
	exit 0
	;;
selfhost)
	project="$base_project"
	compose_file="$root/docker/compose.selfhost.yml"
	;;
external)
	project="$base_project-external"
	compose_file="$root/docker/compose.app.yml"
	;;
*)
	echo "Usage: $0 [all|selfhost|external]" >&2
	exit 2
	;;
esac

work=$(mktemp -d)
env_file="$work/smoke.env"
network="${project}_default"
# The external variant's data services, outside the Compose project.
db_container="$project-postgres"
s3_container="$project-minio"
# The app's image run apart, read-only and without valkey (see below).
readonly_container="$project-readonly"

compose() {
	docker compose -p "$project" -f "$compose_file" --env-file "$env_file" "$@"
}

cleanup() {
	status=$?
	if [ "$status" -ne 0 ]; then
		compose ps -a || true
		compose logs --no-color --tail 80 || true
		if [ "$variant" = external ]; then
			docker logs --tail 40 "$db_container" || true
		fi
	fi
	if [ "${SMOKE_KEEP:-0}" != "1" ]; then
		docker rm -f -v "$readonly_container" >/dev/null 2>&1 || true
		# The data containers first: they hold the project's network.
		if [ "$variant" = external ]; then
			docker rm -f -v "$db_container" "$s3_container" >/dev/null 2>&1 || true
		fi
		compose --profile dev --profile tools down -v --remove-orphans >/dev/null 2>&1 || true
	fi
	rm -rf "$work"
	exit "$status"
}
trap cleanup EXIT

hex() { openssl rand -hex 24; }

step() { printf '\n== [%s] %s\n' "$variant" "$*"; }

if [ "${SMOKE_BUILD:-1}" != "0" ] || ! docker image inspect "$image" >/dev/null 2>&1; then
	step "Build the image"
	docker build -f "$root/docker/Dockerfile" --build-arg "APP_URL=http://localhost:$port" \
		--build-arg "LEGAL_PUBLISHER_NAME=$publisher" -t "$image" "$root"
fi

step "Write a throwaway environment"
postgres_password=$(hex)
minio_password=$(hex)
{
	echo "APP_URL=http://localhost:$port"
	echo "APP_PORT=$port"
	echo "APERCURA_IMAGE=$image"
	echo "TRUSTED_PROXY_COUNT=0"
	echo "APERCURA_APP_DB_PASSWORD=$(hex)"
	echo "APERCURA_ETL_DB_PASSWORD=$(hex)"
	echo "APERCURA_JOBS_DB_PASSWORD=$(hex)"
	echo "MINIO_ROOT_PASSWORD=$minio_password"
	echo "S3_SECRET_ACCESS_KEY=$(hex)"
	echo "MAILPIT_UI_PORT=$((port + 1))"
	# Mailpit has no STARTTLS: the one case SMTP_ALLOW_INSECURE is meant for. The external
	# variant runs no Mailpit; nothing sends mail there.
	echo "SMTP_ALLOW_INSECURE=true"
	echo "LEGAL_PUBLISHER_NAME=$publisher"
	echo "LEGAL_PUBLISHER_LEGAL_FORM=Association fictive"
	echo "LEGAL_PUBLISHER_ADDRESS=1 rue du Test, 75000 Paris"
	echo "LEGAL_PUBLISHER_PHONE=01 00 00 00 00"
	echo "LEGAL_PUBLISHER_REGISTRATION=RNA W000000000"
	echo "LEGAL_PUBLICATION_DIRECTOR=Camille Test"
	echo "LEGAL_CONTACT_EMAIL=contact@example.test"
	echo "LEGAL_HOST_NAME=Hébergeur fictif"
	echo "LEGAL_HOST_ADDRESS=2 rue du Test, 75000 Paris"
	echo "LEGAL_HOST_PHONE=01 00 00 00 01"
	echo "LEGAL_SMTP_PROVIDER=Mailpit"
	echo "LEGAL_EFFECTIVE_DATE=2026-12-01"
	# The scheduler's own cron never warms the cache here: the warm-up step below runs it
	# explicitly, with WARM_CACHE=true, and would otherwise race it for the job's lock.
	echo "WARM_CACHE=false"
	if [ "$variant" = selfhost ]; then
		echo "POSTGRES_PASSWORD=$postgres_password"
	else
		# Everything the Coolify layout sets by hand: where the database and the S3 are, and
		# the superuser URL itself (no POSTGRES_PASSWORD).
		echo "APERCURA_DB_HOST=$db_container"
		echo "DATABASE_URL_MIGRATE=postgres://postgres:$postgres_password@$db_container:5432/apercura"
		echo "S3_ENDPOINT=http://$s3_container:9000"
		echo "MINIO_ROOT_USER=smoke-admin"
	fi
	docker run --rm "$image" keys
} >"$env_file"

password_of() { sed -n "s/^$1=//p" "$env_file"; }

# psql in the database container, as the superuser over its socket.
db_psql() {
	if [ "$variant" = selfhost ]; then
		compose exec -T postgres psql -v ON_ERROR_STOP=1 -U postgres -d apercura "$@"
	else
		docker exec -i "$db_container" psql -v ON_ERROR_STOP=1 -U postgres -d apercura "$@"
	fi
}

# Logs in as a role with its password, over the container's own address rather than loopback
# so the password is checked (scram), and prints 1.
role_login() {
	role_password=$(password_of "$2")
	# shellcheck disable=SC2016 # expanded by the container's shell
	if [ "$variant" = selfhost ]; then
		compose exec -T -e PGPASSWORD="$role_password" postgres \
			sh -c 'psql -h "$(hostname -i)" -U "$0" -d apercura -tA -c "SELECT 1"' "$1"
	else
		docker exec -i -e PGPASSWORD="$role_password" "$db_container" \
			sh -c 'psql -h "$(hostname -i)" -U "$0" -d apercura -tA -c "SELECT 1"' "$1"
	fi
}

if [ "$variant" = selfhost ]; then
	step "Start the stack (postgres, migrate, minio, app, scheduler, mailpit)"
	compose --profile dev up -d --wait --wait-timeout 300

	step "Migrations are a no-op the second time, and set the roles' passwords again"
	# As under Coolify, where the init script is not mounted: the app role exists without login.
	db_psql -c "ALTER ROLE apercura_app NOLOGIN PASSWORD NULL" >/dev/null
	if role_login apercura_app APERCURA_APP_DB_PASSWORD >/dev/null 2>&1; then
		echo "apercura_app still logs in after NOLOGIN PASSWORD NULL" >&2
		exit 1
	fi
	compose run --rm --no-deps migrate | tee "$work/migrate.log" | grep "Migrations applied"
	grep "Role passwords applied: apercura_app, apercura_etl, apercura_jobs" "$work/migrate.log"
	role_login apercura_app APERCURA_APP_DB_PASSWORD | grep -qx 1
else
	step "Start a fresh PostGIS and MinIO outside the project, without any init script"
	# The project's network first (`up --no-start` creates it and the containers), so the
	# data services join it as Coolify's resources share a network with the application.
	compose up --no-start
	docker run -d --name "$db_container" --network "$network" --platform linux/amd64 \
		-e POSTGRES_PASSWORD="$postgres_password" -e POSTGRES_DB=apercura \
		postgis/postgis:17-3.7 >/dev/null
	docker run -d --name "$s3_container" --network "$network" \
		-e MINIO_ROOT_USER=smoke-admin -e MINIO_ROOT_PASSWORD="$minio_password" \
		pgsty/minio:RELEASE.2026-08-04T00-00-00Z server /data >/dev/null

	step "Start the application stack: migrate waits for the database, then creates the roles"
	# No health check ties the two: PostGIS is still initialising when migrate starts.
	compose up -d --wait --wait-timeout 300
	compose logs --no-color migrate | tee "$work/migrate.log"
	grep -q "Migrations applied" "$work/migrate.log"
	grep -q "Role passwords applied: apercura_app, apercura_etl, apercura_jobs" "$work/migrate.log"
	compose logs --no-color minio-init | grep -q "Bucket apercura ready"

	step "The roles exist, created by the migrations, and log in with their passwords"
	roles=$(db_psql -tA -c "SELECT string_agg(rolname || ':' || rolcanlogin, ',' ORDER BY rolname)
		FROM pg_roles WHERE rolname LIKE 'apercura\_%'")
	test "$roles" = "apercura_app:true,apercura_etl:true,apercura_jobs:true,apercura_readonly:false"
	role_login apercura_app APERCURA_APP_DB_PASSWORD | grep -qx 1
	role_login apercura_etl APERCURA_ETL_DB_PASSWORD | grep -qx 1
	role_login apercura_jobs APERCURA_JOBS_DB_PASSWORD | grep -qx 1

	step "The app's S3 key is limited to its bucket"
	# shellcheck disable=SC2016 # expanded by the container's shell
	compose run --rm --no-deps -T --entrypoint sh minio-init -c '
		mc alias set app "$S3_ENDPOINT" "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY" >/dev/null
		mc ls "app/$S3_BUCKET" >/dev/null
		if mc mb app/another-bucket >/dev/null 2>&1; then
			echo "the app key may create buckets" >&2
			exit 1
		fi'
fi

step "Import the synthetic fixtures"
compose run --rm -v "$root/packages/etl/fixtures/fr:/fixtures:ro" etl --source-dir /fixtures --offline

step "Pages and health answer from the app container"
base="http://127.0.0.1:$port"
curl -fsS "$base/api/health" | grep -q '"ok"'
curl -fsS -o /dev/null "$base/"
curl -fsS -o /dev/null "$base/fr"
curl -fsS -o /dev/null "$base/fr-en"
slug=$(db_psql -tA -c "SELECT slug FROM directory.practitioner_pages WHERE indexable ORDER BY slug LIMIT 1")
test -n "$slug"
curl -fsS "$base/fr/praticien/$slug" | grep -q "<h1"
curl -fsS "$base/fr/mentions-legales" | grep -q "$publisher"
curl -fsS "$base/fr/guides/medecin-traitant" | grep -q "<h1"
curl -fsS "$base/.well-known/security.txt" | grep -q "^Contact: mailto:contact@example.test"
# The colour theme's script, loaded by every page's <head> (a missing file would leave the theme control dead).
curl -fsS "$base/theme.js" | grep -q "apercura-theme"
curl -fsS "$base/fr" | grep -q '<script src="/theme.js"></script>'
echo "home, /fr, /fr-en, /fr/praticien/$slug, the legal notice, a guide, security.txt, /theme.js and /api/health: OK"

step "Pages are cached in valkey, compressed, and never on the app's disk"
cache_state() { curl -fsS -D - -o /dev/null "$base$1" | tr -d '\r' | sed -n 's/^[Xx]-[Nn]extjs-[Cc]ache: //p'; }
cache_state "/fr/praticien/$slug" >/dev/null
test "$(cache_state "/fr/praticien/$slug")" = HIT
test "$(compose exec -T valkey valkey-cli --scan --pattern 'apercura:*:route:*' | wc -l)" -gt 0
test "$(compose exec -T valkey valkey-cli --scan --pattern 'apercura:*:data:*' | wc -l)" -gt 0
if compose exec -T app test -e /app/apps/web/.next/server/route-cache; then
	echo "the app wrote pages to .next/server/route-cache with valkey on" >&2
	exit 1
fi
compose exec -T valkey valkey-cli config get maxmemory-policy | grep -qx allkeys-lru
echo "a practitioner page is a hit from valkey; nothing in .next/server/route-cache: OK"

step "A signed revalidation marks the page's tag in valkey: served stale once, then fresh"
revalidate_secret=$(password_of REVALIDATE_SECRET)
practitioner_id=$(db_psql -tA -c "SELECT practitioner_id FROM directory.practitioner_pages WHERE slug = '$slug'")
timestamp=$(date +%s)
body="{\"tags\":[\"practitioner:$practitioner_id\"]}"
signature=$(printf '%s.%s' "$timestamp" "$body" | openssl dgst -sha256 -hmac "$revalidate_secret" | sed 's/^.* //')
curl -fsS -X POST -H "content-type: application/json" -H "x-apercura-timestamp: $timestamp" \
	-H "x-apercura-signature: $signature" --data "$body" "$base/api/revalidate" | grep -q '"revalidated":1'
compose exec -T valkey valkey-cli --scan --pattern "apercura:*:stale:practitioner:$practitioner_id" | grep -q stale
test "$(cache_state "/fr/praticien/$slug")" = STALE
sleep 2
test "$(cache_state "/fr/praticien/$slug")" = HIT

step "Valkey stopped: pages are rendered and the health check answers"
compose stop valkey
curl -fsS "$base/fr/praticien/$slug" | grep -q "<h1"
curl -fsS -o /dev/null "$base/fr"
curl -fsS "$base/api/health" | grep -q '"ok"'
compose start valkey
compose up -d --wait --wait-timeout 120 valkey

step "Without valkey, a read-only disk never makes a page fail"
# The app's own container settings, without CACHE_REDIS_URL: Next.js's file system cache, on a
# root file system it cannot write to.
docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$(compose ps -q app)" |
	grep -v -e '^CACHE_REDIS_URL=' -e '^$' >"$work/app.env"
readonly_port=$((port + 2))
docker run -d --name "$readonly_container" --read-only --tmpfs /tmp --network "$network" \
	--env-file "$work/app.env" -p "127.0.0.1:$readonly_port:3000" "$image" serve >/dev/null
tries=0
until curl -fsS "http://127.0.0.1:$readonly_port/api/health" 2>/dev/null | grep -q '"ok"'; do
	tries=$((tries + 1))
	if [ "$tries" -ge 60 ]; then
		docker logs --tail 40 "$readonly_container" >&2
		echo "the read-only app did not become healthy" >&2
		exit 1
	fi
	sleep 1
done
for page in "/fr/praticien/$slug" /fr /fr/medecin-generaliste "/fr/praticien/$slug"; do
	curl -fsS -H "Host: localhost:$port" "http://127.0.0.1:$readonly_port$page" | grep -q "<h1"
done
if docker exec "$readonly_container" test -e /app/apps/web/.next/server/route-cache; then
	echo "the read-only app wrote pages" >&2
	exit 1
fi
docker rm -f -v "$readonly_container" >/dev/null
echo "read-only, without valkey: pages and /api/health answer: OK"

step "Open Graph images render in the app container (their fonts ship with the build)"
# 200 and a PNG: a font missing from the standalone output answers 500.
og_image() {
	content_type=$(curl -fsS -o "$work/og.png" -w '%{content_type}' "$base$1")
	if [ "$content_type" != "image/png" ]; then
		echo "$1 answered $content_type, not image/png" >&2
		exit 1
	fi
	# The PNG signature's "PNG", bytes 2 to 4.
	test "$(head -c 4 "$work/og.png" | tail -c 3)" = PNG
}
og_image /og/medecin.png
og_image "/og/praticien/$slug.png"
og_image /og/guides/medecin-traitant.png
echo "/og/medecin.png, /og/praticien/$slug.png and /og/guides/medecin-traitant.png: OK"

step "Scheduled jobs run in the scheduler"
compose exec -T scheduler apercura jobs:tick | grep '"job":"tick"'

step "The cache warm-up walks the sitemaps through the app, as its public host"
# Turned on for this run only (the scheduler's cron runs it disabled). A disabled run still
# holds the job's advisory lock for an instant, so a "locked" result is tried again, up to 30 s.
tries=0
while :; do
	compose exec -T -e WARM_CACHE=true scheduler apercura jobs:tick warm --restart | tee "$work/warm.log"
	grep -q '"result":"locked"' "$work/warm.log" || break
	tries=$((tries + 1))
	if [ "$tries" -ge 15 ]; then
		echo "the warm-up job's lock is still held after 30 s" >&2
		exit 1
	fi
	sleep 2
done
grep -q '"job":"warm"' "$work/warm.log"
grep -Eq '"warmed":[1-9]' "$work/warm.log"
grep -q '"errors":0' "$work/warm.log"
grep -q '"redirected":0' "$work/warm.log"
# The scheduler reads the build id from the image it shares with the app.
if grep -q 'build:unknown' "$work/warm.log"; then
	echo "the warm-up found no build id in the image" >&2
	exit 1
fi

step "The import role cannot read patient data"
etl_password=$(password_of APERCURA_ETL_DB_PASSWORD)
if [ "$variant" = selfhost ]; then
	denied() { compose exec -T -e PGPASSWORD="$etl_password" postgres "$@"; }
else
	denied() { docker exec -i -e PGPASSWORD="$etl_password" "$db_container" "$@"; }
fi
if denied psql -U apercura_etl -d apercura -tA -c "SELECT 1 FROM care.appointments LIMIT 1" 2>/dev/null; then
	echo "apercura_etl can read care.appointments" >&2
	exit 1
fi

if [ "$variant" = external ]; then
	step "Removing the application's containers leaves the data services and their data alone"
	# What a Coolify deploy does to the application: stop and remove all its containers.
	compose --profile tools rm -f -s
	test -z "$(compose ps -aq)"
	test "$(docker inspect -f '{{.State.Running}}' "$db_container")" = true
	test "$(db_psql -tA -c "SELECT count(*) > 0 FROM directory.practitioner_pages")" = t
	compose up -d --wait --wait-timeout 300
	curl -fsS "$base/fr/praticien/$slug" | grep -q "<h1"
fi

step "Smoke test passed"
