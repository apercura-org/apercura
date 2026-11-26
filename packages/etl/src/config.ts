/**
 * Import configuration: environment variables and command-line flags.
 */
import { parseProfessionList } from "@apercura/core/taxonomy";
import { DEFAULT_AT_PLACES_URL } from "./sources/at/places";
import { AT_SOURCE_IDS, type AtSourceId } from "./sources/at/types";
import { defaultCzPlacesUrls } from "./sources/cz/places";
import { DEFAULT_ES_PLACES_BASE } from "./sources/es/places";
import { ES_SOURCE_IDS, ES_SOURCES, type EsSourceId } from "./sources/es/types";
import {
	DEFAULT_GB_LAD_BOUNDARIES_URL,
	DEFAULT_GB_LAD_LOOKUP_URL,
	DEFAULT_GB_NI_TOWNS_URL,
	DEFAULT_GB_TOWNS_URL,
} from "./sources/gb/places";
import { DEFAULT_GB_POSTCODES_URL } from "./sources/gb/postcodes";
import { GB_SOURCE_IDS, type GbSourceId } from "./sources/gb/types";

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
