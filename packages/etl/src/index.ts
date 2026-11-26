export const COMMANDS = [
	"etl:fr",
	"etl:at",
	"etl:gb",
	"etl:cz",
	"etl:es",
	"etl:it",
	"etl:de",
	"etl:places",
	"etl:outbox",
] as const;

export type Command = (typeof COMMANDS)[number];

export const USAGE = `Usage: apercura-etl <command> [flags]

Commands:
  etl:fr        Import French practitioners from the national open data
                (Annuaire Santé, FINESS+, Ameli), geocode, rebuild read models.
  etl:at        Import Austrian doctors and dentists from the Länder open data
                (Vienna, Styria, Salzburg; CC BY 4.0), rebuild read models.
  etl:gb        Import UK GP practices, dental practices and pharmacies from the NHS
                open data (ODS, Public Health Scotland, BSO; OGL), locate them by
                postcode (Code-Point Open), rebuild read models.
  etl:cz        Import Czech healthcare facilities (practices, pharmacies, home care…)
                from the National Register of Healthcare Providers (NRPZS, ÚZIS;
                CC BY 4.0), placed in RÚIAN's municipalities, rebuild read models.
  etl:es        Import Spanish health centres (hospitals, health centres, practices,
                dental clinics, pharmacies…) from the monthly extracts of REGCESS
                (Ministerio de Sanidad; reuse citing the source and date), placed in
                the IGN's municipalities by INE code, rebuild read models.
  etl:it        Import Italian pharmacies, parapharmacies, hospitals and accredited
                private clinics from the Ministry of Health's open data (IODL 2.0),
                placed in ISTAT's municipalities by code, rebuild read models.
  etl:de        Import German hospitals, psychiatric and children's hospitals,
                rehabilitation clinics (the statistical offices' yearly directory,
                Destatis; reproduction with the source) and the pharmacies of
                Thuringia (CC BY 4.0) and Brandenburg (dl-de/by-2-0), placed in
                GV-ISys's Gemeinden by municipality key, rebuild read models.
  etl:places    Import regions, departments, communes and arrondissements
                (geo.api.gouv.fr), or with --country at the Austrian
                Bundesländer and Gemeinden (Statistik Austria), or with --country gb
                the UK regions, local authorities (ONS) and towns (OS Open Names,
                OSNI), or with --country cz the Czech regions, districts,
                municipalities and Prague districts (RÚIAN, ČÚZK), or with --country es
                the Spanish autonomous communities, provinces and municipalities
                (IGN, CC BY 4.0), or with --country it the Italian regions,
                provinces and municipalities (ISTAT boundaries, CC BY 4.0), or with
                --country de the German Länder, Kreise and Gemeinden (GV-ISys,
                Destatis). Run once, then yearly.
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

Flags (etl:gb):
  --sources <ids>         Lists to import: ods-gp, ods-branches, ods-dent, ods-pharm, phs-gp,
                          phs-dent, phs-pharm, bso-gp, bso-dent (default ETL_GB_SOURCES, else all).
  --dry-run, --approve=<run_id>, --force, --source-dir <path>, --offline, --work-dir <path>
                          As for etl:at.

Flags (etl:cz):
  --dry-run, --approve=<run_id>, --force, --source-dir <path>, --offline, --work-dir <path>
                          As for etl:fr. One list: when it cannot be fetched or read the run
                          fails (exit code 1).

Flags (etl:es):
  --sources <ids>         Extracts to import: regcess-c1, regcess-c2, regcess-e (default
                          ETL_ES_SOURCES, else all).
  --dry-run, --approve=<run_id>, --force, --source-dir <path>, --offline, --work-dir <path>
                          As for etl:at.

Flags (etl:it):
  --sources <ids>         Lists to import: farmacie, parafarmacie, posti-letto (default
                          ETL_IT_SOURCES, else all).
  --register-coordinates  Keep the lists' coordinates (some come from OpenStreetMap, ODbL);
                          by default a place is located at its municipality's centre.
  --as-of <YYYY-MM-DD>    The day the lists are read for (default: today in Rome).
  --dry-run, --approve=<run_id>, --force, --source-dir <path>, --offline, --work-dir <path>
                          As for etl:at.

Flags (etl:de):
  --sources <ids>         Sources to import: khv (hospitals), rhv (prevention and
                          rehabilitation clinics), apo-th, apo-bb (default ETL_DE_SOURCES,
                          else all).
  --dry-run, --approve=<run_id>, --force, --source-dir <path>, --offline, --work-dir <path>
                          As for etl:at. Unchanged files end the run at once (exit code 0).

Environment:
  DATABASE_URL_ETL (or DATABASE_URL), ETL_PROFESSIONS, ETL_ANS_URLS, ETL_AMELI_URL,
  ETL_FINESS_DATASET_URL, ETL_GEO_API_URL, ETL_GEOCODER_URL, ETL_SOURCE_DIR, ETL_WORK_DIR,
  ETL_AT_SOURCES, ETL_AT_WIEN_URL, ETL_AT_STMK_URL, ETL_AT_SBG_URL, ETL_AT_SBG_ZAHN_URL,
  ETL_AT_PLACES_URL, ETL_AT_SOURCE_DIR,
  ETL_GB_SOURCES, ETL_GB_{SOURCE}_URL (ETL_GB_ODS_GP_URL…), ETL_GB_POSTCODES_URL,
  ETL_GB_LAD_LOOKUP_URL, ETL_GB_LAD_BOUNDARIES_URL, ETL_GB_TOWNS_URL, ETL_GB_NI_TOWNS_URL,
  ETL_GB_SOURCE_DIR,
  ETL_CZ_URL, ETL_CZ_PLACES_URL, ETL_CZ_SOURCE_DIR,
  ETL_ES_SOURCES, ETL_ES_C1_URL, ETL_ES_C2_URL, ETL_ES_E_URL, ETL_ES_PLACES_URL,
  ETL_ES_SOURCE_DIR,
  ETL_IT_SOURCES, ETL_IT_FARMACIE_URL, ETL_IT_PARAFARMACIE_URL, ETL_IT_POSTI_LETTO_URL,
  ETL_IT_PORTAL_URL, ETL_IT_PLACES_URL, ETL_IT_REGISTER_COORDINATES, ETL_IT_SOURCE_DIR,
  ETL_DE_SOURCES, ETL_DE_KHV_URL, ETL_DE_KHV_INDEX_URL, ETL_DE_KHV_MIRROR_URL,
  ETL_DE_APO_TH_URL, ETL_DE_APO_BB_URL, ETL_DE_PLACES_URL, ETL_DE_SOURCE_DIR,
  APP_URL and REVALIDATE_SECRET (cache revalidation).`;

export {
	type AtOptions,
	buildAtOptions,
	buildCzOptions,
	buildDeOptions,
	buildEsOptions,
	buildFrOptions,
	buildGbOptions,
	buildItOptions,
	type CzOptions,
	type DeOptions,
	type EsOptions,
	type FrOptions,
	type GbOptions,
	type ItOptions,
	parseArgs,
} from "./config";
export { type AtRunOutcome, runAt } from "./run-at";
export { type CzRunOutcome, runCz } from "./run-cz";
export { type DeRunOutcome, runDe } from "./run-de";
export { type EsRunOutcome, runEs } from "./run-es";
export { type RunOutcome, runFr } from "./run-fr";
export { type GbRunOutcome, runGb } from "./run-gb";
export { type ItRunOutcome, runIt } from "./run-it";
