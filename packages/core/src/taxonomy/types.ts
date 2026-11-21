/**
 * How an activity is presented to patients. Drives the public page layout and
 * the call to action (book, call, go through the establishment, nothing).
 */
export const PRACTICE_KINDS = [
	"office",
	"health_center",
	"hospital",
	"locum",
	"non_clinical",
] as const;

export type PracticeKind = (typeof PRACTICE_KINDS)[number];

/** Kinds that make a practitioner reachable by patients at a fixed place. */
export const PATIENT_FACING_KINDS: readonly PracticeKind[] = [
	"office",
	"health_center",
	"hospital",
];

/** How a source role or activity genre affects the practice kind. */
export type ActivityClass = "clinical" | "locum" | "non_clinical";

export type ProfessionEntry = {
	/** URL slug of the profession, also the listing slug when no specialty applies. */
	slug: string;
	/** Imported by default (v1 scope). Other professions are mapped but opt-in. */
	enabled: boolean;
};

export type SpecialtyEntry = {
	/** Profession the specialty belongs to (G15 code). */
	profession: string;
	/** URL slug. Several source codes can share one slug (reforms, options). */
	slug: string;
};

export type PracticeKindResult = {
	kind: PracticeKind;
	/** Source codes absent from the mapping tables (reported by the import). */
	unknownCodes: string[];
};
