/**
 * The Swedish lists read by `etl:se` and the shape they are parsed into: one row per facility (a
 * licensed pharmacy, a health centre), ready to be placed and merged (`../../merge-se.ts`).
 *
 * The lists, as named in `--sources`, `stats.sources`, the run's `files` and the guards:
 * - `apotek`: the Swedish Medical Products Agency's register of licensed pharmacies
 *   (Läkemedelsverket, "Apotek med tillstånd"), the search page's export without a filter (XLSX,
 *   updated daily), CC BY 4.0;
 * - `vardcentraler`: Västra Götalandsregionen's health centres of its primary care choice scheme
 *   ("Vårdcentraler i Vårdval vårdcentral", CSV with SWEREF 99 TM points), CC0 1.0.
 *
 * Each list's licence is read on every run from its distribution in its publisher's DCAT
 * catalogue (EntryScape): a list whose licence is no longer the one the import relies on is left
 * out like one that cannot be read, and keeps its pages (exit code 3).
 */
import type { SeIdScheme } from "@apercura/core";
import { SE_HEALTH_CENTRE, SE_PHARMACY } from "@apercura/core/taxonomy";

export const SE_SOURCE_IDS = ["apotek", "vardcentraler"] as const;

export type SeSourceId = (typeof SE_SOURCE_IDS)[number];

export const CC_BY_4_URI = "http://creativecommons.org/licenses/by/4.0/";
export const CC0_1_URI = "http://creativecommons.org/publicdomain/zero/1.0/";

export type SeSourceConfig = {
	/** Where it is published (overridden by `ETL_SE_<ID>_URL`). */
	url: string;
	/** File name in `--source-dir` and the work directory. */
	file: string;
	/**
	 * The DCAT distribution naming the list's licence (EntryScape metadata, JSON), read on every
	 * run, and its file in `--source-dir`.
	 */
	licence: { url: string; file: string; expected: string };
	idScheme: SeIdScheme;
	/** The activities' and sites' source, also the registry id of its credit (`se-apotek`). */
	registry: string;
	professionCode: string;
	/** `directory.sites.kind` and the activity's practice kind. */
	siteKind: "office" | "health_center";
	/** A size floor below which the file is broken, not short. */
	minBytes: number;
};

export const SE_SOURCES: Readonly<Record<SeSourceId, SeSourceConfig>> = {
	apotek: {
		url: "https://www.lakemedelsverket.se/api/pharmacy/exporttoxlsx",
		file: "apotek.xlsx",
		licence: {
			url: "https://catalog.lakemedelsverket.se/store/1/metadata/37",
			file: "apotek.licence.json",
			expected: CC_BY_4_URI,
		},
		idScheme: "SE-GLN",
		registry: "se-apotek",
		professionCode: SE_PHARMACY,
		siteKind: "office",
		minBytes: 2_000,
	},
	vardcentraler: {
		url: "https://vgregion.entryscape.net/store/7/resource/47",
		file: "vardcentraler.csv",
		licence: {
			url: "https://vgregion.entryscape.net/store/7/metadata/48",
			file: "vardcentraler.licence.json",
			expected: CC0_1_URI,
		},
		idScheme: "SE-HSA",
		registry: "se-vgr-vardcentraler",
		professionCode: SE_HEALTH_CENTRE,
		siteKind: "health_center",
		minBytes: 500,
	},
};

/** The `ETL_SE_<ID>_URL` variable that overrides a list's address (`ETL_SE_APOTEK_URL`). */
export const seSourceUrlVariable = (id: SeSourceId) =>
	`ETL_SE_${id.toUpperCase().replace(/-/g, "_")}_URL`;

// The `directory.practitioner_qualifications.source` of what a Swedish page shows (contract with
// the web app, which reads the same strings: change both together).

/** A pharmacy's licence: `code` = Läkemedelsverket's case number, `label` = valid from (`2015-09-01`). */
export const SE_LICENCE_SOURCE = "tillstand";
/**
 * A pharmacy's licence holder, a legal person: `code` = its organisation number (`556773-8249`),
 * `label` = its name. A holder whose number is a person's identity number is never stored.
 */
export const SE_HOLDER_SOURCE = "tillstandshavare";
/** A health centre's operator: `code` = a slug of its name, `label` = the name as published. */
export const SE_OPERATOR_SOURCE = "vardgivare";

export type SeQualification = { source: string; code: string; label: string | null };

export type SeFacility = {
	source: SeSourceId;
	/** Line of the file, from 1 (the XLSX row number, the CSV line). */
	lineNo: number;
	idScheme: SeIdScheme;
	/** The list's key of the facility: the page's and the site's key. */
	nationalId: string;
	professionCode: string;
	/** The name a page prints. */
	name: string;
	qualifications: SeQualification[];
	/** The street and number as the list writes it, or null. */
	street: string | null;
	/** The postcode, written `111 22`, or null. */
	postcode: string | null;
	/** The post town (`Asarum`, `Hisings Backa`), or null. */
	city: string | null;
	/** The municipality the list names (the pharmacies' `Kommun`), or null. */
	kommun: string | null;
	/** WGS 84 point of the facility when its list gives one (the health centres). */
	latitude: number | null;
	longitude: number | null;
};

export type QuarantinedLine = { lineNo: number; reason: string; sample: string };

export type ParseResult = {
	source: SeSourceId;
	/** Data lines of the file. */
	lines: number;
	rows: SeFacility[];
	quarantined: QuarantinedLine[];
	/** Lines left out on purpose, by reason (closed to the public, a repeated key…). */
	skipped: Record<string, number>;
	/** Minimisation and quality counters (`stats.sources.<id>.counters`). */
	counters: Record<string, number>;
};

export const emptyResult = (source: SeSourceId): ParseResult => ({
	source,
	lines: 0,
	rows: [],
	quarantined: [],
	skipped: {},
	counters: {},
});

export const count = (result: ParseResult, counter: string, by = 1) => {
	result.counters[counter] = (result.counters[counter] ?? 0) + by;
};

export const skip = (result: ParseResult, reason: string) => {
	result.skipped[reason] = (result.skipped[reason] ?? 0) + 1;
};

/** A line that cannot be read. Its sample is the list's key, never a name. */
export const quarantine = (result: ParseResult, lineNo: number, reason: string, id: string) => {
	result.quarantined.push({ lineNo, reason, sample: id.slice(0, 26) });
};
