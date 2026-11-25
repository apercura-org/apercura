import { formatPhoneAt, formatPhoneFr, formatStreetText, publicActivities } from "@apercura/core";
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

/** A phone number of any market as written there (`04 72 00 00 00`, `01 7673315`). */
export function formatPhone(e164: string): string {
	return e164.startsWith("+43") ? formatPhoneAt(e164) : formatPhoneFr(e164);
}

/**
 * A source text as printed for a market. French registry labels are restored
 * (`label`); Austrian lists publish their streets as written, so they are only trimmed
 * (`63A` stays `63A`).
 */
export function marketLabel(value: string | null | undefined, country = "FR"): string | null {
	if (country !== "AT") return label(value);
	return value?.trim() || null;
}

/**
 * The town line of an address: postcode and place. A Vienna district prints as the city,
 * the way Austrian addresses are written (`1090 Wien`, the postcode names the district).
 */
function townLine(postcode: string | null, placeName: string | null, country: string): string {
	return [postcode, localityOf(placeName, country)].filter(Boolean).join(" ");
}

/** The locality of an address as written in its market: a Vienna district is `Wien`. */
export function localityOf(placeName: string | null, country = "FR"): string | null {
	return country === "AT" && placeName?.startsWith("Wien-") ? "Wien" : placeName;
}

/** Address lines of a site, street first, in the market's form. */
export function addressLines(
	site: Pick<SitePayload, "addressLine" | "addressComplement" | "postcode" | "placeName">,
	country = "FR",
): string[] {
	const town = townLine(site.postcode, site.placeName, country);
	return [
		marketLabel(site.addressLine, country),
		marketLabel(site.addressComplement, country),
		town,
	].filter((line): line is string => Boolean(line?.trim()));
}

function toView(activity: ActivityPayload & { site: SitePayload }, country: string): SiteView {
	const { site } = activity;
	const precise = site.geoPrecision === "address" || site.geoPrecision === "street";
	return {
		activityId: activity.id,
		practiceKind: activity.practiceKind,
		modeCode: activity.modeCode,
		roleCode: activity.roleCode,
		isPrimary: activity.isPrimary,
		site,
		name: marketLabel(site.name ?? site.establishmentName, country),
		addressLines: addressLines(site, country),
		coordinates:
			precise && site.latitude !== null && site.longitude !== null
				? { lat: Number(site.latitude), lon: Number(site.longitude) }
				: null,
		phone: site.phone
			? {
					e164: site.phone,
					display: formatPhone(site.phone),
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
		views.push(toView({ ...activity, site: activity.site }, payload.country));
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
