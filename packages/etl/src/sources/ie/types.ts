/**
 * The Irish lists read by `etl:ie` and the shape they are parsed into: one row per facility (a
 * retail pharmacy business, a designated centre for older people, a hospital, a health centre),
 * ready to be placed and merged (`../../merge-ie.ts`).
 *
 * The lists, as named in `--sources`, `stats.sources`, the run's `files` and the guards:
 * - `psi`: the Pharmaceutical Society of Ireland's register of pharmacies (an XLSX extract,
 *   monthly), re-used under the PSI's conditions, which the workbook carries on a sheet of its
 *   own (checked on every run);
 * - `hiqa`: HIQA's register of designated centres for older people (a live CSV export), under
 *   HIQA's re-use conditions;
 * - `hse-hospitals`, `hse-health-centres`: the HSE's Health Atlas layers on GeoHive (GeoJSON
 *   from ArcGIS, a March 2020 snapshot), CC BY 4.0, whose item must still name that licence.
 *
 * A list that cannot be fetched, read or checked is left out and keeps its pages (exit code 3).
 */
import type { IeIdScheme } from "@apercura/core";
import {
	IE_HEALTH_CENTRE,
	IE_HOSPITAL,
	IE_NURSING_HOME,
	IE_PHARMACY,
} from "@apercura/core/taxonomy";

export const IE_SOURCE_IDS = ["psi", "hiqa", "hse-hospitals", "hse-health-centres"] as const;

export type IeSourceId = (typeof IE_SOURCE_IDS)[number];

/** How a list is published. */
export type IeFormat = "xlsx" | "csv" | "geojson";

const ARCGIS_ITEM = "https://www.arcgis.com/sharing/rest/content/items";
const HSE_LAYERS = "https://services1.arcgis.com/eNO7HHeQ3rUcBllm/arcgis/rest/services";
const ARCGIS_QUERY =
	"FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultRecordCount=2000";

export type IeSourceConfig = {
	/** Where it is published (overridden by `ETL_IE_<ID>_URL`). */
	url: string;
	format: IeFormat;
	/** File name in `--source-dir` and the work directory. */
	file: string;
	idScheme: IeIdScheme;
	/** The activities' and sites' source, also the registry id of its credit (`ie-psi`). */
	registry: string;
	professionCode: string;
	/** `directory.sites.kind` and the activity's practice kind. */
	siteKind: "office" | "hospital" | "health_center";
	/** A size floor below which the file is broken, not short. */
	minBytes: number;
	/**
	 * The ArcGIS item describing a layer (its licence, its last change), read on every run, and
	 * its file in `--source-dir`; null for the registers, whose terms travel with the file.
	 */
	item: { url: string; file: string } | null;
};

export const IE_SOURCES: Readonly<Record<IeSourceId, IeSourceConfig>> = {
	psi: {
		url: "https://www.psi.ie/sites/default/files/document/Extract_of_Pharmacies_0.xlsx",
		format: "xlsx",
		file: "psi-pharmacies.xlsx",
		idScheme: "IE-PSI",
		registry: "ie-psi",
		professionCode: IE_PHARMACY,
		siteKind: "office",
		minBytes: 5_000,
		item: null,
	},
	hiqa: {
		url: "https://www.hiqa.ie/centre/export/older_persons_register.csv?_format=csv",
		format: "csv",
		file: "hiqa-older-persons.csv",
		idScheme: "IE-HIQA",
		registry: "ie-hiqa",
		professionCode: IE_NURSING_HOME,
		siteKind: "office",
		minBytes: 5_000,
		item: null,
	},
	"hse-hospitals": {
		url: `${HSE_LAYERS}/HospitalsHSEIreland/${ARCGIS_QUERY}`,
		format: "geojson",
		file: "hse-hospitals.geojson",
		idScheme: "IE-HSE-HOSP",
		registry: "ie-hse-hospitals",
		professionCode: IE_HOSPITAL,
		siteKind: "hospital",
		minBytes: 5_000,
		item: {
			url: `${ARCGIS_ITEM}/feb34881088341bbbf80d86af6a4f333?f=json`,
			file: "hse-hospitals.item.json",
		},
	},
	"hse-health-centres": {
		url: `${HSE_LAYERS}/HealthCentresHSEIreland/${ARCGIS_QUERY}`,
		format: "geojson",
		file: "hse-health-centres.geojson",
		idScheme: "IE-HSE-HC",
		registry: "ie-hse-health-centres",
		professionCode: IE_HEALTH_CENTRE,
		siteKind: "health_center",
		minBytes: 5_000,
		item: {
			url: `${ARCGIS_ITEM}/c2e825ef881b4e7daca59b0faa232b72?f=json`,
			file: "hse-health-centres.item.json",
		},
	},
};

/** The `ETL_IE_<ID>_URL` variable that overrides a list's address (`ETL_IE_HSE_HOSPITALS_URL`). */
export const ieSourceUrlVariable = (id: IeSourceId) =>
	`ETL_IE_${id.toUpperCase().replace(/-/g, "_")}_URL`;

// The `directory.practitioner_qualifications.source` of what an Irish page shows (contract with
// the web app, which reads the same strings: change both together).

/** A hospital's kind: `code` = the HSE's subcategory as written (`General/Acute`), `label` its name. */
export const IE_HOSPITAL_KIND_SOURCE = "ie-hospital-kind";
/** A nursing home's registered capacity: `code` = the maximum occupancy (digits), no label. */
export const IE_CAPACITY_SOURCE = "ie-capacity";
/**
 * A nursing home's registered provider, when it is the HSE (`code` = `hse`) or a company
 * (`company`, `label` = its name as published); never a person, partners or named members.
 */
export const IE_OPERATOR_SOURCE = "ie-operator";
/** A nursing home's page on HIQA's site: `code` = the slug after `/find-a-centre/`, no label. */
export const IE_HIQA_PAGE_SOURCE = "ie-hiqa-page";

export type IeQualification = { source: string; code: string; label: string | null };

/**
 * Where a facility is, as its list writes it. The registers name a town and a county; the HSE's
 * layers give a point (and an address whose lines name the town and the county).
 */
export type IeFacility = {
	source: IeSourceId;
	/** Line or feature of the file, from 1. */
	lineNo: number;
	idScheme: IeIdScheme;
	/** The list's key of the facility: the page's and the site's key. */
	nationalId: string;
	professionCode: string;
	/** The name a page prints. */
	name: string;
	qualifications: IeQualification[];
	/**
	 * The street lines as a page prints them (`Unit 2, 69 Main Street`), when the list tells them
	 * from the town (the PSI's columns); null when the town is found among `addressParts`.
	 */
	street: string | null;
	/** The town as the list's own column writes it (the PSI's), or null. */
	townColumn: string | null;
	/**
	 * The address in its parts, in order, without the Eircode and the county (HIQA's address
	 * split on commas, the HSE's lines): the town is one of them, found when the facility is placed.
	 */
	addressParts: string[];
	/** The Eircode as printed (`D02 X285`), or null. Never used to locate anything. */
	eircode: string | null;
	/** The county code (Tailte Éireann's `CO_ID`) the list names, or null. */
	countyCode: string | null;
	/**
	 * The names that may be the facility's town, most likely first: the register's town column,
	 * else its address parts from the end (an HSE address's lines from the end).
	 */
	towns: string[];
	/** WGS 84 point of the facility when its list gives one (the HSE's layers). */
	latitude: number | null;
	longitude: number | null;
	/** E.164, or null. */
	phone: string | null;
	/** The facility's names to tell it from another list's (HIQA ↔ HSE), normalised. */
	matchNames: string[];
	/** The HSE's subcategory of a hospital, for the duplicate check with HIQA. */
	kind: string | null;
};

export type QuarantinedLine = { lineNo: number; reason: string; sample: string };

export type ParseResult = {
	source: IeSourceId;
	/** Data lines or features of the file. */
	lines: number;
	rows: IeFacility[];
	quarantined: QuarantinedLine[];
	/** Lines left out on purpose, by reason (a repeated key, not a facility…). */
	skipped: Record<string, number>;
	/** Minimisation and quality counters (`stats.sources.<id>.counters`). */
	counters: Record<string, number>;
	/** Facts of the file kept in `stats.sources.<id>` (`correctAt`, `modified`). */
	facts: Record<string, string | number | null>;
};

export const emptyResult = (source: IeSourceId): ParseResult => ({
	source,
	lines: 0,
	rows: [],
	quarantined: [],
	skipped: {},
	counters: {},
	facts: {},
});

export const count = (result: ParseResult, counter: string, by = 1) => {
	result.counters[counter] = (result.counters[counter] ?? 0) + by;
};

export const skip = (result: ParseResult, reason: string) => {
	result.skipped[reason] = (result.skipped[reason] ?? 0) + 1;
};

/** A line that cannot be read. Its sample is the list's key, never a name (a provider's can be a person's). */
export const quarantine = (result: ParseResult, lineNo: number, reason: string, id: string) => {
	result.quarantined.push({ lineNo, reason, sample: id.slice(0, 12) });
};
