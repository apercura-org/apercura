/**
 * Slovenian taxonomy: the four kinds of personal doctor (osebni zdravnik) of the health
 * insurer's daily lists (Zavod za zdravstveno zavarovanje Slovenije, "Poimenski seznami
 * zdravnikov, ki so lahko osebni zdravniki"), read from the ZZZS activity code (šifra ZZZS
 * dejavnosti) of each row, mapped to Slovenian listing slugs (docs/adr/0002-multi-country.md,
 * "Slovenia").
 *
 * A Slovenian page is a doctor, named by the insurer's list: a family doctor (splošna ambulanta),
 * a children's or school doctor (otroški in šolski dispanzer), a gynaecologist (dispanzer za
 * ženske) or a dentist (zobozdravstvo for adults, young people or students). The activity of each
 * practice is shown on the page; a doctor is listed under the kind of their main activity.
 *
 * Labels are not stored here: they live in the i18n catalogs under `taxonomy.*`, keyed by listing
 * slug, like the other markets'. Listing slugs are Slovenian, without diacritics, and never
 * collide with another market's (tested), so a listing slug always names one market.
 */

/** Family doctors of the general practices (splošna ambulanta, družinska medicina). */
export const SI_FAMILY_DOCTOR = "SI_FAMILY_DOCTOR";
/** Children's and school doctors (otroški in šolski dispanzer). */
export const SI_CHILDREN_DOCTOR = "SI_CHILDREN_DOCTOR";
/** Gynaecologists of the women's clinics (dispanzer za ženske). */
export const SI_GYNAECOLOGIST = "SI_GYNAECOLOGIST";
/** Dentists (zobozdravstvo za odrasle, mladino in študente). */
export const SI_DENTIST = "SI_DENTIST";

/** Profession codes of the Slovenian doctors and their URL slugs. */
export const SI_PROFESSIONS: Readonly<Record<string, { slug: string; enabled: boolean }>> = {
	[SI_FAMILY_DOCTOR]: { slug: "druzinski-zdravnik", enabled: true },
	[SI_CHILDREN_DOCTOR]: { slug: "otroski-zdravnik", enabled: true },
	[SI_GYNAECOLOGIST]: { slug: "ginekolog", enabled: true },
	[SI_DENTIST]: { slug: "zobozdravnik", enabled: true },
};

export const SI_DEFAULT_PROFESSIONS = Object.keys(SI_PROFESSIONS);

/**
 * The ZZZS activities of the lists (šifra ZZZS dejavnosti) and the kind of doctor each is. The
 * code is the row's specialty: it names the practice on the page (`taxonomy.siActivity.*`).
 */
export const SI_ACTIVITIES: Readonly<Record<string, string>> = {
	/** Splošna dejavnost – splošna ambulanta. */
	"302001": SI_FAMILY_DOCTOR,
	/** Ambulanta specializanta družinske medicine (a family-medicine trainee's practice). */
	"302068": SI_FAMILY_DOCTOR,
	/** Splošna ambulanta – dodatno 0,5 DMS (a practice with an extra half nurse). */
	"302070": SI_FAMILY_DOCTOR,
	/** Splošna dejavnost – otroški in šolski dispanzer. */
	"327009": SI_CHILDREN_DOCTOR,
	/** Splošna dejavnost – dispanzer za ženske. */
	"306007": SI_GYNAECOLOGIST,
	/** Zobozdravstvena dejavnost – zdravljenje odraslih. */
	"404101": SI_DENTIST,
	/** Zobozdravstvena dejavnost – zdravljenje mladine. */
	"404103": SI_DENTIST,
	/** Zobozdravstvena dejavnost – zdravljenje študentov. */
	"404105": SI_DENTIST,
};

/** The kind of doctor of a ZZZS activity code (`302001` → `SI_FAMILY_DOCTOR`), or null. */
export function siProfessionOfActivity(code: string | null | undefined): string | null {
	return (code && SI_ACTIVITIES[code.trim()]) || null;
}

/** Every ZZZS activity code the lists use, for the catalogs' labels. */
export function allSiActivityCodes(): string[] {
	return Object.keys(SI_ACTIVITIES);
}

/** Listing slug of a Slovenian doctor: the slug of their kind (activities share it). */
export function siListingSlugFor(
	professionCode: string,
	_specialtyCode?: string | null | undefined,
): string | null {
	return SI_PROFESSIONS[professionCode]?.slug ?? null;
}

/** Every Slovenian listing slug. */
export function allSiListingSlugs(): Set<string> {
	return new Set(Object.values(SI_PROFESSIONS).map((profession) => profession.slug));
}

const SI_LISTING_SLUGS: ReadonlySet<string> = allSiListingSlugs();

/**
 * First URL segments of the Slovenian pages that can never be a listing slug: the Slovenian
 * route segments of the app (`/si/zdravnik/…`, `/si/imenik`) and the technical ones.
 */
export const SI_RESERVED_SEGMENTS = [
	"zdravnik",
	"organizacija",
	"imenik",
	"iskanje",
	"pro",
	"rdv",
	"api",
	"o-projektu",
	"open-source",
	"podatki",
	"dostopnost",
	"varstvo-osebnih-podatkov",
	"pravno-obvestilo",
	"pogoji-uporabe",
	"guides",
	"og",
	"sitemaps",
	"_ui",
] as const;

/** True when `slug` can be served as a Slovenian listing page. */
export function isSiListingSlug(slug: string): boolean {
	return !(SI_RESERVED_SEGMENTS as readonly string[]).includes(slug) && SI_LISTING_SLUGS.has(slug);
}

/** The profession code whose listing a slug is (`zobozdravnik` → `SI_DENTIST`), if any. */
export function siProfessionOfListingSlug(slug: string): string | undefined {
	return Object.entries(SI_PROFESSIONS).find(([, profession]) => profession.slug === slug)?.[0];
}

/**
 * The kind of a doctor among the activities of their rows: the kind with the most rows, then the
 * order of `SI_PROFESSIONS`. Null when no row names a known activity.
 */
export function primarySiProfession(rows: readonly { activityCode: string }[]): string | null {
	const counts = new Map<string, number>();
	for (const row of rows) {
		const profession = siProfessionOfActivity(row.activityCode);
		if (profession) counts.set(profession, (counts.get(profession) ?? 0) + 1);
	}
	const order = Object.keys(SI_PROFESSIONS);
	return (
		[...counts.entries()].sort(
			([a, x], [b, y]) => y - x || order.indexOf(a) - order.indexOf(b),
		)[0]?.[0] ?? null
	);
}
