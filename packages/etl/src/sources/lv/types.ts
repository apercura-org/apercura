/**
 * The shape the Latvian sources are parsed into: one row per place of care (a GP practice, a
 * hospital, a pharmacy), with one or more sites, ready for the merge (`../../merge-lv.ts`).
 */
import type { LvIdScheme } from "@apercura/core";
import { LV_GP_PRACTICE, LV_HOSPITAL, LV_PHARMACY } from "@apercura/core/taxonomy";

/**
 * The lists imported, as named in `stats.sources`, `--sources` and the guards: the National
 * Health Service's GP practices (`gp`, joined to the Ministry of the Interior's addresses), the
 * hospitals of the Ministry's list (`hospitals`) and the State Agency of Medicines' pharmacies
 * (`pharmacies`).
 */
export const LV_SOURCE_IDS = ["gp", "hospitals", "pharmacies"] as const;

export type LvSourceId = (typeof LV_SOURCE_IDS)[number];

/**
 * The files downloaded: the NVD's quarterly workbook of GPs (`nvd`), the Ministry of the
 * Interior's CSV of medical institutions' addresses (`vkcp`) and the State Agency of Medicines'
 * register export (`zva`).
 */
export const LV_FILE_IDS = ["nvd", "vkcp", "zva"] as const;

export type LvFileId = (typeof LV_FILE_IDS)[number];

/** Per list: the files it reads, its scheme, its sites' source and its kind. */
export const LV_SOURCES: Readonly<
	Record<
		LvSourceId,
		{
			files: readonly LvFileId[];
			scheme: LvIdScheme;
			siteSource: string;
			professionCode: string;
		}
	>
> = {
	gp: {
		files: ["nvd", "vkcp"],
		scheme: "LV-GP",
		siteSource: "lv-nvd-gp",
		professionCode: LV_GP_PRACTICE,
	},
	hospitals: {
		files: ["vkcp"],
		scheme: "LV-SLIM",
		siteSource: "lv-vkcp",
		professionCode: LV_HOSPITAL,
	},
	pharmacies: {
		files: ["zva"],
		scheme: "LV-APT",
		siteSource: "lv-zva",
		professionCode: LV_PHARMACY,
	},
};

/** File names in `--source-dir` (fixtures, offline runs). */
export const LV_FILES: Readonly<Record<LvFileId, string>> = {
	nvd: "gimenes-arsti.xlsx",
	vkcp: "medicinasiestades.csv",
	zva: "fdu_register.csv",
};

/**
 * The datasets of data.gov.lv each file is the resource of (CKAN `package_show`): the current
 * resource's address and the dataset's licence are read from them on every run, so a renamed
 * file or a changed licence never goes unnoticed.
 */
export const LV_DATASETS: Readonly<Record<LvFileId, string>> = {
	nvd: "gimenes-arsta-prakse-registreto-pacientu-skaits",
	vkcp: "vkcp-igis-arstniecibas-iestazu-adreses",
	zva: "farmaceitiskas-darbibas-uznemumu-registrs",
};

/** The `directory.practitioner_qualifications.source` of each kind of qualification. */
export const LV_QUALIFICATION_SOURCES = {
	/** A GP of the practice, as the NVD names them (label: first and last name). */
	gp: "gimenes_arsts",
	/** A pharmacy (`main`) or a pharmacy branch (`branch`). */
	pharmacyType: "aptieka",
} as const;

export type LvQualification = {
	source: (typeof LV_QUALIFICATION_SOURCES)[keyof typeof LV_QUALIFICATION_SOURCES];
	code: string;
	label: string | null;
};

/**
 * Where a site is, as its list gives it: its street, the territories of its address the Latvian
 * way (village or town, parish, municipality), its postcode and its point.
 */
export type LvSiteRow = {
	/** The site's key within its list (a branch code, a pharmacy number). */
	key: string;
	/** A site's own name when its place has several (a hospital's branch), else null. */
	name: string | null;
	/** `Rīgas iela 5`, `"Dālderi"-11`, or null. */
	street: string | null;
	/** The rest of the address after the street (`Sigulda`, `Ance, Ances pag., Ventspils nov.`). */
	locality: string;
	/** `LV-1050`, or null. */
	postcode: string | null;
	/** WGS 84 point of the address, when the list publishes one. */
	point: { longitude: number; latitude: number } | null;
	/** E.164, when published and not shared by more than three places. */
	phone: string | null;
};

export type LvPlace = {
	source: LvSourceId;
	/** Line of the file (the first of the place's lines), from 1. */
	lineNo: number;
	/** The place's key in its scheme (`LV_SOURCES[source].scheme`). */
	nationalId: string;
	professionCode: string;
	/** The name a page prints (legal forms dropped). */
	name: string;
	sites: LvSiteRow[];
	qualifications: LvQualification[];
};

export type QuarantinedLine = { lineNo: number; reason: string; sample: string };

export type ParseResult = {
	source: LvSourceId;
	/** Data lines read for the list (the GPs of the NVD's workbook, the addresses, the register's). */
	lines: number;
	rows: LvPlace[];
	quarantined: QuarantinedLine[];
	/** Lines left out on purpose, by reason (no address, a wholesaler, a suspended licence…). */
	skipped: Record<string, number>;
	/** The NVD's quarter (`202603`); null for the other lists. */
	edition: number | null;
	counters: {
		/** Places whose published number is shared by more places: not stored. */
		sharedPhones: number;
		/** Places whose published number is not a plausible Latvian one. */
		invalidPhones: number;
		/** GPs named on the pages. */
		gps: number;
	};
};

export const emptyResult = (source: LvSourceId): ParseResult => ({
	source,
	lines: 0,
	rows: [],
	quarantined: [],
	skipped: {},
	edition: null,
	counters: { sharedPhones: 0, invalidPhones: 0, gps: 0 },
});

export const skip = (result: ParseResult, reason: string, count = 1) => {
	result.skipped[reason] = (result.skipped[reason] ?? 0) + count;
};

/** A line that cannot be read. Its sample keeps the line's code only, never a name. */
export const quarantine = (result: ParseResult, lineNo: number, reason: string, id: string) => {
	result.quarantined.push({ lineNo, reason, sample: id.slice(0, 16) });
};
