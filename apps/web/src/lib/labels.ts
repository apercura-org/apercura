import { isGbListingSlug } from "@apercura/core/taxonomy";
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
		 * UK practice's kind in the singular ("GP practice"), its listing being plural ("GP
		 * practices").
		 */
		occupation: (slug: string | null | undefined, gender: Gender = "other") =>
			slug
				? ((isGbListingSlug(slug) ? lookup(`profession.${slug}`) : null) ??
					lookup(`listing.${slug}`, { gender }))
				: null,
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
