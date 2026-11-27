#!/bin/sh
# Entry point of the Apercura image: one image, one command per role.
set -eu

usage() {
	cat <<'EOF'
Usage: apercura <command> [arguments]

  serve                  Start the web app (default; listens on $PORT, 3000)
  migrate                Wait for the database, apply pending migrations and the roles'
                         passwords (DATABASE_URL_MIGRATE, or built from POSTGRES_PASSWORD)
  jobs:tick [job]        Run the scheduled jobs once (expire, reminders, outbox, next-free,
                         purge, claim-documents), rotate-keys after a key rotation, or
                         warm [--restart] for the next slice of the cache warm-up
  etl:fr [flags]         Import the French open data (e.g. --department 75, --dry-run)
  etl:at [flags]         Import the Austrian open data (Vienna, Styria, Salzburg lists)
  etl:gb [flags]         Import the UK's NHS open data (GP practices, dental practices, pharmacies)
  etl:cz [flags]         Import the Czech register of healthcare providers (NRPZS)
  etl:es [flags]         Import the Spanish register of health centres (REGCESS)
  etl:it [flags]         Import the Italian Ministry of Health's pharmacies and hospitals
  etl:de [flags]         Import the German directory of hospitals and clinics (Destatis)
                         and the Thuringian and Brandenburg pharmacy lists
  etl:ch [flags]         Import the Swiss hospitals (FOPH) and the cantons' open lists
  etl:ee [flags]         Import the Estonian Health Board's providers and the State Agency of
                         Medicines' pharmacies (non-commercial use only: CC BY-NC-SA 3.0)
  etl:pl [flags]         Import the Polish register of healthcare entities (RPWDL)
  etl:no [flags]         Import the Norwegian establishments of care (Brønnøysundregistrene's
                         Enhetsregisteret, NLOD 2.0) located with Kartverket's addresses
  etl:ie [flags]         Import the Irish pharmacies (PSI), nursing homes (HIQA), and the HSE's
                         hospitals and health centres
  etl:fi [flags]         Import the Finnish public health service locations (the Finnish
                         Service Catalogue, PTV, CC0 1.0)
  etl:lt [flags]         Import the Lithuanian licence register of health-care institutions
                         (VASPVT)
  etl:si [flags]         Import the Slovenian personal doctors (ZZZS), with whether each
                         takes new patients
  etl:places [flags]     Import the communes, departments and regions (--country at: the
                         Austrian Bundesländer and Gemeinden; --country gb: the UK regions,
                         local authorities and towns; --country cz: the Czech regions,
                         districts and municipalities; --country es: the Spanish
                         communities, provinces and municipalities; --country it: the
                         Italian regions, provinces and municipalities; --country de: the
                         German Länder, Kreise and Gemeinden; --country ch: the Swiss
                         cantons, districts and communes; --country ee: the Estonian
                         counties, municipalities and settlements; --country pl: the Polish
                         voivodeships, powiats and gminas; --country no: the
                         Norwegian counties and municipalities; --country ie: the Irish provinces,
                         counties and census towns; --country fi: the Finnish
                         regions, wellbeing services counties and municipalities; --country lt:
                         the Lithuanian counties, municipalities and settlements; --country si: the
                         Slovenian statistical regions and municipalities, with the
                         settlements, postal areas and streets that locate the practices)
  etl:outbox             Send the pending cache tags to the app
  scheduler              Run jobs:tick and the cache warm-up every 5 minutes and the open data
                         imports (supercronic)
  keys                   Print fresh random secrets for the environment file
  help                   Show this help

Any other command runs as is (for example `sh`).
EOF
}

# host:port/database of the URLs built below (docker/compose.app.yml passes the three).
database_address() {
	printf '%s:%s/%s' "${APERCURA_DB_HOST:-postgres}" "${APERCURA_DB_PORT:-5432}" "${APERCURA_DB_NAME:-apercura}"
}

# The audit log retention's own role: build its URL from APERCURA_JOBS_DB_PASSWORD (set by
# docker/compose.app.yml) unless DATABASE_URL_JOBS is given. Both empty: left unset, and
# the jobs skip that purge with a warning. Never printed.
jobs_database_url() {
	if [ -z "${DATABASE_URL_JOBS:-}" ]; then
		if [ -n "${APERCURA_JOBS_DB_PASSWORD:-}" ]; then
			DATABASE_URL_JOBS="postgres://apercura_jobs:${APERCURA_JOBS_DB_PASSWORD}@$(database_address)"
			export DATABASE_URL_JOBS
		else
			unset DATABASE_URL_JOBS
		fi
	fi
}

# The migrations' superuser: DATABASE_URL_MIGRATE when given (an external database), otherwise
# built from POSTGRES_PASSWORD for the `postgres` user (docker/compose.selfhost.yml). Both
# empty: left unset, and the migration falls back to DATABASE_URL or stops. Never printed.
migrate_database_url() {
	if [ -z "${DATABASE_URL_MIGRATE:-}" ]; then
		if [ -n "${POSTGRES_PASSWORD:-}" ]; then
			DATABASE_URL_MIGRATE="postgres://postgres:${POSTGRES_PASSWORD}@$(database_address)"
			export DATABASE_URL_MIGRATE
		else
			unset DATABASE_URL_MIGRATE
		fi
	fi
}

command="${1:-serve}"
[ "$#" -gt 0 ] && shift

case "$command" in
serve)
	exec node /app/apps/web/server.js "$@"
	;;
migrate | db:migrate)
	migrate_database_url
	exec bun /app/cli/migrate.js "$@"
	;;
jobs | jobs:tick)
	jobs_database_url
	exec bun /app/cli/jobs.js "$@"
	;;
etl:fr | etl:at | etl:gb | etl:cz | etl:es | etl:it | etl:de | etl:ch | etl:ee | etl:lt | etl:no | etl:pl | etl:ie | etl:fi | etl:si | etl:places | etl:outbox)
	# The import only uses APP_URL to send cache tags to the app: inside a private network it
	# can reach it directly (INTERNAL_APP_URL, e.g. http://app:3000) instead of the public URL.
	if [ -n "${INTERNAL_APP_URL:-}" ]; then
		export APP_URL="$INTERNAL_APP_URL"
	fi
	exec bun /app/cli/etl.js "$command" "$@"
	;;
scheduler)
	# Exported before exec: supercronic and its jobs inherit it.
	jobs_database_url
	exec supercronic -passthrough-logs /app/crontab
	;;
keys)
	exec node -e '
const { randomBytes } = require("node:crypto");
const key = () => randomBytes(32).toString("base64");
console.log(`ENCRYPTION_KEYS=1:${key()}`);
console.log("ENCRYPTION_ACTIVE_KEY=1");
console.log(`BLIND_INDEX_KEY=${key()}`);
console.log(`BETTER_AUTH_SECRET=${key()}`);
console.log(`RATE_LIMIT_KEY=${key()}`);
console.log(`ALTCHA_HMAC_KEY=${key()}`);
console.log(`REVALIDATE_SECRET=${key()}`);
console.log(`JOBS_SECRET=${key()}`);
'
	;;
help | --help | -h)
	usage
	;;
*)
	exec "$command" "$@"
	;;
esac
