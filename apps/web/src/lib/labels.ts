import {
	cyKindSlugOf,
	cyProfessionOfListingSlug,
	deKindSlugOf,
	deProfessionOfListingSlug,
	ES_PROFESSIONS,
	eeKindSlugOf,
	eeProfessionOfListingSlug,
	esKindSlugOf,
	fiKindSlugOf,
	fiProfessionOfListingSlug,
	isChListingSlug,
	isCyListingSlug,
	isCzListingSlug,
	isDeListingSlug,
	isEeListingSlug,
	isEsListingSlug,
	isFiListingSlug,
	isGbListingSlug,
	isIeListingSlug,
	isItListingSlug,
	isNoListingSlug,
	isSiListingSlug,
	noKindSlugOf,
	noProfessionOfListingSlug,
} from "@apercura/core/taxonomy";
import { getTranslations } from "next-intl/server";
import { capitalisesNouns } from "~/i18n/locales";
import type { Locale } from "~/i18n/routing";
import type { PractitionerLink } from "~/server/queries/types";

export type Gender = "female" | "male" | "other";

/** Grammatical gender of the profession label, from the registry civility. */
export function genderOf(civilityCode: string | null | undefined): Gender {
	if (civilityCode === "MME") return "female";
	if (civilityCode === "M") return "male";
	return "other";
}

/**
 * Labels of the taxonomy codes stored in the database (listing slugs, titles,
 * sectors, roles…). Codes come from data, so a missing label returns null
 * instead of throwing.
 */
export async function getTaxonomyLabels(locale: Locale) {
	const t = await getTranslations({ locale, namespace: "taxonomy" });
	const lookup = (key: string, values?: Record<string, string>): string | null =>
		// Dynamic keys: the codes come from the database, not from the catalog type.
		t.has(key as never) ? t(key as never, values as never) : null;

	return {
		listing: (slug: string | null | undefined, gender: Gender = "other") =>
			slug ? lookup(`listing.${slug}`, { gender }) : null,
		/**
		 * What one practitioner is, from their listing: the listing's label ("Cardiologist"), but a
		 * UK practice's kind, a Czech facility's field, a Spanish centre's kind or specialty, an
		 * Italian place's, a Swiss or an Irish facility's kind in the singular ("GP practice", "Kardiolog",
		 * "Consulta de cardiología", "Farmacia", "Spital"), their listing being plural ("GP
		 * practices", "Kardiologové", "Cardiólogos", "Farmacie", "Spitäler"). With its profession code, a Spanish centre listed under its kind's listing
		 * reads as its own kind (a local surgery listed with the health centres reads "Consultorio
		 * local"). A German facility, an Estonian provider, a Norwegian establishment , a Finnish service
		 * location or a Cypriot facility reads as its kind ("Krankenhaus", "Apotheke", "Perearstikeskus", "Legekontor", "Terveysasema", "Φαρμακείο"), its listing being plural.
		 * A Slovenian doctor reads as their field ("Družinska medicina"): the list gives no gender
		 * to choose between "družinski zdravnik" and "družinska zdravnica".
		 */
		occupation: (
			slug: string | null | undefined,
			gender: Gender = "other",
			professionCode?: string | null,
		) => {
			if (!slug) return null;
			if (
				isDeListingSlug(slug) ||
				isEeListingSlug(slug) ||
				isNoListingSlug(slug) ||
				isFiListingSlug(slug) ||
				isCyListingSlug(slug)
			) {
				const kind = isDeListingSlug(slug)
					? deKindSlugOf(professionCode ?? deProfessionOfListingSlug(slug))
					: isEeListingSlug(slug)
						? eeKindSlugOf(professionCode ?? eeProfessionOfListingSlug(slug))
						: isNoListingSlug(slug)
							? noKindSlugOf(professionCode ?? noProfessionOfListingSlug(slug))
							: isFiListingSlug(slug)
								? fiKindSlugOf(professionCode ?? fiProfessionOfListingSlug(slug))
								: cyKindSlugOf(professionCode ?? cyProfessionOfListingSlug(slug));
				return (
					(kind ? lookup(`profession.${kind}`) : null) ??
					lookup(`profession.${slug}`) ??
					lookup(`listing.${slug}`, { gender })
				);
			}
			if (isEsListingSlug(slug)) {
				const kind =
					professionCode && ES_PROFESSIONS[professionCode]?.slug === slug
						? esKindSlugOf(professionCode)
						: null;
				return (
					(kind ? lookup(`profession.${kind}`) : null) ??
					lookup(`profession.${slug}`) ??
					lookup(`listing.${slug}`, { gender })
				);
			}
			return (
				(isGbListingSlug(slug) ||
				isCzListingSlug(slug) ||
				isItListingSlug(slug) ||
				isChListingSlug(slug) ||
				isIeListingSlug(slug) ||
				isSiListingSlug(slug)
					? lookup(`profession.${slug}`)
					: null) ?? lookup(`listing.${slug}`, { gender })
			);
		},
		profession: (slug: string, gender: Gender = "other") =>
			lookup(`profession.${slug}`, { gender }),
		title: (code: string | null | undefined) => (code ? lookup(`title.${code}`) : null),
		practiceKind: (kind: string) => lookup(`practiceKind.${kind}`),
		mode: (code: string | null | undefined) => (code ? lookup(`mode.${code}`) : null),
		role: (code: string | null | undefined) => (code ? lookup(`role.${code}`) : null),
		/**
		 * Agreement with the Assurance Maladie: a sector for physicians ("Sector 1"),
		 * contracted or not for the other professions (`sectors: false`), which
		 * have no sector. Codes that only exist as sectors keep the sector label.
		 */
		billingSector: (code: string | null | undefined, sectors = true) =>
			code
				? ((sectors ? null : lookup(`billingAgreement.${code}`)) ?? lookup(`billingSector.${code}`))
				: null,
		optam: (code: string | null | undefined) => (code ? lookup(`optam.${code}`) : null),
		/** "Dr Marie Dubois": exercise title (when any), first name, last name. */
		personName: (person: Pick<PractitionerLink, "titleCode" | "firstName" | "lastName">) => {
			const title = person.titleCode ? lookup(`title.${person.titleCode}`) : null;
			return [title, person.firstName, person.lastName].filter(Boolean).join(" ");
		},
	};
}

export type TaxonomyLabels = Awaited<ReturnType<typeof getTaxonomyLabels>>;

/**
 * A profession or specialty label as written inside a sentence of `locale`:
 * German keeps the capital of its nouns ("Kardiologin"); French, Spanish,
 * Italian and English lowercase the first letter ("cardiologue",
 * "cardiologist"). Acronyms keep their capitals ("ORL", "ENT specialist").
 */
export function inSentence(label: string, locale: Locale): string {
	if (capitalisesNouns(locale)) return label;
	const [first = "", second = ""] = label;
	return second && second === second.toLocaleLowerCase(locale)
		? first.toLocaleLowerCase(locale) + label.slice(first.length)
		: label;
}
