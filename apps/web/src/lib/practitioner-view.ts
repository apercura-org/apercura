import { formatPhoneFr, formatStreetText, publicActivities } from "@apercura/core";
import type { ActivityPayload, PractitionerPayload, SitePayload } from "~/server/queries/types";

export type SiteView = {
	activityId: number;
	practiceKind: string;
	modeCode: string | null;
	roleCode: string | null;
	isPrimary: boolean;
	site: SitePayload;
	/** Name printed on the card: the registry name, else the establishment's. */
	name: string | null;
	addressLines: string[];
	/** Only when the place is located at the address or the street, never a commune centroid. */
	coordinates: { lat: number; lon: number } | null;
	phone: { e164: string; display: string; switchboard: boolean } | null;
	establishment: { name: string; slug: string } | null;
};

/**
 * A registry label as printed: acronyms in capitals, elided apostrophes
 * restored. Idempotent, so labels stored by earlier imports read the same.
 */
export function label(value: string | null | undefined): string | null {
	return value ? formatStreetText(value) || null : null;
}

/** Address lines of a site, street first. */
export function addressLines(
	site: Pick<SitePayload, "addressLine" | "addressComplement" | "postcode" | "placeName">,
): string[] {
	const town = [site.postcode, site.placeName].filter(Boolean).join(" ");
	return [label(site.addressLine), label(site.addressComplement), town].filter(
		(line): line is string => Boolean(line?.trim()),
	);
}

function toView(activity: ActivityPayload & { site: SitePayload }): SiteView {
	const { site } = activity;
	const precise = site.geoPrecision === "address" || site.geoPrecision === "street";
	return {
		activityId: activity.id,
		practiceKind: activity.practiceKind,
		modeCode: activity.modeCode,
		roleCode: activity.roleCode,
		isPrimary: activity.isPrimary,
		site,
		name: label(site.name ?? site.establishmentName),
		addressLines: addressLines(site),
		coordinates:
			precise && site.latitude !== null && site.longitude !== null
				? { lat: Number(site.latitude), lon: Number(site.longitude) }
				: null,
		phone: site.phone
			? {
					e164: site.phone,
					display: formatPhoneFr(site.phone),
					switchboard: site.phoneKind === "switchboard",
				}
			: null,
		establishment:
			site.establishmentSlug && (site.establishmentName ?? site.name)
				? { name: label(site.establishmentName ?? site.name) ?? "", slug: site.establishmentSlug }
				: null,
	};
}

/**
 * The places shown on a practitioner page: public activities at a place, one
 * card per place, primary activity first (the read model already orders them).
 */
export function siteViews(payload: PractitionerPayload): SiteView[] {
	const withSite = payload.activities.map((activity) => ({
		...activity,
		hasSite: activity.site !== null,
	}));
	const seen = new Set<number>();
	const views: SiteView[] = [];
	for (const activity of publicActivities(withSite)) {
		if (!activity.site || seen.has(activity.site.id)) continue;
		seen.add(activity.site.id);
		views.push(toView({ ...activity, site: activity.site }));
	}
	return views;
}

export type ActionPlan =
	| { kind: "call"; site: SiteView; phone: NonNullable<SiteView["phone"]> }
	| { kind: "establishment"; site: SiteView; establishment: NonNullable<SiteView["establishment"]> }
	| { kind: "locum"; site: SiteView }
	| { kind: "no_phone"; site: SiteView };

/**
 * What a patient can do next without online booking, from the first place
 * shown: practices are called, hospital practitioners are reached through
 * their establishment. An open agenda (read model `booking`) takes precedence
 * on the page and keeps the call as a second way.
 */
export function actionPlan(sites: SiteView[]): ActionPlan | null {
	const site = sites[0];
	if (!site) return null;
	if (site.practiceKind === "locum") return { kind: "locum", site };
	if (site.practiceKind === "hospital" && site.establishment) {
		return { kind: "establishment", site, establishment: site.establishment };
	}
	if (site.phone) return { kind: "call", site, phone: site.phone };
	return { kind: "no_phone", site };
}
