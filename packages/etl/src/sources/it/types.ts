/**
 * The shape the Ministry of Health's lists are parsed into: one row per place (a pharmacy, a
 * parapharmacy, a hospital or an accredited private clinic), ready for the merge
 * (`../../merge-it.ts`).
 */
import type { ItIdScheme } from "@apercura/core";
import { IT_CLINIC, IT_HOSPITAL, IT_PARAPHARMACY, IT_PHARMACY } from "@apercura/core/taxonomy";

/**
 * The three lists read, as named in `stats.sources` and the guards: pharmacies, parapharmacies
 * (both published daily, `FRM_FARMA_5_<date>.csv` and `FRM_PFARMA_7_<date>.csv`) and the yearly
 * hospital bed counts per facility.
 */
export const IT_SOURCE_IDS = ["farmacie", "parafarmacie", "posti-letto"] as const;

export type ItSourceId = (typeof IT_SOURCE_IDS)[number];

/** Per list: its dataset on dati.salute.gov.it, file name, id scheme, site source and kinds. */
export const IT_SOURCES: Readonly<
	Record<
		ItSourceId,
		{
			/** The dataset's slug on dati.salute.gov.it (the hospitals' takes the year after it). */
			dataset: string;
			/** File name in `--source-dir` and the work directory. */
			file: string;
			idScheme: ItIdScheme;
			siteSource: string;
			professions: readonly string[];
		}
	>
> = {
	farmacie: {
		dataset: "farmacie",
		file: "farmacie.csv",
		idScheme: "IT-FARM",
		siteSource: "it-farmacie",
		professions: [IT_PHARMACY],
	},
	parafarmacie: {
		dataset: "parafarmacie",
		file: "parafarmacie.csv",
		idScheme: "IT-PFARM",
		siteSource: "it-parafarmacie",
		professions: [IT_PARAPHARMACY],
	},
	"posti-letto": {
		dataset: "posti-letto-struttura-ospedaliera",
		file: "posti-letto.csv",
		idScheme: "IT-HSP",
		siteSource: "it-posti-letto",
		professions: [IT_HOSPITAL, IT_CLINIC],
	},
};

/** The `directory.practitioner_qualifications.source` of a pharmacy's type. */
export const IT_PHARMACY_TYPE_SOURCE = "tipologia";
/** The `directory.practitioner_qualifications.source` of a hospital's facility type. */
export const IT_FACILITY_TYPE_SOURCE = "tipo-struttura";
/** The `directory.practitioner_qualifications.source` of a hospital's areas of inpatient care. */
export const IT_CARE_AREA_SOURCE = "disciplina";

export type ItPlace = {
	source: ItSourceId;
	/** Line of the file, from 1 (the header is line 1). */
	lineNo: number;
	idScheme: ItIdScheme;
	/** The ministry's code of the place: the page's and the site's key. */
	nationalId: string;
	professionCode: string;
	/** The name a page prints (`pharmacyNameIt`…). */
	name: string;
	/** Qualifications shown on the page (pharmacy type, facility type, areas of care). */
	qualifications: { source: string; code: string; label: string }[];
	/** `Via del Corso, 10`, or null. */
	street: string | null;
	/** Five digits, or null. */
	postcode: string | null;
	/** Municipality as the ministry writes it, cased (`Roma`, `Reggio nell'Emilia`). */
	city: string;
	/** A hamlet (frazione), when the pharmacies' list gives one. */
	hamlet: string | null;
	/** ISTAT municipality code, six digits (`058091`): the place's code. */
	municipalityCode: string;
	/** Province abbreviation (`RM`): places a site whose municipality ISTAT no longer lists. */
	provinceAbbreviation: string | null;
	/** ISTAT region code (`12`). */
	regionCode: string | null;
	/** WGS 84 point of the place, only when the run uses the register's coordinates. */
	latitude: number | null;
	longitude: number | null;
};

export type QuarantinedLine = { lineNo: number; reason: string; sample: string };

export type ParseResult = {
	source: ItSourceId;
	/** Data lines of the file (the header excluded), current and past. */
	lines: number;
	rows: ItPlace[];
	quarantined: QuarantinedLine[];
	/** Lines left out on purpose, by reason (closed, duplicate…). */
	skipped: Record<string, number>;
	/** Minimisation and quality counters (`stats.sources.<id>.counters`). */
	counters: {
		/** Places whose published name lost an owner's title or a company form (and what followed). */
		namesShortened: number;
		/** Places with coordinates in the list (used only with `--register-coordinates`). */
		withPoint: number;
		/** Places whose postcode is not an Italian one: not stored. */
		invalidPostcodes: number;
	};
};

export const emptyResult = (source: ItSourceId): ParseResult => ({
	source,
	lines: 0,
	rows: [],
	quarantined: [],
	skipped: {},
	counters: { namesShortened: 0, withPoint: 0, invalidPostcodes: 0 },
});

export const skip = (result: ParseResult, reason: string) => {
	result.skipped[reason] = (result.skipped[reason] ?? 0) + 1;
};

/**
 * A line that cannot be read. Its sample keeps the ministry's code only, never a name: a
 * pharmacy's company name can name its pharmacists.
 */
export const quarantine = (result: ParseResult, lineNo: number, reason: string, id: string) => {
	result.quarantined.push({ lineNo, reason, sample: id.slice(0, 12) });
};
