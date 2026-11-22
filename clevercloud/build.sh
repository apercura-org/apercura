#!/bin/bash
# CC_POST_BUILD_HOOK of the web app: runs once per build, after `bun install`.
#
# 1. Migrations first: the build prerenders pages that read the database, and the new
#    version's instances start on the new schema. Migrations stay compatible with the version
#    still serving during the deployment (expand, then contract in a later release).
# 2. `next build` (standalone output), then the static assets next to the standalone server.
set -euo pipefail
cd "$(dirname "$0")/.."
source clevercloud/env.sh

if [ -n "${DATABASE_URL_MIGRATE:-}" ]; then
	bun run db:migrate
else
	echo "No DATABASE_URL_MIGRATE nor POSTGRESQL_ADDON_URI: migrations skipped" >&2
fi

bun run --cwd apps/web build

standalone=apps/web/.next/standalone/apps/web
rm -rf "$standalone/.next/static"
cp -R apps/web/.next/static "$standalone/.next/static"
