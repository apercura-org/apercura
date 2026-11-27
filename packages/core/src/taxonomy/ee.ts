/**
 * Estonian taxonomy: the kinds of provider the Estonian market lists, mapped to Estonian listing
 * slugs (docs/adr/0002-multi-country.md, "Estonia").
 *
 * An Estonian page is a healthcare provider of the Health Board's register (Terviseamet, MEDRE
 * open data: an institution holding at least one activity licence, "tegevusluba") or a pharmacy
 * of the State Agency of Medicines' register (Ravimiamet). A provider is listed once, under the
 * kind its licences say first: a hospital (a specialist care licence issued to a hospital, its
 * kind not a nursing hospital), a family practice (a general practice licence), a dental clinic
 * (specialist care licences whose services are all dental), another specialist provider, then
 * the licences of nursing care (nursing hospitals included), midwifery, physiotherapy, clinical
 * psychology and speech therapy. A provider whose only licences are ambulance services is not
 * listed: an ambulance is called, not visited. Every licence, with its number, and every
 * service is shown on the page.
 *
 * Labels are not stored here: they live in the i18n catalogs under `taxonomy.*`, keyed by
 * listing slug, like the other markets'. Listing slugs are Estonian, diacritics dropped, and
 * never collide with another market's (tested).
 */

/** Hospitals: regional, central, general, local, special and rehabilitation hospitals. */
export const EE_HOSPITAL = "EE_HOSPITAL";
/** Family practices: providers of general medical care on a family doctor's list. */
export const EE_FAMILY_PRACTICE = "EE_FAMILY_PRACTICE";
/** Dental clinics: specialist care whose services are dental (orthodontics, oral surgery). */
export const EE_DENTAL = "EE_DENTAL";
/** Other providers of specialist (outpatient or day) care. */
export const EE_SPECIALIST = "EE_SPECIALIST";
/** Nursing care: home nursing, nurses' practices, nursing hospitals and care home nursing. */
export const EE_NURSING = "EE_NURSING";
/** Midwifery care. */
export const EE_MIDWIFERY = "EE_MIDWIFERY";
/** Physiotherapy provided independently. */
export const EE_PHYSIOTHERAPY = "EE_PHYSIOTHERAPY";
/** Psychological treatment (clinical psychologists) provided independently. */
export const EE_PSYCHOLOGY = "EE_PSYCHOLOGY";
/** Speech therapy provided independently. */
export const EE_SPEECH_THERAPY = "EE_SPEECH_THERAPY";
/** General pharmacies (üldapteegid) of the State Agency of Medicines, branches included. */
export const EE_PHARMACY = "EE_PHARMACY";

/** Profession codes of the Estonian providers and their listing. */
export const EE_PROFESSIONS: Readonly<Record<string, { slug: string; enabled: boolean }>> = {
	[EE_HOSPITAL]: { slug: "haiglad", enabled: true },
	[EE_FAMILY_PRACTICE]: { slug: "perearstikeskused", enabled: true },
	[EE_DENTAL]: { slug: "hambaravi", enabled: true },
	[EE_SPECIALIST]: { slug: "eriarstiabi", enabled: true },
	[EE_NURSING]: { slug: "oendusabi", enabled: true },
	[EE_MIDWIFERY]: { slug: "ammaemandusabi", enabled: true },
	[EE_PHYSIOTHERAPY]: { slug: "fusioteraapia", enabled: true },
	[EE_PSYCHOLOGY]: { slug: "psuhholoogiline-ravi", enabled: true },
	[EE_SPEECH_THERAPY]: { slug: "logopeedia", enabled: true },
	[EE_PHARMACY]: { slug: "apteegid", enabled: true },
};

export const EE_DEFAULT_PROFESSIONS = Object.keys(EE_PROFESSIONS);

/**
 * The kind of a provider in the singular, as its page and cards name it
 * (`taxonomy.profession.*`).
 */
export const EE_KIND_SLUGS: Readonly<Record<string, string>> = {
	[EE_HOSPITAL]: "haigla",
	[EE_FAMILY_PRACTICE]: "perearstikeskus",
	[EE_DENTAL]: "hambakliinik",
	[EE_SPECIALIST]: "eriarstiabi-osutaja",
	[EE_NURSING]: "oendusabi-osutaja",
	[EE_MIDWIFERY]: "ammaemandusabi-osutaja",
	[EE_PHYSIOTHERAPY]: "fusioteraapia-osutaja",
	[EE_PSYCHOLOGY]: "psuhholoogilise-ravi-osutaja",
	[EE_SPEECH_THERAPY]: "logopeedia-osutaja",
	[EE_PHARMACY]: "apteek",
};

/**
 * The register's kinds of activity licence (`loaliik_kood`): specialist care, nursing care,
 * ambulance, midwifery, general medical care, speech therapy, psychological treatment and
 * physiotherapy.
 */
export const EE_LICENCE_KINDS = {
	specialist: "1",
	nursing: "2",
	ambulance: "3",
	midwifery: "6",
	generalPractice: "7",
	speechTherapy: "31",
	psychology: "32",
	physiotherapy: "33",
} as const;

/**
 * The register's kinds of hospital (`haiglaliik_kood`) listed as hospitals: regional (`PK`),
 * central (`KESK`), general (`YLD`), local (`KOH`), special (`ERI`) and rehabilitation (`TAAS`)
 * hospitals. A nursing hospital (`OEH`, õendushaigla) lists with nursing care.
 */
export const EE_HOSPITAL_KINDS: ReadonlySet<string> = new Set([
	"PK",
	"KESK",
	"YLD",
	"KOH",
	"ERI",
	"TAAS",
]);

/**
 * Dental services of the register's classification: dental care (`T0003`), orthodontics
 * (`T0292`), restorative dentistry (`T0206`) and outpatient oral and maxillofacial surgery
 * (`T0082`).
 */
export const EE_DENTAL_SERVICES: ReadonlySet<string> = new Set([
	"T0003",
	"T0292",
	"T0206",
	"T0082",
]);

/** One activity licence of a provider, as the kind of provider is told from it. */
export type EeLicence = {
	/** `loaliik_kood`. */
	kind: string;
	/** `haiglaliik_kood`, or null. */
	hospitalKind: string | null;
	/** The services of the licence's places of activity (`T0003`, `TPmed`). */
	services: readonly string[];
};

/**
 * The kind of a provider from its licences (the first that applies): a hospital, a family
 * practice, a dental clinic, another specialist provider, nursing care (a nursing hospital
 * included), midwifery, physiotherapy, psychological treatment, speech therapy. Null for a
 * provider whose only licences are ambulance services, or none.
 */
export function eeProviderKind(licences: readonly EeLicence[]): string | null {
	const kinds = new Set(licences.map((licence) => licence.kind));
	if (
		licences.some(
			(licence) =>
				licence.kind === EE_LICENCE_KINDS.specialist &&
				licence.hospitalKind !== null &&
				EE_HOSPITAL_KINDS.has(licence.hospitalKind),
		)
	) {
		return EE_HOSPITAL;
	}
	if (kinds.has(EE_LICENCE_KINDS.generalPractice)) return EE_FAMILY_PRACTICE;
	const specialist = licences.filter((licence) => licence.kind === EE_LICENCE_KINDS.specialist);
	if (specialist.length > 0) {
		const services = specialist.flatMap((licence) => licence.services);
		return services.length > 0 && services.every((code) => EE_DENTAL_SERVICES.has(code))
			? EE_DENTAL
			: EE_SPECIALIST;
	}
	if (kinds.has(EE_LICENCE_KINDS.nursing)) return EE_NURSING;
	if (kinds.has(EE_LICENCE_KINDS.midwifery)) return EE_MIDWIFERY;
	if (kinds.has(EE_LICENCE_KINDS.physiotherapy)) return EE_PHYSIOTHERAPY;
	if (kinds.has(EE_LICENCE_KINDS.psychology)) return EE_PSYCHOLOGY;
	if (kinds.has(EE_LICENCE_KINDS.speechTherapy)) return EE_SPEECH_THERAPY;
	return null;
}

/** Listing slug of an Estonian provider: its kind's (no specialty decides a listing). */
export function eeListingSlugFor(
	professionCode: string,
	_specialtyCode?: string | null | undefined,
): string | null {
	return EE_PROFESSIONS[professionCode]?.slug ?? null;
}

/** Every Estonian listing slug. */
export function allEeListingSlugs(): Set<string> {
	return new Set(Object.values(EE_PROFESSIONS).map((profession) => profession.slug));
}

/** Every slug of the Estonian labels (`taxonomy.listing.*`, `taxonomy.profession.*`): listings and kinds. */
export function allEeTaxonomySlugs(): Set<string> {
	return new Set([...allEeListingSlugs(), ...Object.values(EE_KIND_SLUGS)]);
}

const EE_LISTING_SLUGS: ReadonlySet<string> = allEeListingSlugs();

/**
 * First URL segments of the Estonian pages that can never be a listing slug: the Estonian route
 * segments of the market (`/ee/asutus/…`, `/ee/kataloog`) and the technical ones.
 */
export const EE_RESERVED_SEGMENTS = [
	"asutus",
	"organisatsioon",
	"kataloog",
	"otsing",
	"pro",
	"rdv",
	"api",
	"projektist",
	"open-source",
	"andmed",
	"ligipaasetavus",
	"privaatsus",
	"oigusteave",
	"kasutustingimused",
	"guides",
	"og",
	"sitemaps",
	"_ui",
] as const;

/** True when `slug` can be served as an Estonian listing page. */
export function isEeListingSlug(slug: string): boolean {
	return !(EE_RESERVED_SEGMENTS as readonly string[]).includes(slug) && EE_LISTING_SLUGS.has(slug);
}

/** The profession code whose listing a slug is (`apteegid` → `EE_PHARMACY`), if any. */
export function eeProfessionOfListingSlug(slug: string): string | undefined {
	return Object.entries(EE_PROFESSIONS).find(([, profession]) => profession.slug === slug)?.[0];
}

/** The kind slug of an Estonian provider's profession (`EE_PHARMACY` → `apteek`), if any. */
export function eeKindSlugOf(professionCode: string | null | undefined): string | null {
	return professionCode ? (EE_KIND_SLUGS[professionCode] ?? null) : null;
}
