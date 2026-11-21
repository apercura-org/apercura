/**
 * Annuaire Santé (ANS) extraction files: `Personne_activite`, `SavoirFaire`
 * and `Dipl_AutExerc`. UTF-8, `|`-separated, LF, one header line, no quoting.
 * One `Personne_activite` line = one person x one activity (a person can have
 * dozens); a line without a structure is a registration without a fixed place.
 */
import { createHash } from "node:crypto";
import {
	establishmentSlug,
	formatPersonName,
	formatStreetLine,
	formatStreetText,
	isValidRpps,
	practitionerSlug,
	toE164Fr,
} from "@apercura/core";
import { FR_SECTOR_KINDS, practiceKindFor } from "@apercura/core/taxonomy";
import { z } from "zod";
import type { CopyValue } from "../../lib/copy";
import { nullIfEmpty } from "../../lib/text";

export const PERSONNE_ACTIVITE_COLUMNS = {
	idType: "Type d'identifiant PP",
	rpps: "Identifiant PP",
	nationalPpId: "Identification nationale PP",
	titleCode: "Code civilité d'exercice",
	civilityCode: "Code civilité",
	lastName: "Nom d'exercice",
	firstName: "Prénom d'exercice",
	professionCode: "Code profession",
	categoryCode: "Code catégorie professionnelle",
	skillTypeCode: "Code type savoir-faire",
	skillCode: "Code savoir-faire",
	skillLabel: "Libellé savoir-faire",
	modeCode: "Code mode exercice",
	siret: "Numéro SIRET site",
	siren: "Numéro SIREN site",
	finessEt: "Numéro FINESS site",
	finessEj: "Numéro FINESS établissement juridique",
	structureId: "Identifiant technique de la structure",
	legalName: "Raison sociale site",
	tradeName: "Enseigne commerciale site",
	recipientComplement: "Complément destinataire (coord. structure)",
	pointComplement: "Complément point géographique (coord. structure)",
	streetNumber: "Numéro Voie (coord. structure)",
	repetition: "Indice répétition voie (coord. structure)",
	streetTypeCode: "Code type de voie (coord. structure)",
	streetTypeLabel: "Libellé type de voie (coord. structure)",
	street: "Libellé Voie (coord. structure)",
	distribution: "Mention distribution (coord. structure)",
	cedexOffice: "Bureau cedex (coord. structure)",
	postcode: "Code postal (coord. structure)",
	communeCode: "Code commune (coord. structure)",
	communeLabel: "Libellé commune (coord. structure)",
	countryCode: "Code pays (coord. structure)",
	phone: "Téléphone (coord. structure)",
	phone2: "Téléphone 2 (coord. structure)",
	fax: "Télécopie (coord. structure)",
	email: "Adresse e-mail (coord. structure)",
	departmentCode: "Code Département (structure)",
	registrationAuthority: "Autorité d'enregistrement",
	sectorCode: "Code secteur d'activité",
	roleCode: "Code rôle",
	genreCode: "Code genre activité",
} as const;

export const SAVOIR_FAIRE_COLUMNS = {
	idType: "Type d'identifiant PP",
	rpps: "Identifiant PP",
	professionCode: "Code profession",
	typeCode: "Code type savoir-faire",
	code: "Code savoir-faire",
	label: "Libellé savoir-faire",
} as const;

export const DIPLOMES_COLUMNS = {
	idType: "Type d'identifiant PP",
	rpps: "Identifiant PP",
	diplomaTypeCode: "Code type diplôme obtenu",
	diplomaCode: "Code diplôme obtenu",
	diplomaLabel: "Libellé diplôme obtenu",
	authorizationTypeCode: "Code type autorisation",
	authorizationCode: "Code discipline autorisation",
	authorizationLabel: "Libellé discipline autorisation",
} as const;

/** Staging columns of `directory.stg_ans_activities`, in COPY order. */
export const STG_ACTIVITY_COLUMNS = [
	"line_no",
	"rpps",
	"national_pp_id",
	"civility_code",
	"title_code",
	"last_name_source",
	"first_name_source",
	"last_name",
	"first_name",
	"slug",
	"profession_code",
	"category_code",
	"skill_type_code",
	"skill_code",
	"skill_label",
	"mode_code",
	"siret",
	"siren",
	"finess_et",
	"finess_ej",
	"structure_id",
	"legal_name",
	"trade_name",
	"site_name",
	"site_kind",
	"establishment_slug",
	"address_complement",
	"address_line",
	"distribution",
	"cedex_office",
	"postcode",
	"commune_code",
	"commune_label",
	"country_code",
	"phone",
	"phone2",
	"fax",
	"email",
	"registration_authority",
	"sector_code",
	"role_code",
	"genre_code",
	"activity_key",
	"practice_kind",
] as const;

export const STG_QUALIFICATION_COLUMNS = ["rpps", "source", "type_code", "code", "label"] as const;

/** RPPS identifiers are type 8 in the registry (ADELI no longer exists there). */
const RPPS_ID_TYPE = "8";

const coreSchema = z.object({
	idType: z.literal(RPPS_ID_TYPE),
	rpps: z
		.string()
		.regex(/^\d{11}$/)
		.refine(isValidRpps, "invalid RPPS check digit"),
	lastName: z.string().min(1),
	professionCode: z.string().regex(/^\d{2}$/),
});

export type ParsedLine<Row> =
	| { kind: "row"; row: Row }
	| { kind: "skip" }
	| { kind: "quarantine"; reason: string };

export type ActivityRow = {
	rpps: string;
	values: CopyValue[];
	unknownCodes: string[];
};

type Indexes<Columns> = { [Key in keyof Columns]: number };

const field = (fields: string[], index: number) => nullIfEmpty(fields[index]);

/** Stable key of an activity: hash of (RPPS, structure, mode, role, sector, genre). */
export function activityKey(parts: (string | null)[]): string {
	return createHash("sha256")
		.update(parts.map((part) => part ?? "").join("|"))
		.digest("hex")
		.slice(0, 32);
}

const quarantineReason = (error: z.ZodError): string => {
	const issue = error.issues[0];
	const path = issue?.path.join(".") ?? "row";
	return `invalid_${path}`;
};

/**
 * Maps one `Personne_activite` line to a staging row. Lines of professions out
 * of scope are skipped; malformed lines are quarantined.
 */
export function parsePersonneActiviteLine(
	fields: string[],
	columnCount: number,
	index: Indexes<typeof PERSONNE_ACTIVITE_COLUMNS>,
	professions: ReadonlySet<string>,
	lineNo: number,
): ParsedLine<ActivityRow> {
	if (fields.length !== columnCount) {
		return { kind: "quarantine", reason: "field_count" };
	}
	const professionCode = fields[index.professionCode] ?? "";
	if (!professions.has(professionCode)) return { kind: "skip" };

	const checked = coreSchema.safeParse({
		idType: fields[index.idType],
		rpps: fields[index.rpps],
		lastName: (fields[index.lastName] ?? "").trim(),
		professionCode,
	});
	if (!checked.success) return { kind: "quarantine", reason: quarantineReason(checked.error) };
	const { rpps } = checked.data;

	const lastNameSource = (fields[index.lastName] ?? "").trim();
	const firstNameSource = (fields[index.firstName] ?? "").trim();
	const lastName = formatPersonName(lastNameSource, { familyName: true });
	const firstName = formatPersonName(firstNameSource);

	const structureId = field(fields, index.structureId);
	const modeCode = field(fields, index.modeCode);
	const roleCode = field(fields, index.roleCode);
	const sectorCode = field(fields, index.sectorCode);
	const genreCode = field(fields, index.genreCode);
	const hasActivity = structureId !== null || roleCode !== null || sectorCode !== null;
	const kind = practiceKindFor({ sectorCode, roleCode, genreCode, hasSite: structureId !== null });

	const legalName = field(fields, index.legalName);
	const tradeName = field(fields, index.tradeName);
	const siteName = formatStreetText(tradeName ?? legalName ?? "") || null;
	const finessEt = field(fields, index.finessEt);
	const complement = [
		field(fields, index.recipientComplement),
		field(fields, index.pointComplement),
	]
		.filter(Boolean)
		.join(", ");
	const addressLine = formatStreetLine({
		number: field(fields, index.streetNumber),
		repetition: field(fields, index.repetition),
		typeLabel: field(fields, index.streetTypeLabel) ?? field(fields, index.streetTypeCode),
		street: field(fields, index.street),
	});

	const values: CopyValue[] = [
		lineNo,
		rpps,
		field(fields, index.nationalPpId),
		field(fields, index.civilityCode),
		field(fields, index.titleCode),
		lastNameSource,
		firstNameSource,
		lastName,
		firstName,
		practitionerSlug(firstName, lastName, rpps),
		professionCode,
		field(fields, index.categoryCode),
		field(fields, index.skillTypeCode),
		field(fields, index.skillCode),
		field(fields, index.skillLabel),
		modeCode,
		field(fields, index.siret),
		field(fields, index.siren),
		finessEt,
		field(fields, index.finessEj),
		structureId,
		legalName,
		tradeName,
		siteName,
		structureId === null
			? null
			: sectorCode
				? (FR_SECTOR_KINDS[sectorCode] ?? "non_clinical")
				: "non_clinical",
		finessEt && structureId ? establishmentSlug(siteName ?? "", finessEt) : null,
		complement ? formatStreetText(complement) : null,
		addressLine || null,
		field(fields, index.distribution),
		field(fields, index.cedexOffice),
		field(fields, index.postcode),
		field(fields, index.communeCode),
		field(fields, index.communeLabel),
		field(fields, index.countryCode),
		toE164Fr(fields[index.phone]),
		toE164Fr(fields[index.phone2]),
		toE164Fr(fields[index.fax]),
		field(fields, index.email)?.toLowerCase() ?? null,
		field(fields, index.registrationAuthority),
		sectorCode,
		roleCode,
		genreCode,
		hasActivity
			? activityKey([rpps, structureId, modeCode, roleCode, sectorCode, genreCode])
			: null,
		hasActivity ? kind.kind : null,
	];
	return { kind: "row", row: { rpps, values, unknownCodes: hasActivity ? kind.unknownCodes : [] } };
}

export type QualificationRow = { rpps: string; values: CopyValue[][] };

/** Maps one `SavoirFaire` line (skills of practitioners in scope). */
export function parseSavoirFaireLine(
	fields: string[],
	columnCount: number,
	index: Indexes<typeof SAVOIR_FAIRE_COLUMNS>,
	rppsInScope: ReadonlySet<string>,
): ParsedLine<QualificationRow> {
	if (fields.length !== columnCount) return { kind: "quarantine", reason: "field_count" };
	const rpps = fields[index.rpps] ?? "";
	if (!rppsInScope.has(rpps)) return { kind: "skip" };
	const typeCode = field(fields, index.typeCode);
	const code = field(fields, index.code);
	if (!typeCode || !code) return { kind: "skip" };
	return {
		kind: "row",
		row: { rpps, values: [[rpps, "savoir_faire", typeCode, code, field(fields, index.label)]] },
	};
}

/** Maps one `Dipl_AutExerc` line: a diploma and/or an authorization to practice. */
export function parseDiplomeLine(
	fields: string[],
	columnCount: number,
	index: Indexes<typeof DIPLOMES_COLUMNS>,
	rppsInScope: ReadonlySet<string>,
): ParsedLine<QualificationRow> {
	if (fields.length !== columnCount) return { kind: "quarantine", reason: "field_count" };
	const rpps = fields[index.rpps] ?? "";
	if (!rppsInScope.has(rpps)) return { kind: "skip" };
	const values: CopyValue[][] = [];
	const diplomaType = field(fields, index.diplomaTypeCode);
	const diplomaCode = field(fields, index.diplomaCode);
	if (diplomaType && diplomaCode) {
		values.push([rpps, "diploma", diplomaType, diplomaCode, field(fields, index.diplomaLabel)]);
	}
	const authorizationType = field(fields, index.authorizationTypeCode);
	if (authorizationType) {
		values.push([
			rpps,
			"authorization",
			authorizationType,
			field(fields, index.authorizationCode) ?? authorizationType,
			field(fields, index.authorizationLabel),
		]);
	}
	if (values.length === 0) return { kind: "skip" };
	return { kind: "row", row: { rpps, values } };
}
