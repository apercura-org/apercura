#!/bin/bash -l
# Every Monday at 03:00 UTC (clevercloud/cron.json): restarts the import task, which runs its
# CC_RUN_COMMAND (`bun run etl:fr`) on its own instance. Clever Tasks do not read cron.json.
# Needs CLEVER_TOKEN, CLEVER_SECRET (restricted to that task) and ETL_TASK_APP_ID.
if [[ "${INSTANCE_NUMBER:-0}" != "0" ]]; then
	exit 0
fi
if [[ -z "${ETL_TASK_APP_ID:-}" ]]; then
	echo "ETL_TASK_APP_ID is not set: weekly import skipped" >&2
	exit 1
fi
exec clever restart --app "$ETL_TASK_APP_ID" --quiet
