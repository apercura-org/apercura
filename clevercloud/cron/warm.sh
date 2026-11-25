#!/bin/bash -l
# Every 5 minutes, two minutes after jobs:tick (clevercloud/cron.json): the next slice of the
# cache warm-up (`jobs:tick warm`, off with WARM_CACHE=false). First instance only, and against
# that instance's own server (its pages are cached on its disk); flock skips a run while the
# previous one goes on, and the job also holds a Postgres advisory lock.
if [[ "${INSTANCE_NUMBER:-0}" != "0" ]]; then
	exit 0
fi
cd "${APP_HOME:?}" || exit 1
source clevercloud/env.sh
export INTERNAL_APP_URL="${INTERNAL_APP_URL:-http://127.0.0.1:${PORT:-8080}}"
exec /usr/bin/flock -n /tmp/apercura-warm.lock bun run jobs:tick warm
