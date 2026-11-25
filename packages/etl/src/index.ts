export const COMMANDS = ["etl:fr", "etl:places", "etl:outbox"] as const;

export type Command = (typeof COMMANDS)[number];

export const USAGE = `Usage: apercura-etl <command> [flags]

Commands:
  etl:fr        Import French practitioners from the national open data
                (Annuaire Santé, FINESS+, Ameli), geocode, rebuild read models.
  etl:places    Import regions, departments, communes and arrondissements
                (geo.api.gouv.fr). Run once, then yearly.
  etl:outbox    Send pending cache invalidations to the web app.

Flags (etl:fr):
  --department <code>     Only merge practitioners with an activity in this department (e.g. 75).
  --professions <codes>   Profession codes (default ETL_PROFESSIONS, else 10,40,50,60). Never 99.
  --dry-run               Run everything, report, then roll back.
  --approve=<run_id>      Accept the unusual changes a blocked run reported (same files only).
  --force                 Import even when the source files did not change.
  --source-dir <path>     Read the source files from a directory (fixtures, offline runs).
  --offline               No network: no geocoding, no revalidation calls.
  --no-geocode            Skip geocoder calls (cached results and commune centroids only).
  --work-dir <path>       Where downloads go (default: a temporary directory, removed after).

Environment:
  DATABASE_URL_ETL (or DATABASE_URL), ETL_PROFESSIONS, ETL_ANS_URLS, ETL_AMELI_URL,
  ETL_FINESS_DATASET_URL, ETL_GEO_API_URL, ETL_GEOCODER_URL, ETL_SOURCE_DIR, ETL_WORK_DIR,
  APP_URL and REVALIDATE_SECRET (cache revalidation).`;

export { buildFrOptions, type FrOptions, parseArgs } from "./config";
export { type RunOutcome, runFr } from "./run-fr";
