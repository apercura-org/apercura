/**
 * The shape the Spanish register's extracts are parsed into: one row per centre of the General
 * Register of health centres, services and establishments (REGCESS), ready for the merge
 * (`../../merge-es.ts`).
 */
import {
	ES_DENTAL,
	ES_HEALTH_CENTRE,
	ES_HOSPITAL,
	ES_LOCAL_CLINIC,
	ES_MEDICAL_PRACTICE,
	ES_OTHER_PRACTICE,
	ES_PHARMACY,
	ES_POLYCLINIC,
} from "@apercura/core/taxonomy";

/**
 * The three monthly extracts read, as named in `stats.sources` and the guards: hospitals (C1),
 * centres without inpatient care (C2) and establishments (E, of which pharmacies). The services
 * within centres (C3) are not read.
 */
export const ES_SOURCE_IDS = ["regcess-c1", "regcess-c2", "regcess-e"] as const;

export type EsSourceId = (typeof ES_SOURCE_IDS)[number];

/** Per extract: its `tipoListado`, file name, site source and the professions it holds. */
export const ES_SOURCES: Readonly<
	Record<
		EsSourceId,
		{ listing: string; file: string; siteSource: string; professions: readonly string[] }
	>
> = {
	"regcess-c1": {
		listing: "C1",
		file: "centros_C1.xlsx",
		siteSource: "es-regcess-c1",
		professions: [ES_HOSPITAL],
	},
	"regcess-c2": {
		listing: "C2",
		file: "centros_C2.xlsx",
		siteSource: "es-regcess-c2",
		professions: [
			ES_HEALTH_CENTRE,
			ES_LOCAL_CLINIC,
			ES_MEDICAL_PRACTICE,
			ES_OTHER_PRACTICE,
			ES_POLYCLINIC,
			ES_DENTAL,
		],
	},
	"regcess-e": {
		listing: "E",
		file: "centros_E.xlsx",
		siteSource: "es-regcess-e",
		professions: [ES_PHARMACY],
	},
};

/** The `directory.practitioner_qualifications.source` of a centre's care units. */
export const ES_UNIT_SOURCE = "oferta";

/** The `directory.practitioner_qualifications.source` of a centre's public or private dependency. */
export const ES_DEPENDENCY_SOURCE = "dependencia";

export type EsCentre = {
	source: EsSourceId;
	/** Row of the worksheet, from 1 (the header is row 1). */
	lineNo: number;
	/** REGCESS normalised centre code (`CCN`): the page's and the site's key. */
	nationalId: string;
	professionCode: string;
	/** The register's centre type code (`C251`). */
	typeCode: string;
	/** The centre's name as the register publishes it, cased (`titleCaseEs`). */
	name: string;
	/** Care units (`Oferta Asistencial`), as codes and labels, in the register's order. */
	units: { code: string; label: string }[];
	/** Primary care unit of a practice (`primaryEsSpecialty`), else null. */
	specialtyCode: string | null;
	/** `Calle Alcala, 10`, or null. */
	street: string | null;
	/** Five digits, or null when not a Spanish postcode. */
	postcode: string | null;
	/** Municipality as the register writes it (`Roda, La`, `Alicante/Alacant`). */
	city: string;
	/** INE municipality code, five digits (`02069`): the place's code. */
	municipalityCode: string;
	/** INE province code (`02`). */
	provinceCode: string;
	/** INE autonomous community code (`08`). */
	communityCode: string;
	/** E.164, when published and not shared by more than `MAX_PHONE_ROWS` rows. */
	phone: string | null;
	/** Public or private (`Grupo de dependencia funcional`), when given. */
	dependency: { code: "PUBLIC" | "PRIVATE"; label: string } | null;
};

export type QuarantinedLine = { lineNo: number; reason: string; sample: string };

export type ParseResult = {
	source: EsSourceId;
	/** Data rows of the sheet (the header excluded). */
	lines: number;
	rows: EsCentre[];
	quarantined: QuarantinedLine[];
	/** Rows left out on purpose, by reason (centre type not imported, duplicate…). */
	skipped: Record<string, number>;
	/** Minimisation and quality counters (`stats.sources.<id>.counters`). */
	counters: {
		/** Imported centres whose published number is a chain's (shared by more rows): not stored. */
		sharedPhones: number;
		/** Imported centres whose published number is not a plausible Spanish one. */
		invalidPhones: number;
		/** Imported centres whose postcode is not a Spanish one: not stored. */
		invalidPostcodes: number;
		/** Practices of another profession listed as a psychologist's from their name. */
		psychologistsByName: number;
	};
};

export const emptyResult = (source: EsSourceId): ParseResult => ({
	source,
	lines: 0,
	rows: [],
	quarantined: [],
	skipped: {},
	counters: { sharedPhones: 0, invalidPhones: 0, invalidPostcodes: 0, psychologistsByName: 0 },
});

export const skip = (result: ParseResult, reason: string) => {
	result.skipped[reason] = (result.skipped[reason] ?? 0) + 1;
};

/**
 * A row that cannot be read. Its sample keeps the centre code only, never a name: a quarantined
 * row of a sole trader's practice must not store the person's name.
 */
export const quarantine = (result: ParseResult, lineNo: number, reason: string, id: string) => {
	result.quarantined.push({ lineNo, reason, sample: id.slice(0, 12) });
};
