#!/bin/bash -l
# Every 5 minutes (clevercloud/cron.json): expirations, reminders, the email outbox, next free
# slots and purges. First instance only; flock skips a run while the previous one goes on, and
# every sub-job also holds a Postgres advisory lock.
if [[ "${INSTANCE_NUMBER:-0}" != "0" ]]; then
	exit 0
fi
cd "${APP_HOME:?}" || exit 1
source clevercloud/env.sh
exec /usr/bin/flock -n /tmp/apercura-jobs-tick.lock bun run jobs:tick
