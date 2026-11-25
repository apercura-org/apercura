#!/bin/sh
# Entry point of the Apercura image: one image, one command per role.
set -eu

usage() {
	cat <<'EOF'
Usage: apercura <command> [arguments]

  serve                  Start the web app (default; listens on $PORT, 3000)
  migrate                Apply pending database migrations (DATABASE_URL_MIGRATE)
  jobs:tick [job]        Run the scheduled jobs once (expire, reminders, outbox, next-free,
                         purge, claim-documents), or rotate-keys after a key rotation
  etl:fr [flags]         Import the French open data (e.g. --department 75, --dry-run)
  etl:places [flags]     Import the communes, departments and regions
  etl:outbox             Send the pending cache tags to the app
  scheduler              Run jobs:tick every 5 minutes and the weekly import (supercronic)
  keys                   Print fresh random secrets for the environment file
  help                   Show this help

Any other command runs as is (for example `sh`).
EOF
}

# The audit log retention's own role: build its URL from APERCURA_JOBS_DB_PASSWORD (set by
# docker/compose.selfhost.yml) unless DATABASE_URL_JOBS is given. Both empty: left unset, and
# the jobs skip that purge with a warning. Never printed.
jobs_database_url() {
	if [ -z "${DATABASE_URL_JOBS:-}" ]; then
		if [ -n "${APERCURA_JOBS_DB_PASSWORD:-}" ]; then
			DATABASE_URL_JOBS="postgres://apercura_jobs:${APERCURA_JOBS_DB_PASSWORD}@${APERCURA_DB_HOST:-postgres}:5432/${APERCURA_DB_NAME:-apercura}"
			export DATABASE_URL_JOBS
		else
			unset DATABASE_URL_JOBS
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
	exec bun /app/cli/migrate.js "$@"
	;;
jobs | jobs:tick)
	jobs_database_url
	exec bun /app/cli/jobs.js "$@"
	;;
etl:fr | etl:places | etl:outbox)
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
