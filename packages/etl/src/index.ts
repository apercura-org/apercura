export const COMMANDS = ["etl:fr", "etl:at", "etl:places", "etl:outbox"] as const;

export type Command = (typeof COMMANDS)[number];

export const USAGE = `Usage: apercura-etl <command> [flags]

Commands:
  etl:fr        Import French practitioners from the national open data
                (Annuaire Santé, FINESS+, Ameli), geocode, rebuild read models.
  etl:at        Import Austrian doctors and dentists from the Länder open data
                (Vienna, Styria, Salzburg; CC BY 4.0), rebuild read models.
  etl:places    Import regions, departments, communes and arrondissements
                (geo.api.gouv.fr), or with --country at the Austrian
                Bundesländer and Gemeinden (Statistik Austria). Run once, then yearly.
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

Flags (etl:at):
  --sources <ids>         Lists to import: wien, stmk, sbg, sbg-zahn (default ETL_AT_SOURCES, else all).
  --dry-run, --approve=<run_id>, --force, --source-dir <path>, --offline, --work-dir <path>
                          As for etl:fr. A list that cannot be fetched or read is left out
                          (exit code 3); the others are imported.

Environment:
  DATABASE_URL_ETL (or DATABASE_URL), ETL_PROFESSIONS, ETL_ANS_URLS, ETL_AMELI_URL,
  ETL_FINESS_DATASET_URL, ETL_GEO_API_URL, ETL_GEOCODER_URL, ETL_SOURCE_DIR, ETL_WORK_DIR,
  ETL_AT_SOURCES, ETL_AT_WIEN_URL, ETL_AT_STMK_URL, ETL_AT_SBG_URL, ETL_AT_SBG_ZAHN_URL,
  ETL_AT_PLACES_URL, ETL_AT_SOURCE_DIR,
  APP_URL and REVALIDATE_SECRET (cache revalidation).`;

export {
	type AtOptions,
	buildAtOptions,
	buildFrOptions,
	type FrOptions,
	parseArgs,
} from "./config";
export { type AtRunOutcome, runAt } from "./run-at";
export { type RunOutcome, runFr } from "./run-fr";
