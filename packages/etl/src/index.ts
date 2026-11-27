export const COMMANDS = [
	"etl:fr",
	"etl:at",
	"etl:gb",
	"etl:cz",
	"etl:es",
	"etl:it",
	"etl:de",
	"etl:ch",
	"etl:ee",
	"etl:pl",
	"etl:no",
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
  etl:ch        Import Swiss hospitals and clinics (FOPH, Kennzahlen der Schweizer
                Spitäler 2023) and the cantons' open lists of hospitals, nursing homes
                and pharmacies (Bern, Geneva, Basel-Landschaft, Basel-Stadt, Zürich,
                Jura), placed by postcode in the BFS communes, rebuild read models.
  etl:ee        Import Estonian healthcare providers and their activity licences (the
                Health Board's register, MEDRE open data; CC BY-NC-SA 3.0: non-commercial
                use only) and general pharmacies (the State Agency of Medicines' register,
                CC0 1.0), located with the Land Board's addresses (ADS, CC0 1.0), placed in
                EHAK's settlements, rebuild read models.
  etl:pl        Import Polish healthcare establishments (hospitals, clinics, hospices,
                care homes, sanatoria, laboratories…) of the healthcare entities of
                RPWDL (Centrum e-Zdrowia; CC BY 4.0, with the times of production and
                obtaining stated), placed in TERYT's gminas, rebuild read models.
  etl:no        Import Norwegian establishments of care (the Brønnøysund Register
                Centre's Enhetsregisteret, its establishments under health and pharmacy
                industry codes, NLOD 2.0; no sole proprietorships), located with
                Kartverket's addresses (Matrikkelen – Adresse, CC BY 4.0), placed in its
                municipalities, rebuild read models.
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
                Destatis), or with --country ch the Swiss cantons, districts and
                communes (BFS commune register, swisstopo's postcode directory), or
                with --country pl the Polish voivodeships, powiats and gminas (TERYT
                TERC, GUS; the gminas' points from PRG's boundaries, GUGiK), or with
                --country ee the Estonian counties, municipalities and settlements
                (EHAK units, Maa- ja Ruumiamet), or with --country no the Norwegian
                counties and municipalities (Kartverket). Run once, then yearly.
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

Flags (etl:ch):
  --sources <ids>         Lists to import: bag, be-spitaeler, be-heime, ge-hopitaux, ge-ems,
                          ge-pharmacies, bl-apotheken, bl-heime, bs-spitaeler, bs-heime,
                          zh-heime, ju-institutions (default ETL_CH_SOURCES, else all), or
                          every list but some: -ge-hopitaux,-ge-ems,-ge-pharmacies. A list
                          turned off keeps its rows and is not an error (exit code 0).
  --dry-run, --approve=<run_id>, --force, --source-dir <path>, --offline, --work-dir <path>
                          As for etl:at. Without bag, the cantons' hospitals are not read.

Flags (etl:ee):
  --sources <ids>         Sources to import: medre (the Health Board's providers), apteegid
                          (pharmacies) (default ETL_EE_SOURCES, else both).
  --as-of <YYYY-MM-DD>    The day the licences are read for (default: today in Tallinn).
  --dry-run, --approve=<run_id>, --force, --source-dir <path>, --offline, --work-dir <path>
                          As for etl:at. The ADS address file locates both: without it the
                          run fails (exit code 1).

Flags (etl:pl):
  --as-of <YYYY-MM-DD>    The day the register is read for (default: today in Warsaw).
  --dry-run, --approve=<run_id>, --force, --source-dir <path>, --offline, --work-dir <path>
                          As for etl:fr. One register: when it cannot be fetched or read the
                          run fails (exit code 1).
Flags (etl:no):
  --sources <ids>         Sources to import: brreg (the register's establishments)
                          (default ETL_NO_SOURCES, else brreg).
  --dry-run, --approve=<run_id>, --force, --source-dir <path>, --offline, --work-dir <path>
                          As for etl:at. The address file locates every establishment:
                          without it the run fails (exit code 1).

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
  ETL_CH_SOURCES, ETL_CH_{SOURCE}_URL (ETL_CH_BAG_URL, ETL_CH_ZH_HEIME_URL…),
  ETL_CH_POSTCODES_URL, ETL_CH_COMMUNES_URL, ETL_CH_SOURCE_DIR,
  ETL_EE_SOURCES, ETL_EE_MEDRE_URL, ETL_EE_APTEEGID_URL, ETL_EE_ADS_URL, ETL_EE_PLACES_URL,
  ETL_EE_SOURCE_DIR,
  ETL_PL_URL, ETL_PL_TERC_URL, ETL_PL_PRG_URL, ETL_PL_SOURCE_DIR,
  ETL_NO_SOURCES, ETL_NO_UNDERENHETER_URL, ETL_NO_ENHETER_URL, ETL_NO_ADRESSER_URL,
  ETL_NO_PLACES_URL, ETL_NO_SOURCE_DIR,
  APP_URL and REVALIDATE_SECRET (cache revalidation).`;

export {
	type AtOptions,
	buildAtOptions,
	buildChOptions,
	buildCzOptions,
	buildDeOptions,
	buildEeOptions,
	buildEsOptions,
	buildFrOptions,
	buildGbOptions,
	buildItOptions,
	buildNoOptions,
	buildPlOptions,
	type ChOptions,
	type CzOptions,
	type DeOptions,
	type EeOptions,
	type EsOptions,
	type FrOptions,
	type GbOptions,
	type ItOptions,
	type NoOptions,
	type PlOptions,
	parseArgs,
} from "./config";
export { type AtRunOutcome, runAt } from "./run-at";
export { type ChRunOutcome, runCh } from "./run-ch";
export { type CzRunOutcome, runCz } from "./run-cz";
export { type DeRunOutcome, runDe } from "./run-de";
export { type EeRunOutcome, runEe } from "./run-ee";
export { type EsRunOutcome, runEs } from "./run-es";
export { type RunOutcome, runFr } from "./run-fr";
export { type GbRunOutcome, runGb } from "./run-gb";
export { type ItRunOutcome, runIt } from "./run-it";
export { type NoRunOutcome, runNo } from "./run-no";
export { type PlRunOutcome, runPl } from "./run-pl";
