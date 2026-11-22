#!/bin/bash
# CC_RUN_COMMAND of the web app: the Next.js standalone server on Clever Cloud's port (PORT,
# 8080), on every interface.
set -euo pipefail
cd "$(dirname "$0")/.."
source clevercloud/env.sh

cd apps/web/.next/standalone/apps/web
export HOSTNAME=0.0.0.0
exec node server.js
