/**
 * Lithuanian taxonomy: the kinds of licensed health-care institution the State Accreditation
 * Service for Health Care Activities (VASPVT) lists (docs/adr/0002-multi-country.md,
 * "Lithuania"), each its own Lithuanian listing.
 *
 * A Lithuanian page is an activity address of a licensed institution: a hospital, a primary
 * care centre, a clinic, a dental clinic, a nursing service. VASPVT names no kind of
 * institution: the kind is read from the services licensed at the address (`IstaigosPaslauga`,
 * with the mode, group and level of each service in `PaslauguNustatymas`), the most specific
 * first (`ltKindOfServices`). Every licensed service is shown on the page; none is a listing of
 * its own. No individual health worker is listed.
 *
 * Labels are not stored here: they live in the i18n catalogs under `taxonomy.*`, keyed by
 * listing slug, like the other markets'. Listing slugs are Lithuanian, without diacritics, and
 * never collide with another market's (tested), so a listing slug always names one market.
 */

/** Hospitals: an address licensed for inpatient services (stacionarinės paslaugos). */
export const LT_HOSPITAL = "LT_HOSPITAL";
/** Primary care: an address licensed for family medicine (šeimos medicina). */
export const LT_PRIMARY_CARE = "LT_PRIMARY_CARE";
/** Outpatient specialist care: medical centres and clinics (ambulatorinės specializuotos). */
export const LT_SPECIALIST = "LT_SPECIALIST";
/** Dental and oral care (odontologinės ir burnos priežiūros paslaugos). */
export const LT_DENTAL = "LT_DENTAL";
/** Mental health centres and practices (psichikos sveikatos priežiūra, medicinos psichologija). */
export const LT_MENTAL_HEALTH = "LT_MENTAL_HEALTH";
/** Rehabilitation, physiotherapy, occupational therapy and therapeutic massage. */
export const LT_REHABILITATION = "LT_REHABILITATION";
/** Nursing, home nursing and midwifery practices (slaugos ir akušerio praktika). */
export const LT_NURSING = "LT_NURSING";
/** Medical laboratories (laboratorinė diagnostika). */
export const LT_LABORATORY = "LT_LABORATORY";
/** Optometrists' practices (optometrininko praktika). */
export const LT_OPTOMETRY = "LT_OPTOMETRY";

/** Profession codes of the Lithuanian pages (kinds of institution) and their URL slugs. */
export const LT_PROFESSIONS: Readonly<Record<string, { slug: string; enabled: boolean }>> = {
	[LT_HOSPITAL]: { slug: "ligonines", enabled: true },
	[LT_PRIMARY_CARE]: { slug: "seimos-medicina", enabled: true },
	[LT_SPECIALIST]: { slug: "medicinos-centrai", enabled: true },
	[LT_DENTAL]: { slug: "odontologijos-klinikos", enabled: true },
	[LT_MENTAL_HEALTH]: { slug: "psichikos-sveikatos-centrai", enabled: true },
	[LT_REHABILITATION]: { slug: "reabilitacija", enabled: true },
	[LT_NURSING]: { slug: "slauga", enabled: true },
	[LT_LABORATORY]: { slug: "laboratorijos", enabled: true },
	[LT_OPTOMETRY]: { slug: "optometrijos-kabinetai", enabled: true },
};

export const LT_DEFAULT_PROFESSIONS = Object.keys(LT_PROFESSIONS);

/**
 * One licensed service of an address, as `PaslauguNustatymas` sets it: its mode (`paslaugos_budas`:
 * `1` outpatient, `2` inpatient, `3` a professional practice, `0` other, public health among
 * them), group (`paslaugos_grupes_id`: `1` medical, `2` dental, `3` oral care, `5` nursing),
 * level (`paslaugos_lygio_id`: `0` none, `1` primary, `2` secondary, `3` tertiary), type
 * (`paslaugos_tipo_id`, `4` for nursing practices) and name (`Paslauga.pavadinimas`).
 */
export type LtService = {
	mode: string;
	group: string;
	level: string;
	type: string;
	name: string;
};

const lower = (text: string) => text.toLocaleLowerCase("lt");

/** Services that name a laboratory, a pathology laboratory or a tissue bank's laboratory work. */
const isLaboratory = (name: string) => /^laboratorin|^patologija \(/.test(lower(name));

/** Services of the mental health field. */
const isMentalHealth = (name: string) =>
	/psichi|psichoterap|medicinos psichologo/.test(lower(name));

/** Services of rehabilitation, physiotherapy, occupational therapy and massage. */
const isRehabilitation = (name: string) =>
	/reabilitac|kineziterap|ergoterap|masažas|logopedij/.test(lower(name));

/** Services of nursing and midwifery practices. */
const isNursing = (name: string) => /slaug|akušerio praktika|paliatyv/.test(lower(name));

/**
 * The kind of a Lithuanian activity address from the services licensed there, the most
 * specific first: inpatient services make a hospital; family medicine a primary care centre;
 * outpatient medical services at the secondary or tertiary level a medical centre; dental and
 * oral care a dental clinic; then mental health, other medical services (imaging, day surgery,
 * dietetics), laboratories, nursing and midwifery, rehabilitation and optometry. Null for an
 * address that patients do not visit for care: public health services alone (hygiene training,
 * pest control), an ambulance service, a pharmacist's extended practice (pharmacies are licensed
 * by another authority, whose list is not open), a tissue bank or a biobank.
 */
export function ltKindOfServices(services: readonly LtService[]): string | null {
	if (services.length === 0) return null;
	const names = services.map((service) => service.name);
	if (services.some((service) => service.mode === "2")) return LT_HOSPITAL;
	if (names.some((name) => lower(name) === "šeimos medicina")) return LT_PRIMARY_CARE;
	if (
		services.some(
			(service) =>
				service.mode === "1" &&
				service.group === "1" &&
				(service.level === "2" || service.level === "3"),
		)
	) {
		return LT_SPECIALIST;
	}
	if (services.some((service) => service.group === "2" || service.group === "3")) return LT_DENTAL;
	if (names.some(isMentalHealth)) return LT_MENTAL_HEALTH;
	if (services.some((service) => service.group === "1")) return LT_SPECIALIST;
	if (names.some(isLaboratory)) return LT_LABORATORY;
	if (
		services.some((service) => service.mode === "3" && service.type === "4") ||
		names.some(isNursing)
	) {
		return LT_NURSING;
	}
	if (names.some(isRehabilitation)) return LT_REHABILITATION;
	if (names.some((name) => lower(name).startsWith("optometrinink"))) return LT_OPTOMETRY;
	if (
		names.some((name) => /^dienos (chirurgija|stacionaras)|^dietist|^anestezija/.test(lower(name)))
	) {
		return LT_SPECIALIST;
	}
	return null;
}

/** Listing slug of a Lithuanian page: its kind's (`odontologijos-klinikos`). */
export function ltListingSlugFor(
	professionCode: string,
	_specialtyCode?: string | null | undefined,
): string | null {
	return LT_PROFESSIONS[professionCode]?.slug ?? null;
}

const LT_LISTING_SLUGS: ReadonlySet<string> = new Set(
	Object.values(LT_PROFESSIONS).map((profession) => profession.slug),
);

/** Every Lithuanian listing slug. */
export function allLtListingSlugs(): Set<string> {
	return new Set(LT_LISTING_SLUGS);
}

/**
 * First URL segments of the Lithuanian pages that can never be a listing slug: the Lithuanian
 * route segments of the market (`/lt/istaiga/…`, `/lt/katalogas`) and the technical ones.
 */
export const LT_RESERVED_SEGMENTS = [
	"istaiga",
	"organizacija",
	"katalogas",
	"paieska",
	"pro",
	"rdv",
	"api",
	"apie",
	"open-source",
	"duomenys",
	"prieinamumas",
	"privatumas",
	"teisine-informacija",
	"naudojimo-salygos",
	"guides",
	"og",
	"sitemaps",
	"_ui",
] as const;

/** True when `slug` can be served as a Lithuanian listing page. */
export function isLtListingSlug(slug: string): boolean {
	return !(LT_RESERVED_SEGMENTS as readonly string[]).includes(slug) && LT_LISTING_SLUGS.has(slug);
}

/** The profession code of a Lithuanian listing slug (`ligonines` → `LT_HOSPITAL`). */
export function ltProfessionOfListingSlug(slug: string): string | undefined {
	return Object.entries(LT_PROFESSIONS).find(([, profession]) => profession.slug === slug)?.[0];
}
