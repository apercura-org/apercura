import type { Fees } from "@apercura/core";
import type { PractitionerPayload } from "~/server/queries/types";

export type Accessibility = {
	stepFree: boolean | null;
	lift: boolean | null;
	parking: boolean | null;
	notes: string | null;
};

/**
 * What a page prints beyond the registry facts: the owner's content when the
 * page is claimed and published, the Ameli facts otherwise. The owner's
 * statement of sector, OPTAM and Carte Vitale takes precedence over Ameli's.
 */
export type OwnerContent = {
	photoUrl: string | null;
	headline: string | null;
	bio: string | null;
	languages: string[];
	website: string | null;
	accessibility: Accessibility | null;
	billing: {
		sector: string | null;
		optam: string | null;
		carteVitale: boolean | null;
		source: "owner" | "ameli" | null;
	};
	fees: Fees | null;
	paymentMethods: string[];
	showPhone: boolean;
};

export function ownerContentOf(
	payload: Pick<PractitionerPayload, "ameli" | "profile">,
	photoUrl: (key: string) => string,
): OwnerContent {
	const profile = payload.profile;
	const ameli = payload.ameli;
	const ownerStated =
		profile !== null &&
		(profile.billingSector !== null || profile.optam !== null || profile.carteVitale !== null);
	return {
		photoUrl: profile?.photoKey ? photoUrl(profile.photoKey) : null,
		headline: profile?.headline ?? null,
		bio: profile?.bio ?? null,
		languages: profile?.languages ?? [],
		website: profile?.website ?? null,
		accessibility: profile?.accessibility ?? null,
		billing: ownerStated
			? {
					sector: profile.billingSector,
					optam: profile.optam,
					carteVitale: profile.carteVitale ?? null,
					source: "owner",
				}
			: ameli
				? {
						sector: ameli.billingSector,
						optam: ameli.optam,
						carteVitale: ameli.carteVitale,
						source: "ameli",
					}
				: { sector: null, optam: null, carteVitale: null, source: null },
		fees: profile?.fees ?? null,
		paymentMethods: profile?.paymentMethods ?? [],
		showPhone: profile?.showPhone ?? true,
	};
}
