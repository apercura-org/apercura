/**
 * Czech taxonomy: the kinds of healthcare facility (druh zdravotnického zařízení) of the
 * National Register of Healthcare Providers (NRPZS, ÚZIS) that patients visit, and the fields
 * of care (obory péče, Act No. 372/2011 Coll., §§ 4–10) of the specialists' practices, mapped
 * to Czech listing slugs (docs/adr/0002-multi-country.md, "Czechia").
 *
 * A Czech page is a facility, the register's unit: a practice, a pharmacy, a home care
 * agency. Its kind is its profession code (`CZ_GP`, `CZ_PHARMACY`…), read from the NRPZS
 * facility kind code (`ZZ_druh_kod`, ÚZIS code list). A specialist's practice (kind 324) is
 * listed under the field of care it is known for (`kardiolog`); its other fields are shown on
 * its page.
 *
 * Labels are not stored here: they live in the i18n catalogs under `taxonomy.*`, keyed by
 * listing slug, like the other markets'. Listing slugs are Czech, without diacritics, and never
 * collide with a French, Austrian or UK one (tested), so a listing slug always names one market.
 */
import { slugify } from "../slugify";

/** General practitioners for adults (Samostatná ordinace všeobecného praktického lékaře). */
export const CZ_GP = "CZ_GP";
/** General practitioners for children and adolescents (praktický lékař pro děti a dorost). */
export const CZ_PAEDIATRIC = "CZ_PAEDIATRIC";
/** Dental practices (Samostatná ordinace praktického lékaře – stomatologa). */
export const CZ_DENTIST = "CZ_DENTIST";
/** Gynaecologists' practices (Samostatná ordinace praktického lékaře – gynekologa). */
export const CZ_GYNAECOLOGY = "CZ_GYNAECOLOGY";
/** Specialists' practices (Samostatná ordinace lékaře specialisty). */
export const CZ_SPECIALIST = "CZ_SPECIALIST";
/** Pharmacies (Lékárna). */
export const CZ_PHARMACY = "CZ_PHARMACY";
/** Home care agencies, mostly nurses (Domácí zdravotní péče). */
export const CZ_HOME_CARE = "CZ_HOME_CARE";
/** Physiotherapists (Samostatné zařízení fyzioterapeuta). */
export const CZ_PHYSIOTHERAPY = "CZ_PHYSIOTHERAPY";
/** Clinical psychologists (Samostatné zařízení psychologa). */
export const CZ_PSYCHOLOGY = "CZ_PSYCHOLOGY";
/** Speech therapists (Samostatné zařízení logopeda). */
export const CZ_SPEECH_THERAPY = "CZ_SPEECH_THERAPY";
/** Midwives (Samostatné zařízení porodní asistence). */
export const CZ_MIDWIFERY = "CZ_MIDWIFERY";

/** Profession codes of the Czech facilities (kinds of facility) and their URL slugs. */
export const CZ_PROFESSIONS: Readonly<Record<string, { slug: string; enabled: boolean }>> = {
	[CZ_GP]: { slug: "prakticky-lekar", enabled: true },
	[CZ_PAEDIATRIC]: { slug: "detsky-lekar", enabled: true },
	[CZ_DENTIST]: { slug: "zubni-lekar", enabled: true },
	[CZ_GYNAECOLOGY]: { slug: "gynekolog", enabled: true },
	// Never a bare `specialista`: the listing of the specialists whose field has no listing.
	[CZ_SPECIALIST]: { slug: "lekar-specialista", enabled: true },
	[CZ_PHARMACY]: { slug: "lekarna", enabled: true },
	[CZ_HOME_CARE]: { slug: "domaci-pece", enabled: true },
	[CZ_PHYSIOTHERAPY]: { slug: "fyzioterapeut", enabled: true },
	[CZ_PSYCHOLOGY]: { slug: "psycholog", enabled: true },
	[CZ_SPEECH_THERAPY]: { slug: "logoped", enabled: true },
	[CZ_MIDWIFERY]: { slug: "porodni-asistentka", enabled: true },
};

export const CZ_DEFAULT_PROFESSIONS = Object.keys(CZ_PROFESSIONS);

/**
 * The NRPZS facility kinds imported (`ZZ_druh_kod`) and the profession they are. Every other
 * kind is left out and counted by the import: hospitals and their wards, laboratories, dental
 * laboratories, opticians, ambulance and transport services, blood and plasma centres, spas,
 * social care homes, occupational health services, the outpatient centres of several fields
 * (polyclinics, whose fields are not tied to a practice) and the rest.
 */
export const CZ_FACILITY_KINDS: Readonly<Record<string, string>> = {
	"320": CZ_GP,
	"321": CZ_PAEDIATRIC,
	"322": CZ_DENTIST,
	"323": CZ_GYNAECOLOGY,
	"324": CZ_SPECIALIST,
	"340": CZ_PSYCHOLOGY,
	"341": CZ_SPEECH_THERAPY,
	"350": CZ_HOME_CARE,
	"351": CZ_PHYSIOTHERAPY,
	"353": CZ_MIDWIFERY,
	"510": CZ_PHARMACY,
};

/** The profession of an NRPZS facility kind code, or null when the kind is not imported. */
export function czProfessionOfKind(kindCode: string | null | undefined): string | null {
	return kindCode ? (CZ_FACILITY_KINDS[kindCode.trim()] ?? null) : null;
}

/**
 * The fields of care of the specialists' practices that have a listing, by code (the slug of
 * the field's name in the register, `kardiologie`), in order of precedence: a practice with
 * several fields is listed under the first one here, the specific fields before the broad ones
 * (internal medicine, general surgery). A paediatric field shares its adult field's listing.
 * Fields absent from this table (about 2% of the practices) list the practice under
 * `lekar-specialista`.
 */
export const CZ_SPECIALTIES: Readonly<Record<string, { slug: string }>> = {
	"gynekologie-a-porodnictvi": { slug: "gynekolog" },
	"gynekologie-deti-a-dospivajicich": { slug: "gynekolog" },
	urogynekologie: { slug: "gynekolog" },
	onkogynekologie: { slug: "gynekolog" },
	"reprodukcni-medicina": { slug: "gynekolog" },
	oftalmologie: { slug: "ocni-lekar" },
	"detska-a-dorostova-psychiatrie": { slug: "detsky-psychiatr" },
	psychiatrie: { slug: "psychiatr" },
	gerontopsychiatrie: { slug: "psychiatr" },
	"navykove-nemoci": { slug: "psychiatr" },
	"ortopedie-a-traumatologie-pohyboveho-ustroji": { slug: "ortoped" },
	"ortopedicka-protetika": { slug: "ortoped" },
	traumatologie: { slug: "ortoped" },
	"plasticka-chirurgie": { slug: "plasticky-chirurg" },
	"cevni-chirurgie": { slug: "cevni-chirurg" },
	neurochirurgie: { slug: "neurochirurg" },
	dermatovenerologie: { slug: "dermatolog" },
	"korektivni-dermatologie": { slug: "dermatolog" },
	"detska-dermatovenerologie": { slug: "dermatolog" },
	"detska-neurologie": { slug: "neurolog" },
	neurologie: { slug: "neurolog" },
	"rehabilitacni-a-fyzikalni-medicina": { slug: "rehabilitacni-lekar" },
	"endokrinologie-a-diabetologie": { slug: "endokrinolog" },
	"detska-endokrinologie-a-diabetologie": { slug: "endokrinolog" },
	"otorinolaryngologie-a-chirurgie-hlavy-a-krku": { slug: "usni-nosni-krcni" },
	"detska-otorinolaryngologie": { slug: "usni-nosni-krcni" },
	foniatrie: { slug: "usni-nosni-krcni" },
	kardiologie: { slug: "kardiolog" },
	"detska-kardiologie": { slug: "kardiolog" },
	urologie: { slug: "urolog" },
	"detska-urologie": { slug: "urolog" },
	"alergologie-a-klinicka-imunologie": { slug: "alergolog" },
	ortodoncie: { slug: "ortodontista" },
	"pneumologie-a-ftizeologie": { slug: "pneumolog" },
	"detska-pneumologie": { slug: "pneumolog" },
	gastroenterologie: { slug: "gastroenterolog" },
	"detska-gastroenterologie-a-hepatologie": { slug: "gastroenterolog" },
	revmatologie: { slug: "revmatolog" },
	angiologie: { slug: "angiolog" },
	"klinicka-onkologie": { slug: "onkolog" },
	"radiacni-onkologie": { slug: "onkolog" },
	nefrologie: { slug: "nefrolog" },
	"detska-nefrologie": { slug: "nefrolog" },
	"lekarska-genetika": { slug: "genetik" },
	"radiologie-a-zobrazovaci-metody": { slug: "radiolog" },
	"detska-radiologie": { slug: "radiolog" },
	"intervencni-radiologie": { slug: "radiolog" },
	"anesteziologie-a-intenzivni-medicina": { slug: "anesteziolog" },
	algeziologie: { slug: "anesteziolog" },
	"zubni-lekarstvi": { slug: "zubni-lekar" },
	"klinicka-stomatologie": { slug: "zubni-lekar" },
	"oralni-a-maxilofacialni-chirurgie": { slug: "chirurg" },
	"detska-chirurgie": { slug: "chirurg" },
	"hrudni-chirurgie": { slug: "chirurg" },
	kardiochirurgie: { slug: "chirurg" },
	onkochirurgie: { slug: "chirurg" },
	koloproktologie: { slug: "chirurg" },
	chirurgie: { slug: "chirurg" },
	"prakticke-lekarstvi-pro-deti-a-dorost": { slug: "detsky-lekar" },
	"detske-lekarstvi": { slug: "detsky-lekar" },
	pediatrie: { slug: "detsky-lekar" },
	"dorostove-lekarstvi": { slug: "detsky-lekar" },
	"vnitrni-lekarstvi": { slug: "internista" },
	"vseobecne-prakticke-lekarstvi": { slug: "prakticky-lekar" },
};

const SPECIALTY_ORDER: ReadonlyMap<string, number> = new Map(
	Object.keys(CZ_SPECIALTIES).map((code, index) => [code, index]),
);

/** The code of a field of care as the register names it (`Kardiologie ` -> `kardiologie`). */
export function czFieldCodeOf(label: string): string {
	return slugify(label);
}

/**
 * The fields of care of a facility (`ZZ_obor_pece`, comma-separated), as codes and labels,
 * in the register's order, each once. Empty names are dropped.
 */
export function czFieldsOf(raw: string | null | undefined): { code: string; label: string }[] {
	const seen = new Set<string>();
	const fields: { code: string; label: string }[] = [];
	for (const part of (raw ?? "").split(",")) {
		const label = part.replace(/\s+/g, " ").trim();
		const code = czFieldCodeOf(label);
		if (!code || seen.has(code)) continue;
		seen.add(code);
		fields.push({ code, label });
	}
	return fields;
}

/**
 * The field a specialist's practice is listed under: of its fields that have a listing, the
 * first in `CZ_SPECIALTIES`. Null when none has one.
 */
export function primaryCzSpecialty(codes: readonly string[]): string | null {
	let best: string | null = null;
	let rank = Number.POSITIVE_INFINITY;
	for (const code of codes) {
		const order = SPECIALTY_ORDER.get(code);
		if (order !== undefined && order < rank) {
			best = code;
			rank = order;
		}
	}
	return best;
}

/**
 * Listing slug of a Czech facility: a specialist's practice under its primary field of care
 * (else `lekar-specialista`), any other facility under its kind's (`prakticky-lekar`).
 */
export function czListingSlugFor(
	professionCode: string,
	specialtyCode: string | null | undefined,
): string | null {
	const profession = CZ_PROFESSIONS[professionCode];
	if (!profession) return null;
	if (professionCode === CZ_SPECIALIST && specialtyCode) {
		const specialty = CZ_SPECIALTIES[specialtyCode];
		if (specialty) return specialty.slug;
	}
	return profession.slug;
}

/** Every Czech listing slug. */
export function allCzListingSlugs(): Set<string> {
	const slugs = new Set<string>();
	for (const profession of Object.values(CZ_PROFESSIONS)) slugs.add(profession.slug);
	for (const specialty of Object.values(CZ_SPECIALTIES)) slugs.add(specialty.slug);
	return slugs;
}

const CZ_LISTING_SLUGS: ReadonlySet<string> = allCzListingSlugs();

/**
 * First URL segments of the Czech pages that can never be a listing slug: the Czech route
 * segments of the app (`/cz/zarizeni/…`, `/cz/adresar`) and the technical ones.
 */
export const CZ_RESERVED_SEGMENTS = [
	"zarizeni",
	"organizace",
	"adresar",
	"hledat",
	"pro",
	"rdv",
	"api",
	"o-projektu",
	"open-source",
	"data",
	"pristupnost",
	"ochrana-osobnich-udaju",
	"pravni-informace",
	"podminky-uziti",
	"guides",
	"og",
	"sitemaps",
	"_ui",
] as const;

/** True when `slug` can be served as a Czech listing page. */
export function isCzListingSlug(slug: string): boolean {
	return !(CZ_RESERVED_SEGMENTS as readonly string[]).includes(slug) && CZ_LISTING_SLUGS.has(slug);
}

/** The profession code whose own listing a slug is (`lekarna` -> `CZ_PHARMACY`), if any. */
export function czProfessionOfListingSlug(slug: string): string | undefined {
	return Object.entries(CZ_PROFESSIONS).find(([, profession]) => profession.slug === slug)?.[0];
}
