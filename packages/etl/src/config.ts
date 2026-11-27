/**
 * Import configuration: environment variables and command-line flags.
 */
import { parseProfessionList } from "@apercura/core/taxonomy";
import { DEFAULT_AT_PLACES_URL } from "./sources/at/places";
import { AT_SOURCE_IDS, type AtSourceId } from "./sources/at/types";
import { CH_SOURCE_IDS, type ChSourceId, chSourceUrlVariable } from "./sources/ch/sources";
import { DEFAULT_CY_CENSUS_URL, DEFAULT_CY_POSTCODES_URL } from "./sources/cy/places";
import { CY_SOURCE_IDS, type CySourceId } from "./sources/cy/types";
import { defaultCzPlacesUrls } from "./sources/cz/places";
import { DEFAULT_DE_PLACES_URL } from "./sources/de/places";
import { DE_SOURCE_IDS, type DeFileId, type DeSourceId } from "./sources/de/types";
import { DEFAULT_EE_ADS_URL } from "./sources/ee/ads";
import { DEFAULT_EE_PHARMACIES_URL } from "./sources/ee/pharmacies";
import { DEFAULT_EE_PLACES_URL } from "./sources/ee/places";
import { EE_SOURCE_IDS, type EeFileId, type EeSourceId } from "./sources/ee/types";
import { DEFAULT_ES_PLACES_BASE } from "./sources/es/places";
import { ES_SOURCE_IDS, ES_SOURCES, type EsSourceId } from "./sources/es/types";
import { defaultFiPlacesUrls, type FiPlacesFileId } from "./sources/fi/places";
import { DEFAULT_PTV_API, PTV_CONCURRENCY } from "./sources/fi/ptv";
import {
	DEFAULT_GB_LAD_BOUNDARIES_URL,
	DEFAULT_GB_LAD_LOOKUP_URL,
	DEFAULT_GB_NI_TOWNS_URL,
	DEFAULT_GB_TOWNS_URL,
} from "./sources/gb/places";
import { DEFAULT_GB_POSTCODES_URL } from "./sources/gb/postcodes";
import { GB_SOURCE_IDS, type GbSourceId } from "./sources/gb/types";
import { IE_SOURCE_IDS, type IeSourceId, ieSourceUrlVariable } from "./sources/ie/types";
import { defaultItPlacesUrl } from "./sources/it/places";
import { IT_SOURCE_IDS, type ItSourceId } from "./sources/it/types";
import { DEFAULT_LT_ADDRESS_BASE } from "./sources/lt/places";
import { DEFAULT_LV_PORTAL_URL } from "./sources/lv/portal";
import { LV_SOURCE_IDS, type LvFileId, type LvSourceId } from "./sources/lv/types";
import { DEFAULT_NO_ADRESSER_URL } from "./sources/no/addresses";
import { DEFAULT_NO_ENHETER_URL, DEFAULT_NO_UNDERENHETER_URL } from "./sources/no/brreg";
import { DEFAULT_NO_PLACES_URL } from "./sources/no/places";
import { NO_SOURCE_IDS, type NoFileId, type NoSourceId } from "./sources/no/types";
import { DEFAULT_PL_PRG_URL, DEFAULT_PL_TERC_URL } from "./sources/pl/places";
import { GURS_WFS } from "./sources/si/places";
import { SI_SOURCE_IDS, type SiSourceId } from "./sources/si/types";
import { ZZZS_LISTS_PAGE } from "./sources/si/zzzs";
import { SE_SOURCE_IDS, type SeSourceId, seSourceUrlVariable } from "./sources/se/types";

/** Stable data.gouv.fr URLs (they redirect to the latest daily file). */
export const DEFAULT_ANS_URLS = {
	personneActivite:
		"https://www.data.gouv.fr/api/1/datasets/r/fffda7e9-0ea2-4c35-bba0-4496f3af935d",
	savoirFaire: "https://www.data.gouv.fr/api/1/datasets/r/fb55f15f-bd61-4402-b551-51ef387f2fab",
	diplomes: "https://www.data.gouv.fr/api/1/datasets/r/41ae70ac-90c8-4c4e-8644-4ef1b100f045",
} as const;

export const DEFAULT_AMELI_URL =
	"https://www.data.gouv.fr/api/1/datasets/r/432983b9-2e6f-473a-b35a-20403c300a5f";

/** data.gouv.fr API of the FINESS+ "Structures" dataset (daily and monthly JSON.gz). */
export const DEFAULT_FINESS_DATASET_URL =
	"https://www.data.gouv.fr/api/1/datasets/finess-structures-1/";

export const DEFAULT_GEO_API_URL = "https://geo.api.gouv.fr";
export const DEFAULT_GEOCODER_URL = "https://data.geopf.fr/geocodage/search/csv";

/** File names expected in `--source-dir` (fixtures, offline runs). */
export const SOURCE_DIR_FILES = {
	personneActivite: "personne-activite.txt",
	savoirFaire: "savoir-faire.txt",
	diplomes: "dipl-autexerc.txt",
	finess: "finess.json",
	ameli: "ameli.csv",
	regions: "regions.json",
	departements: "departements.json",
	communes: "communes.json",
	arrondissements: "arrondissements.json",
} as const;

export type AnsFileKey = keyof typeof DEFAULT_ANS_URLS;

export type FrOptions = {
	databaseUrl: string;
	professions: string[];
	department: string | null;
	dryRun: boolean;
	approveRunId: number | null;
	force: boolean;
	/** Read every source from this directory instead of downloading. */
	sourceDir: string | null;
	/** No network at all: no geocoding, no revalidation calls. */
	offline: boolean;
	skipGeocoding: boolean;
	ansUrls: Record<AnsFileKey, string>;
	ameliUrl: string;
	finessDatasetUrl: string;
	geoApiUrl: string;
	geocoderUrl: string;
	workDir: string | null;
	appUrl: string | null;
	revalidateSecret: string | null;
};

export type ParsedArgs = {
	command: string | undefined;
	flags: Map<string, string | true>;
};

/** Parses `command --flag value --flag=value --switch`. */
export function parseArgs(argv: string[]): ParsedArgs {
	const flags = new Map<string, string | true>();
	let command: string | undefined;
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index] ?? "";
		if (arg.startsWith("--")) {
			const body = arg.slice(2);
			const equals = body.indexOf("=");
			if (equals >= 0) {
				flags.set(body.slice(0, equals), body.slice(equals + 1));
				continue;
			}
			const next = argv[index + 1];
			if (next !== undefined && !next.startsWith("--") && VALUE_FLAGS.has(body)) {
				flags.set(body, next);
				index++;
			} else {
				flags.set(body, true);
			}
		} else if (command === undefined) {
			command = arg;
		} else {
			throw new Error(`Unexpected argument: ${arg}`);
		}
	}
	return { command, flags };
}

const VALUE_FLAGS = new Set([
	"department",
	"professions",
	"approve",
	"source-dir",
	"work-dir",
	"sources",
	"country",
	"as-of",
]);

const flagString = (flags: ParsedArgs["flags"], name: string): string | null => {
	const value = flags.get(name);
	if (value === undefined) return null;
	if (value === true) throw new Error(`--${name} needs a value`);
	return value;
};

/** Parses `ETL_ANS_URLS` (`personneActivite=https://…,savoirFaire=…,diplomes=…`). */
export function parseAnsUrls(value: string | undefined): Record<AnsFileKey, string> {
	const urls: Record<AnsFileKey, string> = { ...DEFAULT_ANS_URLS };
	if (!value) return urls;
	for (const pair of value.split(",")) {
		const equals = pair.indexOf("=");
		const key = pair.slice(0, equals).trim();
		const url = pair.slice(equals + 1).trim();
		if (equals < 0 || !(key in urls) || !url) {
			throw new Error(`Invalid ETL_ANS_URLS entry: ${pair}`);
		}
		urls[key as AnsFileKey] = url;
	}
	return urls;
}

export function resolveDatabaseUrl(env: NodeJS.ProcessEnv): string {
	const url = env.DATABASE_URL_ETL || env.DATABASE_URL;
	if (!url) throw new Error("DATABASE_URL_ETL (or DATABASE_URL) must be set");
	return url;
}

export function buildFrOptions(flags: ParsedArgs["flags"], env: NodeJS.ProcessEnv): FrOptions {
	const department = flagString(flags, "department");
	if (department !== null && !/^(\d{2,3}|2[AB])$/i.test(department)) {
		throw new Error(`Invalid department code: ${department}`);
	}
	const approve = flagString(flags, "approve");
	if (approve !== null && !/^\d+$/.test(approve)) {
		throw new Error(`--approve needs a run id, got ${approve}`);
	}
	const offline = flags.has("offline");
	return {
		databaseUrl: resolveDatabaseUrl(env),
		professions: parseProfessionList(flagString(flags, "professions") ?? env.ETL_PROFESSIONS),
		department: department?.toUpperCase() ?? null,
		dryRun: flags.has("dry-run"),
		approveRunId: approve === null ? null : Number(approve),
		force: flags.has("force"),
		sourceDir: flagString(flags, "source-dir") ?? env.ETL_SOURCE_DIR ?? null,
		offline,
		skipGeocoding: offline || flags.has("no-geocode"),
		ansUrls: parseAnsUrls(env.ETL_ANS_URLS),
		ameliUrl: env.ETL_AMELI_URL || DEFAULT_AMELI_URL,
		finessDatasetUrl: env.ETL_FINESS_DATASET_URL || DEFAULT_FINESS_DATASET_URL,
		geoApiUrl: env.ETL_GEO_API_URL || DEFAULT_GEO_API_URL,
		geocoderUrl: env.ETL_GEOCODER_URL || DEFAULT_GEOCODER_URL,
		workDir: flagString(flags, "work-dir") ?? env.ETL_WORK_DIR ?? null,
		appUrl: offline ? null : env.APP_URL || null,
		revalidateSecret: env.REVALIDATE_SECRET || null,
	};
}

// ---------------------------------------------------------------------------
// Austria (`etl:at`)
// ---------------------------------------------------------------------------

/**
 * Official distributions of the Austrian lists (data.gv.at), each overridable
 * with `ETL_AT_{SOURCE}_URL` (`ETL_AT_WIEN_URL`, `ETL_AT_STMK_URL`,
 * `ETL_AT_SBG_URL`, `ETL_AT_SBG_ZAHN_URL`).
 */
export const DEFAULT_AT_URLS: Record<AtSourceId, string> = {
	wien: "https://data.wien.gv.at/daten/geo?service=WFS&request=GetFeature&version=1.1.0&typeName=ogdwien:ARZTOGD&srsName=EPSG:4326&outputFormat=json",
	stmk: "https://service.stmk.gv.at/ogd/OGD_Data_ABT17/geoinformation/Niedergelassene_Aerzte.zip",
	sbg: "https://www.salzburg.gv.at/ogd/8bd69af0-d42a-4777-beb6-1e8e87145a23/Aerzte.json",
	"sbg-zahn": "https://www.salzburg.gv.at/ogd/90dd469f-9c41-49c4-aa86-cdf02ebaa1e0/Zahnaerzte.json",
};

/** File names expected in `--source-dir` for `etl:at` (fixtures, offline runs). */
export const AT_SOURCE_FILES: Record<AtSourceId, string> = {
	wien: "wien.json",
	stmk: "steiermark.zip",
	sbg: "salzburg-aerzte.json",
	"sbg-zahn": "salzburg-zahnaerzte.json",
};

export type AtOptions = {
	databaseUrl: string;
	/** The lists to import (default: all). */
	sources: AtSourceId[];
	dryRun: boolean;
	approveRunId: number | null;
	force: boolean;
	sourceDir: string | null;
	offline: boolean;
	urls: Record<AtSourceId, string>;
	placesUrl: string;
	workDir: string | null;
	appUrl: string | null;
	revalidateSecret: string | null;
};

/** Parses a comma-separated list of Austrian sources (`wien,stmk`); throws on unknown ones. */
export function parseAtSources(value: string | undefined | null): AtSourceId[] {
	if (!value) return [...AT_SOURCE_IDS];
	const sources = value
		.split(",")
		.map((source) => source.trim())
		.filter(Boolean);
	for (const source of sources) {
		if (!(AT_SOURCE_IDS as readonly string[]).includes(source)) {
			throw new Error(`Unknown Austrian source: ${source} (known: ${AT_SOURCE_IDS.join(", ")})`);
		}
	}
	if (sources.length === 0) throw new Error("At least one Austrian source is required");
	return [...new Set(sources)] as AtSourceId[];
}

const envKey = (source: AtSourceId) => `ETL_AT_${source.toUpperCase().replace("-", "_")}_URL`;

export function buildAtOptions(flags: ParsedArgs["flags"], env: NodeJS.ProcessEnv): AtOptions {
	const approve = flagString(flags, "approve");
	if (approve !== null && !/^\d+$/.test(approve)) {
		throw new Error(`--approve needs a run id, got ${approve}`);
	}
	const offline = flags.has("offline");
	const urls = Object.fromEntries(
		AT_SOURCE_IDS.map((source) => [source, env[envKey(source)] || DEFAULT_AT_URLS[source]]),
	) as Record<AtSourceId, string>;
	return {
		databaseUrl: resolveDatabaseUrl(env),
		sources: parseAtSources(flagString(flags, "sources") ?? env.ETL_AT_SOURCES),
		dryRun: flags.has("dry-run"),
		approveRunId: approve === null ? null : Number(approve),
		force: flags.has("force"),
		sourceDir: flagString(flags, "source-dir") ?? env.ETL_AT_SOURCE_DIR ?? null,
		offline,
		urls,
		placesUrl: env.ETL_AT_PLACES_URL || DEFAULT_AT_PLACES_URL,
		workDir: flagString(flags, "work-dir") ?? env.ETL_WORK_DIR ?? null,
		appUrl: offline ? null : env.APP_URL || null,
		revalidateSecret: env.REVALIDATE_SECRET || null,
	};
}

// ---------------------------------------------------------------------------
// United Kingdom (`etl:gb`)
// ---------------------------------------------------------------------------

const ODS_REPORT = "https://www.odsdatasearchandexport.nhs.uk/api/getReport?report=";
const PHS_DATASET = "https://www.opendata.nhs.scot/api/3/action/package_show?id=";
const OPENDATANI_DATASET = "https://admin.opendatani.gov.uk/api/3/action/package_show?id=";

/**
 * Where each UK list is published, each overridable with `ETL_GB_{SOURCE}_URL`
 * (`ETL_GB_ODS_GP_URL`, `ETL_GB_PHS_DENT_URL`…). The ODS reports are files; the Scottish and
 * Northern Irish lists are CKAN datasets (`package_show`) whose latest CSV is downloaded, with
 * the resource name each must match.
 */
export const DEFAULT_GB_URLS: Record<GbSourceId, string> = {
	"ods-gp": `${ODS_REPORT}epraccur`,
	"ods-branches": `${ODS_REPORT}ebranchs`,
	"ods-dent": `${ODS_REPORT}egdpprac`,
	"ods-pharm": `${ODS_REPORT}edispensary`,
	"phs-gp": `${PHS_DATASET}gp-practice-contact-details-and-list-sizes`,
	"phs-dent": `${PHS_DATASET}dental-practices-and-patient-registrations`,
	"phs-pharm": `${PHS_DATASET}dispenser-location-contact-details`,
	"bso-gp": `${OPENDATANI_DATASET}gp-practice-list-sizes`,
	"bso-dent": `${OPENDATANI_DATASET}general-dental-services-statistics`,
};

/** The resource of a CKAN dataset each list reads (the dental dataset also lists the dentists). */
export const GB_RESOURCE_PATTERNS: Partial<Record<GbSourceId, RegExp>> = {
	"phs-gp": /practice/i,
	"phs-dent": /dental practices/i,
	"phs-pharm": /dispenser/i,
	"bso-gp": /reference file/i,
	"bso-dent": /surgery list/i,
};

/** File names expected in `--source-dir` for `etl:gb` (fixtures, offline runs). */
export const GB_SOURCE_FILES: Record<GbSourceId, string> = {
	"ods-gp": "epraccur.csv",
	"ods-branches": "ebranchs.csv",
	"ods-dent": "egdpprac.csv",
	"ods-pharm": "edispensary.csv",
	"phs-gp": "phs-gp.csv",
	"phs-dent": "phs-dental.csv",
	"phs-pharm": "phs-dispensers.csv",
	"bso-gp": "bso-gp.csv",
	"bso-dent": "bso-dental.csv",
};

/** Code-Point Open in `--source-dir`: the release ZIP, or one CSV of it for fixtures. */
export const GB_POSTCODES_FILES = ["codepo_gb.zip", "codepoint.csv"] as const;

export type GbOptions = {
	databaseUrl: string;
	/** The lists to import (default: all). */
	sources: GbSourceId[];
	dryRun: boolean;
	approveRunId: number | null;
	force: boolean;
	sourceDir: string | null;
	offline: boolean;
	urls: Record<GbSourceId, string>;
	postcodesUrl: string;
	placesUrls: { ladLookup: string; ladBoundaries: string; towns: string; niTowns: string };
	workDir: string | null;
	appUrl: string | null;
	revalidateSecret: string | null;
};

/** Parses a comma-separated list of UK sources (`ods-gp,phs-gp`); throws on unknown ones. */
export function parseGbSources(value: string | undefined | null): GbSourceId[] {
	if (!value) return [...GB_SOURCE_IDS];
	const sources = value
		.split(",")
		.map((source) => source.trim())
		.filter(Boolean);
	for (const source of sources) {
		if (!(GB_SOURCE_IDS as readonly string[]).includes(source)) {
			throw new Error(`Unknown UK source: ${source} (known: ${GB_SOURCE_IDS.join(", ")})`);
		}
	}
	if (sources.length === 0) throw new Error("At least one UK source is required");
	return [...new Set(sources)] as GbSourceId[];
}

const gbEnvKey = (source: GbSourceId) => `ETL_GB_${source.toUpperCase().replace("-", "_")}_URL`;

/** The UK places' sources, each overridable (`ETL_GB_LAD_LOOKUP_URL`…). */
export function gbPlacesUrls(env: NodeJS.ProcessEnv): GbOptions["placesUrls"] {
	return {
		ladLookup: env.ETL_GB_LAD_LOOKUP_URL || DEFAULT_GB_LAD_LOOKUP_URL,
		ladBoundaries: env.ETL_GB_LAD_BOUNDARIES_URL || DEFAULT_GB_LAD_BOUNDARIES_URL,
		towns: env.ETL_GB_TOWNS_URL || DEFAULT_GB_TOWNS_URL,
		niTowns: env.ETL_GB_NI_TOWNS_URL || DEFAULT_GB_NI_TOWNS_URL,
	};
}

export function buildGbOptions(flags: ParsedArgs["flags"], env: NodeJS.ProcessEnv): GbOptions {
	const approve = flagString(flags, "approve");
	if (approve !== null && !/^\d+$/.test(approve)) {
		throw new Error(`--approve needs a run id, got ${approve}`);
	}
	const offline = flags.has("offline");
	const urls = Object.fromEntries(
		GB_SOURCE_IDS.map((source) => [source, env[gbEnvKey(source)] || DEFAULT_GB_URLS[source]]),
	) as Record<GbSourceId, string>;
	return {
		databaseUrl: resolveDatabaseUrl(env),
		sources: parseGbSources(flagString(flags, "sources") ?? env.ETL_GB_SOURCES),
		dryRun: flags.has("dry-run"),
		approveRunId: approve === null ? null : Number(approve),
		force: flags.has("force"),
		sourceDir: flagString(flags, "source-dir") ?? env.ETL_GB_SOURCE_DIR ?? null,
		offline,
		urls,
		postcodesUrl: env.ETL_GB_POSTCODES_URL || DEFAULT_GB_POSTCODES_URL,
		placesUrls: gbPlacesUrls(env),
		workDir: flagString(flags, "work-dir") ?? env.ETL_WORK_DIR ?? null,
		appUrl: offline ? null : env.APP_URL || null,
		revalidateSecret: env.REVALIDATE_SECRET || null,
	};
}

// ---------------------------------------------------------------------------
// Czechia (`etl:cz`)
// ---------------------------------------------------------------------------

/**
 * The NRPZS places of care (ÚZIS ČR, monthly, CC BY 4.0), overridable with `ETL_CZ_URL`.
 * Catalogue page: https://www.nzip.cz/data/1823-narodni-registr-poskytovatelu-zdravotnich-sluzeb-otevrena-data
 */
export const DEFAULT_CZ_URL =
	"https://datanzis.uzis.gov.cz/data/NR-01-NRPZS/NR-01-06/Otevrena-data-NR-01-06-nrpzs-mista-poskytovani-zdravotnich-sluzeb.csv";

/** File name expected in `--source-dir` for `etl:cz` (fixtures, offline runs). */
export const CZ_SOURCE_FILE = "nrpzs.csv";

export type CzOptions = {
	databaseUrl: string;
	dryRun: boolean;
	approveRunId: number | null;
	force: boolean;
	sourceDir: string | null;
	offline: boolean;
	url: string;
	/** RÚIAN state files to try in turn for the places (`ETL_CZ_PLACES_URL`, else the latest month's). */
	placesUrls: string[];
	workDir: string | null;
	appUrl: string | null;
	revalidateSecret: string | null;
};

/** The RÚIAN state file of the places: `ETL_CZ_PLACES_URL`, else last month's, then the month before. */
export function czPlacesUrls(env: NodeJS.ProcessEnv, now: Date = new Date()): string[] {
	return env.ETL_CZ_PLACES_URL ? [env.ETL_CZ_PLACES_URL] : defaultCzPlacesUrls(now);
}

export function buildCzOptions(flags: ParsedArgs["flags"], env: NodeJS.ProcessEnv): CzOptions {
	const approve = flagString(flags, "approve");
	if (approve !== null && !/^\d+$/.test(approve)) {
		throw new Error(`--approve needs a run id, got ${approve}`);
	}
	const offline = flags.has("offline");
	return {
		databaseUrl: resolveDatabaseUrl(env),
		dryRun: flags.has("dry-run"),
		approveRunId: approve === null ? null : Number(approve),
		force: flags.has("force"),
		sourceDir: flagString(flags, "source-dir") ?? env.ETL_CZ_SOURCE_DIR ?? null,
		offline,
		url: env.ETL_CZ_URL || DEFAULT_CZ_URL,
		placesUrls: czPlacesUrls(env),
		workDir: flagString(flags, "work-dir") ?? env.ETL_WORK_DIR ?? null,
		appUrl: offline ? null : env.APP_URL || null,
		revalidateSecret: env.REVALIDATE_SECRET || null,
	};
}

// ---------------------------------------------------------------------------
// Lithuania (`etl:lt`)
// ---------------------------------------------------------------------------

/** VASPVT's licence register in the open data store (data.gov.lt dataset 1623, CC BY 4.0, daily). */
export const DEFAULT_LT_VASPVT_BASE = "https://get.data.gov.lt/datasets/gov/vaspvt/licencijos";

/** The least time between two requests to data.gov.lt or its store (it answers 429 to more). */
export const DEFAULT_LT_REQUEST_INTERVAL_MS = 20_000;

/** Attempts of one request on a 429 or a server error before the run gives up. */
export const DEFAULT_LT_REQUEST_ATTEMPTS = 6;

export type LtOptions = {
	databaseUrl: string;
	dryRun: boolean;
	approveRunId: number | null;
	force: boolean;
	sourceDir: string | null;
	offline: boolean;
	/** The store's namespace of VASPVT's models (`ETL_LT_VASPVT_URL`). */
	vaspvtBase: string;
	/** The store's namespace of the Address Register (`ETL_LT_ADDRESS_URL`). */
	addressBase: string;
	/** The dataset page whose licence is checked before downloading (`ETL_LT_DATASET_PAGE`). */
	datasetPage: string;
	/** Least gap between two requests (`ETL_LT_REQUEST_INTERVAL_MS`, at least 1 s). */
	requestIntervalMs: number;
	/** Attempts of a request answered 429 or 5xx (`ETL_LT_REQUEST_ATTEMPTS`). */
	requestAttempts: number;
	workDir: string | null;
	appUrl: string | null;
	revalidateSecret: string | null;
};

/** A positive whole number from the environment, else `fallback`. */
function positiveInteger(value: string | undefined, fallback: number, min = 1): number {
	if (!value) return fallback;
	if (!/^\d+$/.test(value.trim())) throw new Error(`Not a whole number: ${value}`);
	return Math.max(min, Number(value));
}

export function buildLtOptions(flags: ParsedArgs["flags"], env: NodeJS.ProcessEnv): LtOptions {
	const approve = flagString(flags, "approve");
	if (approve !== null && !/^\d+$/.test(approve)) {
		throw new Error(`--approve needs a run id, got ${approve}`);
	}
	const offline = flags.has("offline");
	return {
		databaseUrl: resolveDatabaseUrl(env),
		dryRun: flags.has("dry-run"),
		approveRunId: approve === null ? null : Number(approve),
		force: flags.has("force"),
		sourceDir: flagString(flags, "source-dir") ?? env.ETL_LT_SOURCE_DIR ?? null,
		offline,
		vaspvtBase: env.ETL_LT_VASPVT_URL || DEFAULT_LT_VASPVT_BASE,
		addressBase: env.ETL_LT_ADDRESS_URL || DEFAULT_LT_ADDRESS_BASE,
		datasetPage: env.ETL_LT_DATASET_PAGE || "https://data.gov.lt/datasets/1623/",
		requestIntervalMs: positiveInteger(
			env.ETL_LT_REQUEST_INTERVAL_MS,
			DEFAULT_LT_REQUEST_INTERVAL_MS,
			1_000,
		),
		requestAttempts: positiveInteger(env.ETL_LT_REQUEST_ATTEMPTS, DEFAULT_LT_REQUEST_ATTEMPTS),
		workDir: flagString(flags, "work-dir") ?? env.ETL_WORK_DIR ?? null,
		appUrl: offline ? null : env.APP_URL || null,
		revalidateSecret: env.REVALIDATE_SECRET || null,
	};
}

// ---------------------------------------------------------------------------
// Spain (`etl:es`)
// ---------------------------------------------------------------------------

/**
 * The monthly extracts of REGCESS (Ministerio de Sanidad), one per listing, each overridable
 * (`ETL_ES_C1_URL`, `ETL_ES_C2_URL`, `ETL_ES_E_URL`). Search page:
 * https://regcess.mscbs.es/regcessWeb/inicioDescargaCentrosAction.do
 */
export const DEFAULT_ES_URL_BASE =
	"https://regcesslm.sanidad.gob.es/recesAdminWeb/lm/GetExcelListadoMensual?tipoListado=";

export type EsOptions = {
	databaseUrl: string;
	dryRun: boolean;
	approveRunId: number | null;
	force: boolean;
	sourceDir: string | null;
	offline: boolean;
	sources: EsSourceId[];
	urls: Record<EsSourceId, string>;
	/** The IGN's OGC API Features for the places (`ETL_ES_PLACES_URL`). */
	placesBase: string;
	workDir: string | null;
	appUrl: string | null;
	revalidateSecret: string | null;
};

/** Parses a comma-separated list of Spanish extracts (`regcess-c1,regcess-e`); throws on unknown ones. */
export function parseEsSources(value: string | null | undefined): EsSourceId[] {
	if (!value) return [...ES_SOURCE_IDS];
	const sources = value
		.split(",")
		.map((source) => source.trim())
		.filter(Boolean);
	for (const source of sources) {
		if (!(ES_SOURCE_IDS as readonly string[]).includes(source)) {
			throw new Error(`Unknown Spanish source "${source}" (one of ${ES_SOURCE_IDS.join(", ")})`);
		}
	}
	if (sources.length === 0) throw new Error("At least one Spanish source is required");
	return [...new Set(sources)] as EsSourceId[];
}

/** The IGN's API base for the Spanish places: `ETL_ES_PLACES_URL`, else api-features.ign.es. */
export function esPlacesBase(env: NodeJS.ProcessEnv): string {
	return env.ETL_ES_PLACES_URL || DEFAULT_ES_PLACES_BASE;
}

export function buildEsOptions(flags: ParsedArgs["flags"], env: NodeJS.ProcessEnv): EsOptions {
	const approve = flagString(flags, "approve");
	if (approve !== null && !/^\d+$/.test(approve)) {
		throw new Error(`--approve needs a run id, got ${approve}`);
	}
	const offline = flags.has("offline");
	const urlOf = (source: EsSourceId) =>
		env[`ETL_ES_${ES_SOURCES[source].listing}_URL`] ||
		`${DEFAULT_ES_URL_BASE}${ES_SOURCES[source].listing}`;
	return {
		databaseUrl: resolveDatabaseUrl(env),
		dryRun: flags.has("dry-run"),
		approveRunId: approve === null ? null : Number(approve),
		force: flags.has("force"),
		sourceDir: flagString(flags, "source-dir") ?? env.ETL_ES_SOURCE_DIR ?? null,
		offline,
		sources: parseEsSources(flagString(flags, "sources") ?? env.ETL_ES_SOURCES),
		urls: {
			"regcess-c1": urlOf("regcess-c1"),
			"regcess-c2": urlOf("regcess-c2"),
			"regcess-e": urlOf("regcess-e"),
		},
		placesBase: esPlacesBase(env),
		workDir: flagString(flags, "work-dir") ?? env.ETL_WORK_DIR ?? null,
		appUrl: offline ? null : env.APP_URL || null,
		revalidateSecret: env.REVALIDATE_SECRET || null,
	};
}

// ---------------------------------------------------------------------------
// Italy (`etl:it`)
// ---------------------------------------------------------------------------

/** The Ministry of Health's open data portal, whose dataset pages name each day's file. */
export const DEFAULT_IT_PORTAL_URL = "https://www.dati.salute.gov.it";

export type ItOptions = {
	databaseUrl: string;
	dryRun: boolean;
	approveRunId: number | null;
	force: boolean;
	sourceDir: string | null;
	offline: boolean;
	sources: ItSourceId[];
	/**
	 * A list's file when given (`ETL_IT_FARMACIE_URL`, `ETL_IT_PARAFARMACIE_URL`,
	 * `ETL_IT_POSTI_LETTO_URL`); else null, and the run reads the current file's address from the
	 * dataset's page on the portal (the pharmacies' file is renamed every day).
	 */
	urls: Record<ItSourceId, string | null>;
	/** The portal (`ETL_IT_PORTAL_URL`). */
	portalUrl: string;
	/** ISTAT's boundaries for the places (`ETL_IT_PLACES_URL`). */
	placesUrl: string;
	/**
	 * Keep the lists' coordinates (`--register-coordinates`, `ETL_IT_REGISTER_COORDINATES=1`):
	 * the ministry says some were found through OpenStreetMap (ODbL), so by default a place is
	 * located at its municipality's centre.
	 */
	registerCoordinates: boolean;
	/** The day the lists are read for (`--as-of`, else today in Rome), `YYYY-MM-DD`. */
	asOf: string;
	workDir: string | null;
	appUrl: string | null;
	revalidateSecret: string | null;
};

/** Parses a comma-separated list of Italian lists (`farmacie,posti-letto`); throws on unknown ones. */
export function parseItSources(value: string | null | undefined): ItSourceId[] {
	if (!value) return [...IT_SOURCE_IDS];
	const sources = value
		.split(",")
		.map((source) => source.trim())
		.filter(Boolean);
	for (const source of sources) {
		if (!(IT_SOURCE_IDS as readonly string[]).includes(source)) {
			throw new Error(`Unknown Italian source "${source}" (one of ${IT_SOURCE_IDS.join(", ")})`);
		}
	}
	if (sources.length === 0) throw new Error("At least one Italian source is required");
	return [...new Set(sources)] as ItSourceId[];
}

/** ISTAT's boundaries for the Italian places: `ETL_IT_PLACES_URL`, else the year's. */
export function itPlacesUrl(env: NodeJS.ProcessEnv): string {
	return env.ETL_IT_PLACES_URL || defaultItPlacesUrl();
}

/** Today in Rome, `YYYY-MM-DD`. */
export function todayInRome(now: Date = new Date()): string {
	return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(now);
}

export function buildItOptions(flags: ParsedArgs["flags"], env: NodeJS.ProcessEnv): ItOptions {
	const approve = flagString(flags, "approve");
	if (approve !== null && !/^\d+$/.test(approve)) {
		throw new Error(`--approve needs a run id, got ${approve}`);
	}
	const asOf = flagString(flags, "as-of") ?? todayInRome();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error(`--as-of needs a date, got ${asOf}`);
	const offline = flags.has("offline");
	return {
		databaseUrl: resolveDatabaseUrl(env),
		dryRun: flags.has("dry-run"),
		approveRunId: approve === null ? null : Number(approve),
		force: flags.has("force"),
		sourceDir: flagString(flags, "source-dir") ?? env.ETL_IT_SOURCE_DIR ?? null,
		offline,
		sources: parseItSources(flagString(flags, "sources") ?? env.ETL_IT_SOURCES),
		urls: {
			farmacie: env.ETL_IT_FARMACIE_URL || null,
			parafarmacie: env.ETL_IT_PARAFARMACIE_URL || null,
			"posti-letto": env.ETL_IT_POSTI_LETTO_URL || null,
		},
		portalUrl: env.ETL_IT_PORTAL_URL || DEFAULT_IT_PORTAL_URL,
		placesUrl: itPlacesUrl(env),
		registerCoordinates:
			flags.has("register-coordinates") || env.ETL_IT_REGISTER_COORDINATES === "1",
		asOf,
		workDir: flagString(flags, "work-dir") ?? env.ETL_WORK_DIR ?? null,
		appUrl: offline ? null : env.APP_URL || null,
		revalidateSecret: env.REVALIDATE_SECRET || null,
	};
}

// ---------------------------------------------------------------------------
// Germany (`etl:de`)
// ---------------------------------------------------------------------------

/**
 * Where Destatis publishes each edition of the directory of hospitals and prevention or
 * rehabilitation clinics: the product number embeds the reporting year's last two digits
 * (`3500100247005` is 2024's).
 */
export const destatisEditionUrl = (year: number) =>
	`https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Gesundheit/Krankenhauser/Publikationen/Downloads-Krankenhaeuser/krankenhausverzeichnis-3500100${String(year % 100).padStart(2, "0")}7005.xlsx?__blob=publicationFile`;

/**
 * The statistical offices' joint portal's page of the directory, which links its latest edition
 * (`/sites/default/files/2026-06/krankenhausverzeichnis_24.xlsx`): read to find an edition whose
 * Destatis address is not the expected one (`ETL_DE_KHV_INDEX_URL`).
 */
export const DEFAULT_DE_KHV_INDEX_URL =
	"https://www.statistikportal.de/de/veroeffentlichungen/krankenhausverzeichnis";

/** The portal's copy of the 2024 edition: the last resort (`ETL_DE_KHV_MIRROR_URL`). */
export const DEFAULT_DE_KHV_MIRROR_URL =
	"https://www.statistikportal.de/sites/default/files/2026-06/krankenhausverzeichnis_24.xlsx";

/** The pharmacy lists (`ETL_DE_APO_TH_URL`, `ETL_DE_APO_BB_URL`). */
export const DEFAULT_DE_PHARMACY_URLS = {
	"apo-th": "https://www.geoproxy.geoportal-th.de/download-service/opendata/giz/apotheke.zip",
	"apo-bb":
		"https://ogc-api.geobasis-bb.de/datasets/apotheken/collections/apotheken/items?bulk=true&f=json",
} as const;

export type DeOptions = {
	databaseUrl: string;
	dryRun: boolean;
	approveRunId: number | null;
	force: boolean;
	sourceDir: string | null;
	offline: boolean;
	sources: DeSourceId[];
	/**
	 * The URLs tried in turn for each file, the first that downloads wins: for the directory, the
	 * configured one alone, else the Destatis addresses of the editions that may be the latest
	 * (last year's first), then the portal's latest link (`khvIndexUrl`), then its known copy.
	 */
	urls: Record<DeFileId, string[]>;
	/** The portal's page read for the latest edition's link, or null not to read it. */
	khvIndexUrl: string | null;
	/** GV-ISys's latest extract for the places (`ETL_DE_PLACES_URL`). */
	placesUrl: string;
	workDir: string | null;
	appUrl: string | null;
	revalidateSecret: string | null;
};

/** Parses a comma-separated list of German sources (`khv,apo-th`); throws on unknown ones. */
export function parseDeSources(value: string | null | undefined): DeSourceId[] {
	if (!value) return [...DE_SOURCE_IDS];
	const sources = value
		.split(",")
		.map((source) => source.trim())
		.filter(Boolean);
	for (const source of sources) {
		if (!(DE_SOURCE_IDS as readonly string[]).includes(source)) {
			throw new Error(`Unknown German source "${source}" (one of ${DE_SOURCE_IDS.join(", ")})`);
		}
	}
	if (sources.length === 0) throw new Error("At least one German source is required");
	return [...new Set(sources)] as DeSourceId[];
}

/**
 * The addresses of the directory to try, newest edition first: `ETL_DE_KHV_URL` alone when set;
 * else Destatis's for last year's and the year before's reporting years (an edition comes out
 * some five months after its year ends), then the mirror (`ETL_DE_KHV_MIRROR_URL`).
 */
export function deDirectoryUrls(env: NodeJS.ProcessEnv, now: Date = new Date()): string[] {
	if (env.ETL_DE_KHV_URL) return [env.ETL_DE_KHV_URL];
	const year = now.getUTCFullYear();
	return [
		destatisEditionUrl(year - 1),
		destatisEditionUrl(year - 2),
		env.ETL_DE_KHV_MIRROR_URL || DEFAULT_DE_KHV_MIRROR_URL,
	];
}

export function buildDeOptions(
	flags: ParsedArgs["flags"],
	env: NodeJS.ProcessEnv,
	now: Date = new Date(),
): DeOptions {
	const approve = flagString(flags, "approve");
	if (approve !== null && !/^\d+$/.test(approve)) {
		throw new Error(`--approve needs a run id, got ${approve}`);
	}
	const offline = flags.has("offline");
	return {
		databaseUrl: resolveDatabaseUrl(env),
		dryRun: flags.has("dry-run"),
		approveRunId: approve === null ? null : Number(approve),
		force: flags.has("force"),
		sourceDir: flagString(flags, "source-dir") ?? env.ETL_DE_SOURCE_DIR ?? null,
		offline,
		sources: parseDeSources(flagString(flags, "sources") ?? env.ETL_DE_SOURCES),
		urls: {
			destatis: deDirectoryUrls(env, now),
			"apo-th": [env.ETL_DE_APO_TH_URL || DEFAULT_DE_PHARMACY_URLS["apo-th"]],
			"apo-bb": [env.ETL_DE_APO_BB_URL || DEFAULT_DE_PHARMACY_URLS["apo-bb"]],
		},
		khvIndexUrl: env.ETL_DE_KHV_URL ? null : env.ETL_DE_KHV_INDEX_URL || DEFAULT_DE_KHV_INDEX_URL,
		placesUrl: env.ETL_DE_PLACES_URL || DEFAULT_DE_PLACES_URL,
		workDir: flagString(flags, "work-dir") ?? env.ETL_WORK_DIR ?? null,
		appUrl: offline ? null : env.APP_URL || null,
		revalidateSecret: env.REVALIDATE_SECRET || null,
	};
}

export type ChOptions = {
	databaseUrl: string;
	dryRun: boolean;
	approveRunId: number | null;
	force: boolean;
	sourceDir: string | null;
	offline: boolean;
	sources: ChSourceId[];
	/** A list's address when overridden (`ETL_CH_<ID>_URL`, `ETL_CH_ZH_HEIME_URL`); else its own. */
	urls: Partial<Record<ChSourceId, string>>;
	/** swisstopo's postcode directory (`ETL_CH_POSTCODES_URL`), read by every run to locate facilities. */
	postcodesUrl: string | null;
	/** The BFS commune register (`ETL_CH_COMMUNES_URL`), for the places' first import. */
	communesUrl: string | null;
	/** The day of the run in Zürich (`YYYY-MM-DD`): the commune register is read on it. */
	today: string;
	workDir: string | null;
	appUrl: string | null;
	revalidateSecret: string | null;
};

/**
 * Parses a comma-separated list of Swiss lists: the lists to import (`bag,zh-heime`), or every
 * list but some, each prefixed with a minus (`-ge-hopitaux,-ge-ems,-ge-pharmacies`). The two
 * forms never mix. Throws on unknown ones, and when no list is left.
 */
export function parseChSources(value: string | null | undefined): ChSourceId[] {
	if (!value) return [...CH_SOURCE_IDS];
	const entries = value
		.split(",")
		.map((source) => source.trim())
		.filter(Boolean);
	const excluded = entries.filter((entry) => entry.startsWith("-"));
	if (excluded.length > 0 && excluded.length < entries.length) {
		throw new Error(
			`Swiss sources are either listed (bag,zh-heime) or all excluded with a minus (-ge-ems), never both: "${value}"`,
		);
	}
	const sources = excluded.length > 0 ? excluded.map((entry) => entry.slice(1)) : entries;
	for (const source of sources) {
		if (!(CH_SOURCE_IDS as readonly string[]).includes(source)) {
			throw new Error(`Unknown Swiss source "${source}" (one of ${CH_SOURCE_IDS.join(", ")})`);
		}
	}
	const selected =
		excluded.length > 0 ? CH_SOURCE_IDS.filter((id) => !sources.includes(id)) : sources;
	if (selected.length === 0) throw new Error("At least one Swiss source is required");
	return [...new Set(selected)] as ChSourceId[];
}

/** Today in Zürich, `YYYY-MM-DD`. */
export function todayInZurich(now: Date = new Date()): string {
	return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(now);
}

export function buildChOptions(flags: ParsedArgs["flags"], env: NodeJS.ProcessEnv): ChOptions {
	const approve = flagString(flags, "approve");
	if (approve !== null && !/^\d+$/.test(approve)) {
		throw new Error(`--approve needs a run id, got ${approve}`);
	}
	const offline = flags.has("offline");
	const urls: Partial<Record<ChSourceId, string>> = {};
	for (const id of CH_SOURCE_IDS) {
		const url = env[chSourceUrlVariable(id)];
		if (url) urls[id] = url;
	}
	return {
		databaseUrl: resolveDatabaseUrl(env),
		dryRun: flags.has("dry-run"),
		approveRunId: approve === null ? null : Number(approve),
		force: flags.has("force"),
		sourceDir: flagString(flags, "source-dir") ?? env.ETL_CH_SOURCE_DIR ?? null,
		offline,
		sources: parseChSources(flagString(flags, "sources") ?? env.ETL_CH_SOURCES),
		urls,
		postcodesUrl: env.ETL_CH_POSTCODES_URL || null,
		communesUrl: env.ETL_CH_COMMUNES_URL || null,
		today: todayInZurich(),
		workDir: flagString(flags, "work-dir") ?? env.ETL_WORK_DIR ?? null,
		appUrl: offline ? null : env.APP_URL || null,
		revalidateSecret: env.REVALIDATE_SECRET || null,
	};
}

// ---------------------------------------------------------------------------
// Estonia (`etl:ee`)
// ---------------------------------------------------------------------------

/** The Health Board's register of providers and licences (`ETL_EE_MEDRE_URL`), rebuilt daily. */
export const DEFAULT_EE_MEDRE_URL = "https://medre.tehik.ee/api-common/public/companies/open-data";

export type EeOptions = {
	databaseUrl: string;
	dryRun: boolean;
	approveRunId: number | null;
	force: boolean;
	sourceDir: string | null;
	offline: boolean;
	sources: EeSourceId[];
	/**
	 * Each file's address: the register's open data, the pharmacies' search page (whose export
	 * button is submitted), the address data system's file.
	 */
	urls: Record<EeFileId, string>;
	/** The settlements' shapefile for the places (`ETL_EE_PLACES_URL`). */
	placesUrl: string;
	/** The day of the run in Tallinn (`YYYY-MM-DD`): the licences in force on it are read. */
	today: string;
	workDir: string | null;
	appUrl: string | null;
	revalidateSecret: string | null;
};

/** Parses a comma-separated list of Estonian sources (`medre,apteegid`); throws on unknown ones. */
export function parseEeSources(value: string | null | undefined): EeSourceId[] {
	if (!value) return [...EE_SOURCE_IDS];
	const sources = value
		.split(",")
		.map((source) => source.trim())
		.filter(Boolean);
	for (const source of sources) {
		if (!(EE_SOURCE_IDS as readonly string[]).includes(source)) {
			throw new Error(`Unknown Estonian source "${source}" (one of ${EE_SOURCE_IDS.join(", ")})`);
		}
	}
	if (sources.length === 0) throw new Error("At least one Estonian source is required");
	return [...new Set(sources)] as EeSourceId[];
}

/** Today in Tallinn, `YYYY-MM-DD`. */
export function todayInTallinn(now: Date = new Date()): string {
	return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Tallinn" }).format(now);
}

export function buildEeOptions(
	flags: ParsedArgs["flags"],
	env: NodeJS.ProcessEnv,
	now: Date = new Date(),
): EeOptions {
	const approve = flagString(flags, "approve");
	if (approve !== null && !/^\d+$/.test(approve)) {
		throw new Error(`--approve needs a run id, got ${approve}`);
	}
	const asOf = flagString(flags, "as-of");
	if (asOf !== null && !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
		throw new Error(`--as-of needs a date (YYYY-MM-DD), got ${asOf}`);
	}
	const offline = flags.has("offline");
	return {
		databaseUrl: resolveDatabaseUrl(env),
		dryRun: flags.has("dry-run"),
		approveRunId: approve === null ? null : Number(approve),
		force: flags.has("force"),
		sourceDir: flagString(flags, "source-dir") ?? env.ETL_EE_SOURCE_DIR ?? null,
		offline,
		sources: parseEeSources(flagString(flags, "sources") ?? env.ETL_EE_SOURCES),
		urls: {
			medre: env.ETL_EE_MEDRE_URL || DEFAULT_EE_MEDRE_URL,
			apteegid: env.ETL_EE_APTEEGID_URL || DEFAULT_EE_PHARMACIES_URL,
			ads: env.ETL_EE_ADS_URL || DEFAULT_EE_ADS_URL,
		},
		placesUrl: env.ETL_EE_PLACES_URL || DEFAULT_EE_PLACES_URL,
		today: asOf ?? todayInTallinn(now),
		workDir: flagString(flags, "work-dir") ?? env.ETL_WORK_DIR ?? null,
		appUrl: offline ? null : env.APP_URL || null,
		revalidateSecret: env.REVALIDATE_SECRET || null,
	};
}

// ---------------------------------------------------------------------------
// Poland (`etl:pl`)
// ---------------------------------------------------------------------------

/**
 * RPWDL's healthcare entities (Centrum e-Zdrowia, daily, CC BY 4.0), dane.gov.pl's copy of the
 * current export (resource 70070 of dataset 728, a stable link refreshed every night),
 * overridable with `ETL_PL_URL`. Centrum e-Zdrowia serves the same ZIP at
 * https://rpwdl2.ezdrowie.gov.pl/api/rpwdl-public-resource/ledgers-zip/initial?fileTypeInsideZip=CSV&activityType=HEALTHCARE_PROVIDER&activeLedgers=true
 */
export const DEFAULT_PL_URL = "https://api.dane.gov.pl/resources/70070/file";

/** File name expected in `--source-dir` for `etl:pl` (fixtures, offline runs). */
export const PL_SOURCE_FILE = "rpwdl.zip";

export type PlOptions = {
	databaseUrl: string;
	dryRun: boolean;
	approveRunId: number | null;
	force: boolean;
	sourceDir: string | null;
	offline: boolean;
	url: string;
	/** TERC (eTERYT's download page, `ETL_PL_TERC_URL`) and PRG's administrative units (`ETL_PL_PRG_URL`). */
	placesUrls: { terc: string; prg: string };
	/** The day the register is read for (`--as-of`, else today in Warsaw), `YYYY-MM-DD`. */
	asOf: string;
	workDir: string | null;
	appUrl: string | null;
	revalidateSecret: string | null;
};

/** Today in Warsaw, `YYYY-MM-DD`. */
export function todayInWarsaw(now: Date = new Date()): string {
	return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(now);
}

/** TERC's page and PRG's archive for the places: `ETL_PL_TERC_URL`, `ETL_PL_PRG_URL`, else the publishers'. */
export function plPlacesUrls(env: NodeJS.ProcessEnv): { terc: string; prg: string } {
	return {
		terc: env.ETL_PL_TERC_URL || DEFAULT_PL_TERC_URL,
		prg: env.ETL_PL_PRG_URL || DEFAULT_PL_PRG_URL,
	};
}

export function buildPlOptions(flags: ParsedArgs["flags"], env: NodeJS.ProcessEnv): PlOptions {
	const approve = flagString(flags, "approve");
	if (approve !== null && !/^\d+$/.test(approve)) {
		throw new Error(`--approve needs a run id, got ${approve}`);
	}
	const asOf = flagString(flags, "as-of") ?? todayInWarsaw();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error(`--as-of needs a date, got ${asOf}`);
	const offline = flags.has("offline");
	return {
		databaseUrl: resolveDatabaseUrl(env),
		dryRun: flags.has("dry-run"),
		approveRunId: approve === null ? null : Number(approve),
		force: flags.has("force"),
		sourceDir: flagString(flags, "source-dir") ?? env.ETL_PL_SOURCE_DIR ?? null,
		offline,
		url: env.ETL_PL_URL || DEFAULT_PL_URL,
		placesUrls: plPlacesUrls(env),
		asOf,
		workDir: flagString(flags, "work-dir") ?? env.ETL_WORK_DIR ?? null,
		appUrl: offline ? null : env.APP_URL || null,
		revalidateSecret: env.REVALIDATE_SECRET || null,
	};
}
// ---------------------------------------------------------------------------
// Norway (`etl:no`)
// ---------------------------------------------------------------------------

export type NoOptions = {
	databaseUrl: string;
	dryRun: boolean;
	approveRunId: number | null;
	force: boolean;
	sourceDir: string | null;
	offline: boolean;
	sources: NoSourceId[];
	/**
	 * Each file's address: the register's establishments and entities (full files, gzipped CSV)
	 * and Kartverket's national address file.
	 */
	urls: Record<NoFileId, string>;
	/** The counties and municipalities for the places (`ETL_NO_PLACES_URL`). */
	placesUrl: string;
	workDir: string | null;
	appUrl: string | null;
	revalidateSecret: string | null;
};

/** Parses a comma-separated list of Norwegian sources (`brreg`); throws on unknown ones. */
export function parseNoSources(value: string | null | undefined): NoSourceId[] {
	if (!value) return [...NO_SOURCE_IDS];
	const sources = value
		.split(",")
		.map((source) => source.trim())
		.filter(Boolean);
	for (const source of sources) {
		if (!(NO_SOURCE_IDS as readonly string[]).includes(source)) {
			throw new Error(`Unknown Norwegian source "${source}" (one of ${NO_SOURCE_IDS.join(", ")})`);
		}
	}
	if (sources.length === 0) throw new Error("At least one Norwegian source is required");
	return [...new Set(sources)] as NoSourceId[];
}

export function buildNoOptions(flags: ParsedArgs["flags"], env: NodeJS.ProcessEnv): NoOptions {
	const approve = flagString(flags, "approve");
	if (approve !== null && !/^\d+$/.test(approve)) {
		throw new Error(`--approve needs a run id, got ${approve}`);
	}
	const offline = flags.has("offline");
	return {
		databaseUrl: resolveDatabaseUrl(env),
		dryRun: flags.has("dry-run"),
		approveRunId: approve === null ? null : Number(approve),
		force: flags.has("force"),
		sourceDir: flagString(flags, "source-dir") ?? env.ETL_NO_SOURCE_DIR ?? null,
		offline,
		sources: parseNoSources(flagString(flags, "sources") ?? env.ETL_NO_SOURCES),
		urls: {
			underenheter: env.ETL_NO_UNDERENHETER_URL || DEFAULT_NO_UNDERENHETER_URL,
			enheter: env.ETL_NO_ENHETER_URL || DEFAULT_NO_ENHETER_URL,
			adresser: env.ETL_NO_ADRESSER_URL || DEFAULT_NO_ADRESSER_URL,
		},
		placesUrl: env.ETL_NO_PLACES_URL || DEFAULT_NO_PLACES_URL,
		workDir: flagString(flags, "work-dir") ?? env.ETL_WORK_DIR ?? null,
		appUrl: offline ? null : env.APP_URL || null,
		revalidateSecret: env.REVALIDATE_SECRET || null,
	};
}

export type IeOptions = {
	databaseUrl: string;
	dryRun: boolean;
	approveRunId: number | null;
	force: boolean;
	sourceDir: string | null;
	offline: boolean;
	sources: IeSourceId[];
	/** A list's address when overridden (`ETL_IE_<ID>_URL`, `ETL_IE_HSE_HOSPITALS_URL`); else its own. */
	urls: Partial<Record<IeSourceId, string>>;
	/** The places' sources (`ETL_IE_COUNTIES_URL`, `ETL_IE_TOWNS_URL`, `ETL_IE_PLACENAMES_URL`), for their first import. */
	placesUrls: { counties?: string; towns?: string; placenames?: string };
	/** The day of the run in Dublin (`YYYY-MM-DD`). */
	today: string;
	workDir: string | null;
	appUrl: string | null;
	revalidateSecret: string | null;
};

/**
 * Parses a comma-separated list of Irish lists: the lists to import (`psi,hiqa`), or every list
 * but some, each prefixed with a minus (`-hse-health-centres`). The two forms never mix. Throws
 * on unknown ones, and when no list is left.
 */
export function parseIeSources(value: string | null | undefined): IeSourceId[] {
	if (!value) return [...IE_SOURCE_IDS];
	const entries = value
		.split(",")
		.map((source) => source.trim())
		.filter(Boolean);
	const excluded = entries.filter((entry) => entry.startsWith("-"));
	if (excluded.length > 0 && excluded.length < entries.length) {
		throw new Error(
			`Irish sources are either listed (psi,hiqa) or all excluded with a minus (-hiqa), never both: "${value}"`,
		);
	}
	const sources = excluded.length > 0 ? excluded.map((entry) => entry.slice(1)) : entries;
	for (const source of sources) {
		if (!(IE_SOURCE_IDS as readonly string[]).includes(source)) {
			throw new Error(`Unknown Irish source "${source}" (one of ${IE_SOURCE_IDS.join(", ")})`);
		}
	}
	const selected =
		excluded.length > 0 ? IE_SOURCE_IDS.filter((id) => !sources.includes(id)) : sources;
	if (selected.length === 0) throw new Error("At least one Irish source is required");
	return [...new Set(selected)] as IeSourceId[];
}

/** Today in Dublin, `YYYY-MM-DD`. */
export function todayInDublin(now: Date = new Date()): string {
	return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin" }).format(now);
}

/** The places' sources of `etl:places --country ie`, when overridden. */
export function iePlacesUrls(env: NodeJS.ProcessEnv): IeOptions["placesUrls"] {
	return {
		counties: env.ETL_IE_COUNTIES_URL || undefined,
		towns: env.ETL_IE_TOWNS_URL || undefined,
		placenames: env.ETL_IE_PLACENAMES_URL || undefined,
	};
}

export function buildIeOptions(flags: ParsedArgs["flags"], env: NodeJS.ProcessEnv): IeOptions {
	const approve = flagString(flags, "approve");
	if (approve !== null && !/^\d+$/.test(approve)) {
		throw new Error(`--approve needs a run id, got ${approve}`);
	}
	const offline = flags.has("offline");
	const urls: Partial<Record<IeSourceId, string>> = {};
	for (const id of IE_SOURCE_IDS) {
		const url = env[ieSourceUrlVariable(id)];
		if (url) urls[id] = url;
	}
	return {
		databaseUrl: resolveDatabaseUrl(env),
		dryRun: flags.has("dry-run"),
		approveRunId: approve === null ? null : Number(approve),
		force: flags.has("force"),
		sourceDir: flagString(flags, "source-dir") ?? env.ETL_IE_SOURCE_DIR ?? null,
		offline,
		sources: parseIeSources(flagString(flags, "sources") ?? env.ETL_IE_SOURCES),
		urls,
		placesUrls: iePlacesUrls(env),
		today: todayInDublin(),
		workDir: flagString(flags, "work-dir") ?? env.ETL_WORK_DIR ?? null,
		appUrl: offline ? null : env.APP_URL || null,
		revalidateSecret: env.REVALIDATE_SECRET || null,
	};
}

// ---------------------------------------------------------------------------
// Finland (`etl:fi`)
// ---------------------------------------------------------------------------

export type FiOptions = {
	databaseUrl: string;
	dryRun: boolean;
	approveRunId: number | null;
	force: boolean;
	sourceDir: string | null;
	offline: boolean;
	/** The Finnish Service Catalogue's open API (`ETL_FI_PTV_URL`), version 11, without a key. */
	ptvUrl: string;
	/** Requests to the catalogue at a time (`ETL_FI_PTV_CONCURRENCY`, 1 to 8). */
	concurrency: number;
	/** Statistics Finland's municipalities and correspondence tables (`ETL_FI_PLACES_*_URL`). */
	placesUrls: Record<FiPlacesFileId, string>;
	/** The day of the run in Helsinki (`YYYY-MM-DD`), the snapshot's edition. */
	today: string;
	workDir: string | null;
	appUrl: string | null;
	revalidateSecret: string | null;
};

/** Today in Helsinki, `YYYY-MM-DD`. */
export function todayInHelsinki(now: Date = new Date()): string {
	return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Helsinki" }).format(now);
}

/**
 * Statistics Finland's files for the places: the year's (`ETL_FI_PLACES_YEAR`, else
 * `FI_PLACES_YEAR`), each overridable (`ETL_FI_PLACES_MUNICIPALITIES_URL`,
 * `ETL_FI_PLACES_COUNTIES_URL`, `ETL_FI_PLACES_REGIONS_URL`).
 */
export function fiPlacesUrls(env: NodeJS.ProcessEnv): Record<FiPlacesFileId, string> {
	const year = env.ETL_FI_PLACES_YEAR ? Number(env.ETL_FI_PLACES_YEAR) : undefined;
	if (year !== undefined && !(Number.isInteger(year) && year >= 2023 && year <= 2100)) {
		throw new Error(`ETL_FI_PLACES_YEAR needs a year, got ${env.ETL_FI_PLACES_YEAR}`);
	}
	const defaults = defaultFiPlacesUrls(year);
	return {
		municipalities: env.ETL_FI_PLACES_MUNICIPALITIES_URL || defaults.municipalities,
		counties: env.ETL_FI_PLACES_COUNTIES_URL || defaults.counties,
		regions: env.ETL_FI_PLACES_REGIONS_URL || defaults.regions,
	};
}

export function buildFiOptions(
	flags: ParsedArgs["flags"],
	env: NodeJS.ProcessEnv,
	now: Date = new Date(),
): FiOptions {
	const approve = flagString(flags, "approve");
	if (approve !== null && !/^\d+$/.test(approve)) {
		throw new Error(`--approve needs a run id, got ${approve}`);
	}
	const concurrency = env.ETL_FI_PTV_CONCURRENCY
		? Number(env.ETL_FI_PTV_CONCURRENCY)
		: PTV_CONCURRENCY;
	if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
		throw new Error(`ETL_FI_PTV_CONCURRENCY needs 1 to 8, got ${env.ETL_FI_PTV_CONCURRENCY}`);
	}
	const offline = flags.has("offline");
	return {
		databaseUrl: resolveDatabaseUrl(env),
		dryRun: flags.has("dry-run"),
		approveRunId: approve === null ? null : Number(approve),
		force: flags.has("force"),
		sourceDir: flagString(flags, "source-dir") ?? env.ETL_FI_SOURCE_DIR ?? null,
		offline,
		ptvUrl: env.ETL_FI_PTV_URL || DEFAULT_PTV_API,
		concurrency,
		placesUrls: fiPlacesUrls(env),
		today: todayInHelsinki(now),
		workDir: flagString(flags, "work-dir") ?? env.ETL_WORK_DIR ?? null,
		appUrl: offline ? null : env.APP_URL || null,
		revalidateSecret: env.REVALIDATE_SECRET || null,
	};
}

// ---------------------------------------------------------------------------
// Slovenia (`etl:si`)
// ---------------------------------------------------------------------------

/** File names expected in `--source-dir` for `etl:si` (fixtures, offline runs). */
export const SI_SOURCE_FILES: Record<SiSourceId, string> = {
	sa: "zzzs-sa.xlsx",
	gin: "zzzs-gin.xlsx",
	zob: "zzzs-zob.xlsx",
};

export type SiOptions = {
	databaseUrl: string;
	/** The lists to import (default: all three). */
	sources: SiSourceId[];
	dryRun: boolean;
	approveRunId: number | null;
	force: boolean;
	sourceDir: string | null;
	offline: boolean;
	/** The insurer's page linking the day's workbooks (`ETL_SI_PAGE_URL`). */
	pageUrl: string;
	/** The register's web feature service, for a first run without places (`ETL_SI_PLACES_URL`). */
	placesUrl: string;
	today: string;
	workDir: string | null;
	appUrl: string | null;
	revalidateSecret: string | null;
};

/** Parses a comma-separated list of the insurer's lists (`sa,zob`); throws on unknown ones. */
export function parseSiSources(value: string | undefined | null): SiSourceId[] {
	if (!value) return [...SI_SOURCE_IDS];
	const sources = value
		.split(",")
		.map((source) => source.trim())
		.filter(Boolean);
	for (const source of sources) {
		if (!(SI_SOURCE_IDS as readonly string[]).includes(source)) {
			throw new Error(`Unknown Slovenian source: ${source} (known: ${SI_SOURCE_IDS.join(", ")})`);
		}
	}
	if (sources.length === 0) throw new Error("At least one Slovenian source is required");
	return [...new Set(sources)] as SiSourceId[];
}

/** Today in Ljubljana, `YYYY-MM-DD`. */
export function todayInLjubljana(now: Date = new Date()): string {
	return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Ljubljana" }).format(now);
}

export function buildSiOptions(flags: ParsedArgs["flags"], env: NodeJS.ProcessEnv): SiOptions {
	const approve = flagString(flags, "approve");
	if (approve !== null && !/^\d+$/.test(approve)) {
		throw new Error(`--approve needs a run id, got ${approve}`);
	}
	const offline = flags.has("offline");
	return {
		databaseUrl: resolveDatabaseUrl(env),
		sources: parseSiSources(flagString(flags, "sources") ?? env.ETL_SI_SOURCES),
		dryRun: flags.has("dry-run"),
		approveRunId: approve === null ? null : Number(approve),
		force: flags.has("force"),
		sourceDir: flagString(flags, "source-dir") ?? env.ETL_SI_SOURCE_DIR ?? null,
		offline,
		pageUrl: env.ETL_SI_PAGE_URL || ZZZS_LISTS_PAGE,
		placesUrl: env.ETL_SI_PLACES_URL || GURS_WFS,
		today: todayInLjubljana(),
		workDir: flagString(flags, "work-dir") ?? env.ETL_WORK_DIR ?? null,
		appUrl: offline ? null : env.APP_URL || null,
		revalidateSecret: env.REVALIDATE_SECRET || null,
	};
}

// ---------------------------------------------------------------------------
// Cyprus (`etl:cy`)
// ---------------------------------------------------------------------------

/** The Cypriot lists on data.gov.cy (Ministry of Health, CC BY 4.0). */
export const DEFAULT_CY_URLS: Readonly<Record<CySourceId, string>> = {
	farmakeia:
		"https://www.data.gov.cy/sites/default/files/%CE%9A%CE%B1%CF%84%CE%AC%CE%BB%CE%BF%CE%B3%CE%BF%CF%82%20%CE%99%CE%B4%CE%B9%CF%89%CF%84%CE%B9%CE%BA%CF%8E%CE%BD%20%CE%A6%CE%B1%CF%81%CE%BC%CE%B1%CE%BA%CE%B5%CE%AF%CF%89%CE%BD%202024-2025.csv",
	nosokomeia:
		"https://www.data.gov.cy/sites/default/files/%CE%9A%CE%B1%CF%84%CE%AC%CE%BB%CE%BF%CE%B3%CE%BF%CF%82%20%CE%9D%CE%BF%CF%83%CE%BF%CE%BA%CE%BF%CE%BC%CE%B5%CE%AF%CF%89%CE%BD%20%CE%9A%CF%8D%CF%80%CF%81%CE%BF%CF%85_1.csv",
	kentra:
		"https://www.data.gov.cy/sites/default/files/%CE%9A%CE%AD%CE%BD%CF%84%CF%81%CE%B1%20%CE%A5%CE%B3%CE%B5%CE%AF%CE%B1%CF%82%20%CE%9A%CF%8D%CF%80%CF%81%CE%BF%CF%85.csv",
};

export type CyOptions = {
	databaseUrl: string;
	dryRun: boolean;
	approveRunId: number | null;
	force: boolean;
	sourceDir: string | null;
	offline: boolean;
	sources: CySourceId[];
	/** Each list's CSV file on data.gov.cy. */
	urls: Record<CySourceId, string>;
	/** CYSTAT's census table and Cyprus Post's postcodes, for the places. */
	placesUrls: { census: string; postcodes: string };
	workDir: string | null;
	appUrl: string | null;
	revalidateSecret: string | null;
};

/** Parses a comma-separated list of Cypriot sources (`farmakeia,nosokomeia,kentra`); throws on unknown ones. */
export function parseCySources(value: string | null | undefined): CySourceId[] {
	if (!value) return [...CY_SOURCE_IDS];
	const sources = value
		.split(",")
		.map((source) => source.trim())
		.filter(Boolean);
	for (const source of sources) {
		if (!(CY_SOURCE_IDS as readonly string[]).includes(source)) {
			throw new Error(`Unknown Cypriot source "${source}" (one of ${CY_SOURCE_IDS.join(", ")})`);
		}
	}
	if (sources.length === 0) throw new Error("At least one Cypriot source is required");
	return [...new Set(sources)] as CySourceId[];
}

export function buildCyOptions(flags: ParsedArgs["flags"], env: NodeJS.ProcessEnv): CyOptions {
	const approve = flagString(flags, "approve");
	if (approve !== null && !/^\d+$/.test(approve)) {
		throw new Error(`--approve needs a run id, got ${approve}`);
	}
	const offline = flags.has("offline");
	return {
		databaseUrl: resolveDatabaseUrl(env),
		dryRun: flags.has("dry-run"),
		approveRunId: approve === null ? null : Number(approve),
		force: flags.has("force"),
		sourceDir: flagString(flags, "source-dir") ?? env.ETL_CY_SOURCE_DIR ?? null,
		offline,
		sources: parseCySources(flagString(flags, "sources") ?? env.ETL_CY_SOURCES),
		urls: {
			farmakeia: env.ETL_CY_FARMAKEIA_URL || DEFAULT_CY_URLS.farmakeia,
			nosokomeia: env.ETL_CY_NOSOKOMEIA_URL || DEFAULT_CY_URLS.nosokomeia,
			kentra: env.ETL_CY_KENTRA_URL || DEFAULT_CY_URLS.kentra,
		},
		placesUrls: {
			census: env.ETL_CY_CENSUS_URL || DEFAULT_CY_CENSUS_URL,
			postcodes: env.ETL_CY_POSTCODES_URL || DEFAULT_CY_POSTCODES_URL,
		},
		workDir: flagString(flags, "work-dir") ?? env.ETL_WORK_DIR ?? null,
		appUrl: offline ? null : env.APP_URL || null,
		revalidateSecret: env.REVALIDATE_SECRET || null,
	};
}

// ---------------------------------------------------------------------------
// Latvia (`etl:lv`)
// ---------------------------------------------------------------------------

export type LvOptions = {
	databaseUrl: string;
	dryRun: boolean;
	approveRunId: number | null;
	force: boolean;
	sourceDir: string | null;
	offline: boolean;
	sources: LvSourceId[];
	/** A file's address when overridden (`ETL_LV_NVD_URL`, `ETL_LV_VKCP_URL`, `ETL_LV_ZVA_URL`). */
	urls: Partial<Record<LvFileId, string>>;
	/** The national open data portal whose datasets name the current files (`ETL_LV_PORTAL_URL`). */
	portalUrl: string;
	workDir: string | null;
	appUrl: string | null;
	revalidateSecret: string | null;
};

/** Parses a comma-separated list of Latvian lists (`gp,pharmacies`); throws on unknown ones. */
export function parseLvSources(value: string | null | undefined): LvSourceId[] {
	if (!value) return [...LV_SOURCE_IDS];
	const sources = value
		.split(",")
		.map((source) => source.trim())
		.filter(Boolean);
	for (const source of sources) {
		if (!(LV_SOURCE_IDS as readonly string[]).includes(source)) {
			throw new Error(`Unknown Latvian list "${source}" (one of ${LV_SOURCE_IDS.join(", ")})`);
		}
	}
	if (sources.length === 0) throw new Error("At least one Latvian list is required");
	return [...new Set(sources)] as LvSourceId[];
}

export function buildLvOptions(flags: ParsedArgs["flags"], env: NodeJS.ProcessEnv): LvOptions {
	const approve = flagString(flags, "approve");
	if (approve !== null && !/^\d+$/.test(approve)) {
		throw new Error(`--approve needs a run id, got ${approve}`);
	}
	const offline = flags.has("offline");
	const urls: Partial<Record<LvFileId, string>> = {};
	if (env.ETL_LV_NVD_URL) urls.nvd = env.ETL_LV_NVD_URL;
	if (env.ETL_LV_VKCP_URL) urls.vkcp = env.ETL_LV_VKCP_URL;
	if (env.ETL_LV_ZVA_URL) urls.zva = env.ETL_LV_ZVA_URL;
	return {
		databaseUrl: resolveDatabaseUrl(env),
		dryRun: flags.has("dry-run"),
		approveRunId: approve === null ? null : Number(approve),
		force: flags.has("force"),
		sourceDir: flagString(flags, "source-dir") ?? env.ETL_LV_SOURCE_DIR ?? null,
		offline,
		sources: parseLvSources(flagString(flags, "sources") ?? env.ETL_LV_SOURCES),
		urls,
		portalUrl: env.ETL_LV_PORTAL_URL || DEFAULT_LV_PORTAL_URL,
		workDir: flagString(flags, "work-dir") ?? env.ETL_WORK_DIR ?? null,
		appUrl: offline ? null : env.APP_URL || null,
		revalidateSecret: env.REVALIDATE_SECRET || null,
	};
}

export type SeOptions = {
	databaseUrl: string;
	dryRun: boolean;
	approveRunId: number | null;
	force: boolean;
	sourceDir: string | null;
	offline: boolean;
	sources: SeSourceId[];
	/** A list's address when overridden (`ETL_SE_APOTEK_URL`, `ETL_SE_VARDCENTRALER_URL`); else its own. */
	urls: Partial<Record<SeSourceId, string>>;
	/** The boundaries' archive (`ETL_SE_PLACES_URL`) or SCB's page linking it (`ETL_SE_PLACES_PAGE_URL`), for their first import. */
	placesUrls: { url?: string; pageUrl?: string };
	workDir: string | null;
	appUrl: string | null;
	revalidateSecret: string | null;
};

/**
 * Parses a comma-separated list of Swedish lists: the lists to import (`apotek`), or every list
 * but some, each prefixed with a minus (`-vardcentraler`). The two forms never mix. Throws on
 * unknown ones, and when no list is left.
 */
export function parseSeSources(value: string | null | undefined): SeSourceId[] {
	if (!value) return [...SE_SOURCE_IDS];
	const entries = value
		.split(",")
		.map((source) => source.trim())
		.filter(Boolean);
	const excluded = entries.filter((entry) => entry.startsWith("-"));
	if (excluded.length > 0 && excluded.length < entries.length) {
		throw new Error(
			`Swedish sources are either listed (apotek,vardcentraler) or all excluded with a minus (-vardcentraler), never both: "${value}"`,
		);
	}
	const sources = excluded.length > 0 ? excluded.map((entry) => entry.slice(1)) : entries;
	for (const source of sources) {
		if (!(SE_SOURCE_IDS as readonly string[]).includes(source)) {
			throw new Error(`Unknown Swedish source "${source}" (one of ${SE_SOURCE_IDS.join(", ")})`);
		}
	}
	const selected =
		excluded.length > 0 ? SE_SOURCE_IDS.filter((id) => !sources.includes(id)) : sources;
	if (selected.length === 0) throw new Error("At least one Swedish source is required");
	return [...new Set(selected)] as SeSourceId[];
}

/** The boundaries' sources of `etl:places --country se`, when overridden. */
export function sePlacesUrls(env: NodeJS.ProcessEnv): SeOptions["placesUrls"] {
	return {
		url: env.ETL_SE_PLACES_URL || undefined,
		pageUrl: env.ETL_SE_PLACES_PAGE_URL || undefined,
	};
}

export function buildSeOptions(flags: ParsedArgs["flags"], env: NodeJS.ProcessEnv): SeOptions {
	const approve = flagString(flags, "approve");
	if (approve !== null && !/^\d+$/.test(approve)) {
		throw new Error(`--approve needs a run id, got ${approve}`);
	}
	const offline = flags.has("offline");
	const urls: Partial<Record<SeSourceId, string>> = {};
	for (const id of SE_SOURCE_IDS) {
		const url = env[seSourceUrlVariable(id)];
		if (url) urls[id] = url;
	}
	return {
		databaseUrl: resolveDatabaseUrl(env),
		dryRun: flags.has("dry-run"),
		approveRunId: approve === null ? null : Number(approve),
		force: flags.has("force"),
		sourceDir: flagString(flags, "source-dir") ?? env.ETL_SE_SOURCE_DIR ?? null,
		offline,
		sources: parseSeSources(flagString(flags, "sources") ?? env.ETL_SE_SOURCES),
		urls,
		placesUrls: sePlacesUrls(env),
		workDir: flagString(flags, "work-dir") ?? env.ETL_WORK_DIR ?? null,
		appUrl: offline ? null : env.APP_URL || null,
		revalidateSecret: env.REVALIDATE_SECRET || null,
	};
}
