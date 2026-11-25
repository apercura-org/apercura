import "server-only";
import { formatPersonName } from "@apercura/core";
import { professionFor } from "@apercura/core/taxonomy";
import type { Locale } from "~/i18n/routing";
import { genderOf, getTaxonomyLabels } from "~/lib/labels";
import { caller } from "~/trpc/server";
import { getProContext } from "./pro-context";

/**
 * The page the signed-in person edits: the first page their practices own
 * (one per practitioner in v1), its editor data and its printed identity.
 * Null when they have none yet.
 */
export async function ownedPage(userId: string, locale: Locale) {
	const context = await getProContext(userId);
	const page = context.pages[0];
	if (!page) return null;
	const data = await caller.profile.get({ organizationId: page.organizationId });
	const labels = await getTaxonomyLabels(locale);
	const person = data.practitioner;
	const gender = genderOf(person.civilityCode);
	const profession =
		labels.occupation(person.listingSlug, gender) ??
		labels.profession(professionFor(person.professionCode)?.slug ?? "medecin", gender) ??
		"";
	return {
		organizationId: page.organizationId,
		isOwner: page.role.split(",").some((role) => role.trim() === "owner"),
		data,
		identity: {
			name: labels.personName({
				titleCode: person.titleCode,
				firstName: person.firstName,
				lastName: formatPersonName(person.lastName, { familyName: true }),
			}),
			profession,
			rpps: person.nationalId,
		},
	};
}
