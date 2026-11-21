/**
 * French health taxonomy: source codes from the ANS nomenclatures (NOS) mapped
 * to URL slugs and practice kinds.
 *
 * Derived by hand from the NOS tables published at https://mos.esante.gouv.fr/NOS/
 * (only the derived mapping is committed, never the raw files):
 * - TRE_G15 ProfessionSante (version of 2025-03-28), plus the codes 41, 71, 72
 *   and 73 the registry also publishes (social workers and the professions
 *   with a protected title: osteopaths, psychotherapists, chiropractors)
 * - TRE_R38 SpecialiteOrdinale (version of 2026-11-02)
 * - TRE_R02 SecteurActivite (version of 2025-05-23)
 * - TRE_R21 Fonction (version of 2026-11-02)
 * - TRE_R22 GenreActivite (version of 2024-03-29)
 *
 * Labels are not stored here: they live in the i18n catalogs under `taxonomy.*`,
 * keyed by slug (professions, specialties) or by source code (roles, modes).
 * Any code missing from these tables is reported by the import.
 */
import type {
	ActivityClass,
	PracticeKind,
	PracticeKindResult,
	ProfessionEntry,
	SpecialtyEntry,
} from "./types";

/** Profession codes imported by default in v1: physicians, dental surgeons, midwives. */
export const FR_DEFAULT_PROFESSIONS = ["10", "40", "50"] as const;

/**
 * Code 99 ("autre") is never imported: those people are not health professionals.
 */
export const FR_EXCLUDED_PROFESSIONS = ["99"] as const;

/** Profession codes published by the registry (all current and retired ones). */
export const FR_PROFESSIONS: Readonly<Record<string, ProfessionEntry>> = {
	"10": { slug: "medecin", enabled: true },
	"21": { slug: "pharmacien", enabled: false },
	"26": { slug: "audioprothesiste", enabled: false },
	"28": { slug: "opticien-lunetier", enabled: false },
	"31": { slug: "assistant-dentaire", enabled: false },
	"32": { slug: "physicien-medical", enabled: false },
	"35": { slug: "aide-soignant", enabled: false },
	"36": { slug: "ambulancier", enabled: false },
	"37": { slug: "auxiliaire-de-puericulture", enabled: false },
	"38": { slug: "preparateur-en-pharmacie-hospitaliere", enabled: false },
	"39": { slug: "preparateur-en-pharmacie", enabled: false },
	"40": { slug: "chirurgien-dentiste", enabled: true },
	"41": { slug: "assistant-de-service-social", enabled: false },
	"50": { slug: "sage-femme", enabled: true },
	"60": { slug: "infirmier", enabled: false },
	"69": { slug: "infirmier-psychiatrique", enabled: false },
	"70": { slug: "masseur-kinesitherapeute", enabled: false },
	"71": { slug: "osteopathe", enabled: false },
	"72": { slug: "psychotherapeute", enabled: false },
	"73": { slug: "chiropracteur", enabled: false },
	"80": { slug: "pedicure-podologue", enabled: false },
	"81": { slug: "orthoprothesiste", enabled: false },
	"82": { slug: "podo-orthesiste", enabled: false },
	"83": { slug: "orthopediste-orthesiste", enabled: false },
	"84": { slug: "oculariste", enabled: false },
	"85": { slug: "epithesiste", enabled: false },
	"86": { slug: "technicien-de-laboratoire-medical", enabled: false },
	"91": { slug: "orthophoniste", enabled: false },
	"92": { slug: "orthoptiste", enabled: false },
	"93": { slug: "psychologue", enabled: false },
	"94": { slug: "ergotherapeute", enabled: false },
	"95": { slug: "dieteticien", enabled: false },
	"96": { slug: "psychomotricien", enabled: false },
	"98": { slug: "manipulateur-erm", enabled: false },
};

const doctor = (slug: string): SpecialtyEntry => ({ profession: "10", slug });
const dentist = (slug: string): SpecialtyEntry => ({ profession: "40", slug });
const nurse = (slug: string): SpecialtyEntry => ({ profession: "60", slug });
const pharmacist = (slug: string): SpecialtyEntry => ({ profession: "21", slug });

/**
 * TRE_R38 ordinal specialties. Reform variants and options share the slug of
 * their parent specialty so patients find a single listing.
 */
export const FR_SPECIALTIES: Readonly<Record<string, SpecialtyEntry>> = {
	// Dental surgeons (SCD)
	SCD01: dentist("orthodontiste"),
	SCD02: dentist("chirurgien-oral"),
	SCD03: dentist("specialiste-medecine-bucco-dentaire"),
	// Nurses (SI)
	SI01: nurse("infirmier-en-pratique-avancee"),
	SI02: nurse("infirmier-en-pratique-avancee"),
	SI03: nurse("infirmier-en-pratique-avancee"),
	SI04: nurse("infirmier-en-pratique-avancee"),
	SI05: nurse("infirmier-en-pratique-avancee"),
	SI06: nurse("infirmier-de-bloc-operatoire"),
	SI07: nurse("infirmier-anesthesiste"),
	SI08: nurse("infirmier-puericulteur"),
	// Physicians (SM)
	SM01: doctor("anatomopathologiste"),
	SM02: doctor("anesthesiste-reanimateur"),
	SM03: doctor("biologiste-medical"),
	SM04: doctor("cardiologue"),
	SM05: doctor("chirurgien-general"),
	SM06: doctor("chirurgien-maxillo-facial"),
	SM07: doctor("chirurgien-maxillo-facial"),
	SM08: doctor("chirurgien-orthopediste"),
	SM09: doctor("chirurgien-pediatrique"),
	SM10: doctor("chirurgien-plasticien"),
	SM11: doctor("chirurgien-thoracique-et-cardiovasculaire"),
	SM12: doctor("urologue"),
	SM13: doctor("chirurgien-vasculaire"),
	SM14: doctor("chirurgien-visceral"),
	SM15: doctor("dermatologue"),
	SM16: doctor("endocrinologue"),
	SM17: doctor("geneticien"),
	SM18: doctor("geriatre"),
	SM19: doctor("gynecologue"),
	SM20: doctor("gynecologue-obstetricien"),
	SM21: doctor("hematologue"),
	SM22: doctor("hematologue"),
	SM23: doctor("hematologue"),
	SM24: doctor("gastro-enterologue"),
	SM25: doctor("medecin-du-travail"),
	SM26: doctor("medecin-generaliste"),
	SM27: doctor("interniste"),
	SM28: doctor("medecin-nucleaire"),
	SM29: doctor("medecin-reeducateur"),
	SM30: doctor("nephrologue"),
	SM31: doctor("neurochirurgien"),
	SM32: doctor("neurologue"),
	SM33: doctor("neuropsychiatre"),
	SM34: doctor("orl"),
	SM35: doctor("oncologue"),
	SM36: doctor("oncologue"),
	SM37: doctor("radiotherapeute"),
	SM38: doctor("ophtalmologue"),
	SM39: doctor("orl"),
	SM40: doctor("pediatre"),
	SM41: doctor("pneumologue"),
	SM42: doctor("psychiatre"),
	SM43: doctor("pedopsychiatre"),
	SM44: doctor("radiologue"),
	SM45: doctor("radiotherapeute"),
	SM46: doctor("medecin-reanimateur"),
	SM47: doctor("medecin-chercheur"),
	SM48: doctor("rhumatologue"),
	SM49: doctor("medecin-de-sante-publique"),
	SM50: doctor("stomatologue"),
	SM51: doctor("gynecologue-obstetricien"),
	SM52: doctor("gynecologue"),
	SM53: doctor("medecin-generaliste"),
	SM54: doctor("medecin-generaliste"),
	SM55: doctor("radiologue"),
	SM56: doctor("chirurgien-oral"),
	SM57: doctor("allergologue"),
	SM58: doctor("infectiologue"),
	SM59: doctor("urgentiste"),
	SM60: doctor("medecin-legiste"),
	SM61: doctor("medecin-vasculaire"),
	SM62: doctor("endocrinologue"),
	SM63: doctor("biologiste-medical"),
	SM64: doctor("biologiste-medical"),
	SM65: doctor("biologiste-medical"),
	SM66: doctor("biologiste-medical"),
	SM67: doctor("biologiste-medical"),
	SM68: doctor("chirurgien-maxillo-facial"),
	SM69: doctor("chirurgien-pediatrique"),
	SM70: doctor("chirurgien-pediatrique"),
	SM71: doctor("hematologue"),
	SM72: doctor("interniste"),
	SM73: doctor("cardiologue"),
	SM74: doctor("radiologue"),
	SM75: doctor("medecin-de-sante-publique"),
	SM76: doctor("anesthesiste-reanimateur"),
	SM77: doctor("chirurgien-maxillo-facial"),
	SM78: doctor("chirurgien-visceral"),
	SM79: doctor("cardiologue"),
	SM80: doctor("cardiologue"),
	SM81: doctor("cardiologue"),
	SM82: doctor("medecin-reanimateur"),
	SM83: doctor("nephrologue"),
	SM84: doctor("neurologue"),
	SM85: doctor("ophtalmologue"),
	SM86: doctor("orl"),
	SM87: doctor("pediatre"),
	SM88: doctor("pediatre"),
	SM89: doctor("pediatre"),
	SM90: doctor("pediatre"),
	SM91: doctor("pneumologue"),
	SM92: doctor("pedopsychiatre"),
	SM93: doctor("psychiatre"),
	SM94: doctor("radiologue"),
	SM95: doctor("medecin-de-sante-publique"),
	// Pharmacists (SP, retired in 2018): no listing of their own.
	SP01: pharmacist("pharmacien"),
	SP02: pharmacist("pharmacien"),
	SP03: pharmacist("pharmacien"),
	SP04: pharmacist("pharmacien"),
};

/**
 * Professions whose listing slug never depends on a specialty (midwives are
 * always "sage-femme").
 */
const SPECIALTY_AGNOSTIC_PROFESSIONS = new Set(["50"]);

/**
 * TRE_R02 activity sectors (SA01–SA69) mapped to the kind of place they describe.
 */
export const FR_SECTOR_KINDS: Readonly<Record<string, PracticeKind>> = {
	SA01: "hospital", // Etablissement public de santé
	SA02: "hospital", // Hôpital militaire du Service de santé des armées
	SA03: "hospital", // Etablissement privé PSPH
	SA04: "hospital", // Etablissement privé non PSPH
	SA05: "health_center", // Centre de santé
	SA06: "non_clinical", // Autre structure du Service de santé des armées
	SA07: "office", // Cabinet individuel
	SA08: "office", // Cabinet de groupe
	SA09: "office", // Exercice en société
	SA10: "non_clinical", // Transporteur sanitaire
	SA11: "non_clinical", // Entreprise d'intérim (retired)
	SA12: "hospital", // Etablissement de soins et prévention
	SA13: "non_clinical", // Prévention et soins en entreprise
	SA14: "non_clinical", // Etablissements scolaires, universitaires et de formation
	SA15: "health_center", // PMI et Planification familiale
	SA16: "non_clinical", // Etablissement pour personnes handicapées
	SA17: "non_clinical", // Etablissement pour personnes âgées
	SA18: "non_clinical", // Etablissement aide à la famille
	SA19: "non_clinical", // Etablissements FINESS de formation
	SA20: "non_clinical", // Etablissement pour la protection de l'enfance
	SA21: "hospital", // Etablissement d'hébergement et de réadaptation
	SA22: "non_clinical", // Recherche
	SA23: "non_clinical", // Assurance privée
	SA24: "non_clinical", // Organisme de sécurité sociale
	SA25: "health_center", // Laboratoire de biologie médicale
	SA26: "non_clinical", // Ministère ou Service déconcentré
	SA27: "non_clinical", // Collectivité territoriale
	SA28: "non_clinical", // Association ou organisme humanitaire
	SA29: "health_center", // Laboratoire d'analyses et de biologie médicale
	SA30: "hospital", // Autre établissement sanitaire
	SA31: "non_clinical", // Répartition et Distribution de médicaments
	SA32: "non_clinical", // Fabrication, Exploitation et Importation de médicaments
	SA33: "non_clinical", // Pharmacie d'officine
	SA34: "hospital", // Centre de dialyse
	SA35: "non_clinical", // Para-pharmacie
	SA36: "hospital", // Centre anti-cancer
	SA37: "non_clinical", // Centre de transfusion sanguine
	SA38: "non_clinical", // Pharmacie minière
	SA39: "non_clinical", // Pharmacie mutualiste
	SA40: "hospital", // Secteur privé, praticien hospitalier temps plein
	SA41: "non_clinical", // Autre établissement du domaine social ou médico-social
	SA42: "non_clinical", // Appareillage médical
	SA43: "non_clinical", // Secteur non défini
	SA44: "non_clinical", // Recrutement ou Gestion RH
	SA45: "non_clinical", // Communication, Marketing, Consulting, Média
	SA46: "non_clinical", // Fab, Exploit, Import, Répart, Distrib médicaments
	SA47: "non_clinical", // Incendie et secours
	SA48: "non_clinical", // Entreprise indus et tertiaire hors pharmaceutique
	SA49: "non_clinical", // Entité Outre-Mer
	SA50: "non_clinical", // Permanence des soins ambulatoires hors cabinet
	SA51: "health_center", // Structure de coop avec autorisation de soins
	SA52: "health_center", // Maison de santé ou Pôle de santé
	SA53: "non_clinical", // Siège administratif d'un établissement de santé
	SA54: "health_center", // Centre de dépistage et de prévention
	SA55: "non_clinical", // Laboratoire pharmaceutique préparant délivrant allergènes
	SA56: "non_clinical", // Propharmacie
	SA57: "non_clinical", // Structure de coop avec mission coordination soins
	SA58: "non_clinical", // Entreprise de taxis
	SA59: "health_center", // Labo de biologie médicale hors catégorie standard
	SA60: "non_clinical", // Centres médicaux SNCF
	SA61: "non_clinical", // Structure Dispensatrice à domicile d'Oxygène
	SA62: "non_clinical", // Ordre professionnel de santé (retired)
	SA63: "non_clinical", // Structures de coordination et d'orientation
	SA64: "non_clinical", // Société de téléconsultation
	SA65: "non_clinical", // Antenne de pharmacie
	SA66: "non_clinical", // Services de Prévention et de Santé au Travail (SPST)
	SA67: "health_center", // Maisons médicales de garde (MMG)
	SA68: "non_clinical", // Services départementaux d'incendie et de secours
	SA69: "health_center", // Maisons de naissance
};

/** TRE_R21 roles. `clinical` leaves the decision to the sector. */
export const FR_ROLE_CLASSES: Readonly<Record<string, ActivityClass>> = {
	"FON-01": "clinical", // Titulaire de cabinet
	"FON-02": "clinical", // Associé dans une société d'exercice (SEL ou SCP)
	"FON-03": "clinical", // Titulaire d'officine
	"FON-04": "locum", // Remplaçant du titulaire d'officine
	"FON-05": "clinical", // Adjoint
	"FON-07": "clinical", // Gérant après incapacité ou décès
	"FON-09": "non_clinical", // Responsable d'établissement
	"FON-10": "non_clinical", // Responsable de gestion d'établissement (retired)
	"FON-11": "non_clinical", // Directeur central du SSA (retired)
	"FON-12": "non_clinical", // Médecin chef d'un hôpital d'instruction des Armées (retired)
	"FON-13": "non_clinical", // Directeur de région ou chef d'établissement du SSA (retired)
	"FON-14": "non_clinical", // Adjoint au chef d'un hôpital (retired)
	"FON-15": "clinical", // Directeur de laboratoire (retired)
	"FON-16": "clinical", // Directeur-adjoint de laboratoire (retired)
	"FON-17": "clinical", // Collaborateur
	"FON-18": "clinical", // Assistant
	"FON-19": "non_clinical", // Praticien Conseil
	"FON-21": "non_clinical", // Médecin scolaire
	"FON-22": "locum", // Remplaçant, intérimaire, intermittent
	"FON-23": "non_clinical", // Gérant
	"FON-24": "non_clinical", // Médecin de santé publique
	"FON-27": "non_clinical", // Pharmacien de santé publique (retired)
	"FON-28": "non_clinical", // Médecin de prévention (retired)
	"FON-29": "non_clinical", // Médecin du travail
	"FON-30": "non_clinical", // Dispensateur de gaz médicaux (retired)
	"FON-32": "non_clinical", // Régulateur libéral
	"FON-33": "clinical", // Salarié en poste fixe
	"FON-35": "clinical", // Chef de service (retired)
	"FON-36": "non_clinical", // Délégué
	"FON-37": "non_clinical", // Gérant de PUI
	"FON-38": "clinical", // Responsable du service PMI (retired)
	"FON-39": "clinical", // Exercice en PMI
	"FON-40": "clinical", // Biologiste responsable
	"FON-41": "clinical", // Biologiste médical
	"FON-42": "clinical", // Assistant collaborateur
	"FON-43": "non_clinical", // Cadre de santé
	"FON-44": "non_clinical", // Cadre supérieur de santé (retired)
	"FON-45": "non_clinical", // Directeur des soins
	"FON-46": "non_clinical", // Enseignant salarié
	"FON-47": "locum", // Etudiant remplaçant, adjoint
	"FON-48": "clinical", // Interne
	"FON-49": "non_clinical", // Pharmacien responsable BPDO
	"FON-50": "non_clinical", // Pharmacien adjoint BPDO
	"FON-51": "locum", // Remplacement partiel
	"FON-52": "non_clinical", // Etudiant militaire
	"FON-53": "clinical", // Médecin assistant (retired)
	"FON-54": "non_clinical", // Permanence des soins ambulatoires hors cabinet
	"FON-55": "clinical", // Participation libérale aux missions de service public d'un ES
	"FON-56": "clinical", // Intervention libérale dans le cadre d'un GCS
	"FON-57": "clinical", // Docteur junior
	"FON-58": "non_clinical", // Activité en piscine ou bassin
	"FON-59": "non_clinical", // Gérant d'antenne
	"FON-60": "locum", // Pharmacien remplaçant BPDO
	"FON-61": "non_clinical", // Prestataire de Services
	"FON-62": "clinical", // Consultations de solidarité territoriale
	"FON-63": "non_clinical", // Coordonnateur en EHPAD
	"FON-65": "locum", // Remplaçant du titulaire d'officine (IE)
	"FON-AU": "clinical", // Fonction non définie
};

/** TRE_R22 activity genres. */
export const FR_GENRE_CLASSES: Readonly<Record<string, ActivityClass>> = {
	GENR01: "clinical", // Activité de soin et de pharmacie
	GENR02: "locum", // Activité de soins ou de pharmacien en tant que remplaçant
	GENR03: "locum", // Remplacement dans une activité de soins
	GENR04: "non_clinical", // Activité non soignante
	GENR05: "non_clinical", // Activité non médicale (retired)
	GENR06: "clinical", // Délégation de responsabilité pour continuité de service
	GENR07: "locum", // Activité de soins en tant qu'intérimaire (retired)
	GENR08: "non_clinical", // Coordination et orientation
	GENR09: "non_clinical", // Administratif ou appui à l'organisation
	GENR10: "non_clinical", // Accompagnement social/médico-social à la vie sociale
	GENR11: "non_clinical", // Accompagnement social/médico-social au soin
	GENR12: "non_clinical", // Encadrement et organisation de l'accompagnement
	GENR13: "non_clinical", // Activité médico-administrative
	GENR99: "non_clinical", // Autre activité
};

/** TRE_R23 practice modes. */
export const FR_PRACTICE_MODES = ["L", "S", "B", "I"] as const;

/** TRE_R11 exercise titles shown before the name. */
export const FR_TITLES = ["DR", "PR", "MC", "MG", "PC", "PG"] as const;

/**
 * First URL segments reserved by the app: they can never be a listing slug.
 * Includes the institutional pages, the English locale prefix and the
 * technical paths (sitemaps, Open Graph images, the component gallery).
 */
export const RESERVED_SEGMENTS = [
	"praticien",
	"etablissement",
	"annuaire",
	"recherche",
	"pro",
	"rdv",
	"api",
	"a-propos",
	"open-source",
	"donnees",
	"accessibilite",
	"confidentialite",
	"mentions-legales",
	"conditions",
	"en",
	"og",
	"sitemaps",
	"_ui",
] as const;

/** True when `segment` is reserved by the app and must never resolve to a listing. */
export function isReservedSegment(segment: string): boolean {
	return (RESERVED_SEGMENTS as readonly string[]).includes(segment);
}

/**
 * True when `slug` is a listing slug the app can serve as the first URL
 * segment: known to the taxonomy and not reserved.
 */
export function isListingSlug(slug: string): boolean {
	return !isReservedSegment(slug) && LISTING_SLUGS.has(slug);
}

export type ActivityCodes = {
	sectorCode?: string | null;
	roleCode?: string | null;
	genreCode?: string | null;
	/** True when the activity is tied to a structure with an address. */
	hasSite: boolean;
};

/**
 * Derives the practice kind of one activity.
 *
 * Precedence: a locum or non-clinical genre wins, then a locum or non-clinical
 * role, then the sector. An activity without a site can only be a locum or
 * non-clinical. Unknown codes fall back to `non_clinical` and are returned in
 * `unknownCodes` so the import can report them.
 */
export function practiceKindFor(codes: ActivityCodes): PracticeKindResult {
	const unknownCodes: string[] = [];
	const classify = (
		code: string | null | undefined,
		table: Readonly<Record<string, ActivityClass>>,
	): ActivityClass | null => {
		if (!code) return null;
		const found = table[code];
		if (!found) {
			unknownCodes.push(code);
			return "non_clinical";
		}
		return found;
	};

	const genre = classify(codes.genreCode, FR_GENRE_CLASSES);
	const role = classify(codes.roleCode, FR_ROLE_CLASSES);
	let sectorKind: PracticeKind | null = null;
	if (codes.sectorCode) {
		const found = FR_SECTOR_KINDS[codes.sectorCode];
		if (found) {
			sectorKind = found;
		} else {
			unknownCodes.push(codes.sectorCode);
			sectorKind = "non_clinical";
		}
	}

	const kind = ((): PracticeKind => {
		if (genre === "locum") return "locum";
		if (genre === "non_clinical") return "non_clinical";
		if (role === "locum") return "locum";
		if (role === "non_clinical") return "non_clinical";
		if (!codes.hasSite) return "non_clinical";
		return sectorKind ?? "non_clinical";
	})();

	return { kind, unknownCodes };
}

/** Returns the profession entry, or undefined for unmapped or excluded codes. */
export function professionFor(code: string): ProfessionEntry | undefined {
	return FR_PROFESSIONS[code];
}

/**
 * Listing slug for a practitioner: the specialty slug when the specialty
 * belongs to the practitioner's profession, else the profession slug
 * (`medecin`, `chirurgien-dentiste`, `sage-femme`…).
 */
export function listingSlugFor(
	professionCode: string,
	specialtyCode: string | null | undefined,
): string | null {
	const profession = FR_PROFESSIONS[professionCode];
	if (!profession) return null;
	if (specialtyCode && !SPECIALTY_AGNOSTIC_PROFESSIONS.has(professionCode)) {
		const specialty = FR_SPECIALTIES[specialtyCode];
		if (specialty && specialty.profession === professionCode) {
			return specialty.slug;
		}
	}
	return profession.slug;
}

/** Every slug that can appear as the first URL segment of a listing. */
export function allListingSlugs(): Set<string> {
	const slugs = new Set<string>();
	for (const profession of Object.values(FR_PROFESSIONS)) slugs.add(profession.slug);
	for (const specialty of Object.values(FR_SPECIALTIES)) slugs.add(specialty.slug);
	return slugs;
}

const LISTING_SLUGS: ReadonlySet<string> = allListingSlugs();

/** Profession code of a listing slug (`cardiologue` -> `10`), or undefined. */
export function professionOfListingSlug(slug: string): string | undefined {
	for (const [code, profession] of Object.entries(FR_PROFESSIONS)) {
		if (profession.slug === slug) return code;
	}
	for (const specialty of Object.values(FR_SPECIALTIES)) {
		if (specialty.slug === slug) return specialty.profession;
	}
	return undefined;
}

/**
 * Parses a comma-separated list of profession codes (CLI flag or env var).
 * Throws on unknown codes and on excluded ones (99).
 */
export function parseProfessionList(value: string | undefined): string[] {
	const codes = (value ?? FR_DEFAULT_PROFESSIONS.join(","))
		.split(",")
		.map((code) => code.trim())
		.filter(Boolean);
	if (codes.length === 0) {
		throw new Error("At least one profession code is required");
	}
	for (const code of codes) {
		if ((FR_EXCLUDED_PROFESSIONS as readonly string[]).includes(code)) {
			throw new Error(`Profession ${code} is never imported (not a health profession)`);
		}
		if (!FR_PROFESSIONS[code]) {
			throw new Error(`Unknown profession code: ${code}`);
		}
	}
	return [...new Set(codes)].sort();
}

/**
 * Ameli (Cnam) specialty codes mapped to the listing slugs they are compatible
 * with, used to check that an Ameli row and an RPPS practitioner have the same
 * kind of practice. The first slug is the natural one; the others cover known
 * overlaps (a specialist dentist billing as a dentist, a doctor without a
 * recorded specialty billing as a general practitioner…). Codes for other
 * professions (nurses, pharmacies, labs…) are absent on purpose.
 */
export const FR_AMELI_SPECIALTY_SLUGS: Readonly<Record<string, readonly string[]>> = {
	"01": ["medecin-generaliste", "medecin"],
	"02": ["anesthesiste-reanimateur"],
	"03": ["cardiologue"],
	"04": ["chirurgien-general"],
	"05": ["dermatologue"],
	"06": ["radiologue"],
	"07": ["gynecologue-obstetricien", "gynecologue"],
	"08": ["gastro-enterologue"],
	"09": ["interniste"],
	"10": ["neurochirurgien"],
	"11": ["orl"],
	"12": ["pediatre"],
	"13": ["pneumologue"],
	"14": ["rhumatologue"],
	"15": ["ophtalmologue"],
	"16": ["urologue"],
	"17": ["neuropsychiatre"],
	"18": ["stomatologue", "chirurgien-maxillo-facial"],
	"19": ["chirurgien-dentiste", "chirurgien-oral", "specialiste-medecine-bucco-dentaire"],
	"20": ["medecin-reanimateur"],
	"21": ["sage-femme"],
	"22": ["medecin-generaliste", "medecin"],
	"23": ["medecin-generaliste", "medecin"],
	"31": ["medecin-reeducateur"],
	"32": ["neurologue"],
	"33": ["psychiatre"],
	"34": ["geriatre"],
	"35": ["nephrologue"],
	"36": ["orthodontiste"],
	"37": ["anatomopathologiste"],
	"38": ["biologiste-medical"],
	"41": ["chirurgien-orthopediste"],
	"42": ["endocrinologue"],
	"43": ["chirurgien-pediatrique"],
	"44": ["chirurgien-maxillo-facial"],
	"45": ["chirurgien-maxillo-facial", "stomatologue"],
	"46": ["chirurgien-plasticien"],
	"47": ["chirurgien-thoracique-et-cardiovasculaire"],
	"48": ["chirurgien-vasculaire"],
	"49": ["chirurgien-visceral"],
	"53": ["chirurgien-oral", "chirurgien-dentiste"],
	"54": ["specialiste-medecine-bucco-dentaire", "chirurgien-dentiste"],
	"69": ["chirurgien-oral"],
	"70": ["gynecologue", "gynecologue-obstetricien"],
	"71": ["hematologue"],
	"72": ["medecin-nucleaire"],
	"73": ["oncologue"],
	"74": ["radiotherapeute", "oncologue"],
	"75": ["pedopsychiatre", "psychiatre"],
	"76": ["radiotherapeute"],
	"77": ["gynecologue-obstetricien", "gynecologue"],
	"78": ["geneticien"],
	"79": ["gynecologue-obstetricien", "gynecologue"],
	"80": ["medecin-de-sante-publique"],
	"81": ["infectiologue"],
	"82": ["medecin-legiste"],
	"83": ["urgentiste"],
	"84": ["medecin-vasculaire"],
	"85": ["allergologue"],
};

/** True when an Ameli specialty code may describe a practitioner with this listing slug. */
export function ameliSpecialtyCompatible(ameliCode: string, listingSlug: string): boolean {
	return FR_AMELI_SPECIALTY_SLUGS[ameliCode]?.includes(listingSlug) ?? false;
}
