import {
	formatPhoneAt,
	formatPhoneCh,
	formatPhoneCz,
	formatPhoneDe,
	formatPhoneEe,
	formatPhoneEs,
	formatPhoneFi,
	formatPhoneFr,
	formatPhoneGb,
	formatPhoneIe,
	formatPhoneIt,
	formatPhoneNo,
	formatPhonePl,
	formatStreetText,
	publicActivities,
} from "@apercura/core";
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

/**
 * A phone number of any market as written there (`04 72 00 00 00`, `01 7673315`,
 * `020 7946 0000`, `326 357 125`, `910 000 001`, `06 12345678`, `030 45050`, `044 268 31 11`, `22 12 34 56`, `01 846 2115`).
 */
export function formatPhone(e164: string): string {
	if (e164.startsWith("+41")) return formatPhoneCh(e164);
	if (e164.startsWith("+372")) return formatPhoneEe(e164);
	if (e164.startsWith("+47")) return formatPhoneNo(e164);
	if (e164.startsWith("+43")) return formatPhoneAt(e164);
	if (e164.startsWith("+44")) return formatPhoneGb(e164);
	if (e164.startsWith("+353")) return formatPhoneIe(e164);
	if (e164.startsWith("+420")) return formatPhoneCz(e164);
	if (e164.startsWith("+34")) return formatPhoneEs(e164);
	if (e164.startsWith("+39")) return formatPhoneIt(e164);
	if (e164.startsWith("+49")) return formatPhoneDe(e164);
	if (e164.startsWith("+48")) return formatPhonePl(e164);
	if (e164.startsWith("+358")) return formatPhoneFi(e164);
	return formatPhoneFr(e164);
}

/**
 * A source text as printed for a market. French registry labels are restored
 * (`label`); Austrian, Czech and German lists publish their streets as written, and the UK's,
 * Spain's, Italy's and Switzerland's are cased by their imports, so they are only trimmed (`63A` stays `63A`).
 */
export function marketLabel(value: string | null | undefined, country = "FR"): string | null {
	if (country === "FR") return label(value);
	return value?.trim() || null;
}

/**
 * The town line of an address: postcode and place. A Vienna district prints as the city,
 * the way Austrian addresses are written (`1090 Wien`, the postcode names the district).
 */
function townLine(postcode: string | null, placeName: string | null, country: string): string {
	return [postcode, localityOf(placeName, country)].filter(Boolean).join(" ");
}

/** Markets whose addresses write the town before the postcode: the UK and Ireland (Eircode). */
const TOWN_FIRST: ReadonlySet<string> = new Set(["GB", "IE"]);

/**
 * The town part of a one-line address on a card: `69001 Lyon`, `1090 Wien`, `120 00 Praha 2`,
 * and in the UK and Ireland the
 * town before its postcode (`Stockton-on-Tees TS18 1ZA`, `Cork T12 X70A`).
 */
export function cardTownLine(
	postcode: string | null,
	placeName: string | null,
	country = "FR",
): string {
	const locality = localityOf(placeName, country);
	return (TOWN_FIRST.has(country) ? [locality, postcode] : [postcode, locality])
		.filter(Boolean)
		.join(" ");
}

/** The locality of an address as written in its market: a Vienna district is `Wien`. */
export function localityOf(placeName: string | null, country = "FR"): string | null {
	return country === "AT" && placeName?.startsWith("Wien-") ? "Wien" : placeName;
}

/**
 * Address lines of a site, street first, in the market's form: the town and the postcode on
 * lines of their own in the UK (Royal Mail) and Ireland (An Post: the Eircode last), together
 * elsewhere (`69001 Lyon`, `1090 Wien`).
 */
export function addressLines(
	site: Pick<SitePayload, "addressLine" | "addressComplement" | "postcode" | "placeName">,
	country = "FR",
): string[] {
	if (TOWN_FIRST.has(country)) {
		return [
			marketLabel(site.addressLine, country),
			marketLabel(site.addressComplement, country),
			site.placeName,
			site.postcode,
		].filter((line): line is string => Boolean(line?.trim()));
	}
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
