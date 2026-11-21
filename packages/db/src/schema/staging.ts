/**
 * Staging tables of the open data import (schema `directory`).
 *
 * They are truncated at the start of every run, loaded with COPY, checked,
 * then merged set-based into the import-owned tables. All values are text, as
 * published (plus a few normalized columns computed while parsing).
 */
import { index, integer, text } from "drizzle-orm/pg-core";
import { directory } from "./schemas";

/** One row of `Personne_activite` (one person x one activity) for in-scope professions. */
export const stgAnsActivities = directory.table(
	"stg_ans_activities",
	{
		lineNo: integer().notNull(),
		rpps: text().notNull(),
		nationalPpId: text(),
		civilityCode: text(),
		titleCode: text(),
		lastNameSource: text().notNull(),
		firstNameSource: text().notNull(),
		lastName: text().notNull(),
		firstName: text().notNull(),
		/** `{prenom-nom}-{rpps}`, used only when the practitioner is created. */
		slug: text().notNull(),
		professionCode: text().notNull(),
		categoryCode: text(),
		skillTypeCode: text(),
		skillCode: text(),
		skillLabel: text(),
		modeCode: text(),
		siret: text(),
		siren: text(),
		finessEt: text(),
		finessEj: text(),
		structureId: text(),
		legalName: text(),
		tradeName: text(),
		/** Display name of the structure (trade name, else legal name). */
		siteName: text(),
		/** Practice kind of the structure, from its sector. */
		siteKind: text(),
		/** `{name}-{finess}` for FINESS establishments. */
		establishmentSlug: text(),
		addressComplement: text(),
		addressLine: text(),
		distribution: text(),
		cedexOffice: text(),
		postcode: text(),
		communeCode: text(),
		communeLabel: text(),
		countryCode: text(),
		phone: text(),
		phone2: text(),
		fax: text(),
		email: text(),
		registrationAuthority: text(),
		sectorCode: text(),
		roleCode: text(),
		genreCode: text(),
		/** Null when the row describes a registration without any activity. */
		activityKey: text(),
		practiceKind: text(),
	},
	(table) => [
		index("stg_ans_activities_rpps_idx").on(table.rpps),
		index("stg_ans_activities_structure_idx").on(table.structureId),
	],
);

/** Skills (`SavoirFaire`) and diplomas/authorizations (`Dipl_AutExerc`). */
export const stgAnsQualifications = directory.table(
	"stg_ans_qualifications",
	{
		rpps: text().notNull(),
		source: text().notNull(),
		typeCode: text().notNull(),
		code: text().notNull(),
		label: text(),
	},
	(table) => [index("stg_ans_qualifications_rpps_idx").on(table.rpps)],
);

/** Open FINESS geographic establishments (ET) with WGS84 coordinates when known. */
export const stgFiness = directory.table("stg_finess", {
	finessEt: text().notNull(),
	name: text(),
	/** `{name}-{finess}`. */
	slug: text(),
	categoryCode: text(),
	communeCode: text(),
	postcode: text(),
	latitude: text(),
	longitude: text(),
	phone: text(),
});

/** Ameli (Cnam) directory rows for the professions in scope. */
export const stgAmeli = directory.table("stg_ameli", {
	lineNo: integer().notNull(),
	lastName: text().notNull(),
	firstName: text().notNull(),
	specialtyCode: text().notNull(),
	postcode: text(),
	city: text(),
	carteVitale: text(),
	apcv: text(),
	billingSector: text(),
	optionCode: text(),
});

/** Lines rejected while parsing (count and samples are reported in etl_runs). */
export const stgQuarantine = directory.table("stg_quarantine", {
	file: text().notNull(),
	lineNo: integer().notNull(),
	reason: text().notNull(),
	sample: text(),
});
