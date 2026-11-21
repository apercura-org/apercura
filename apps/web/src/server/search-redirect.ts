import { isValidRpps, type SearchQuery } from "@apercura/core";
import type { Href } from "~/i18n/navigation";
import { resolveListing } from "~/lib/listing-index";
import {
	landingTarget,
	listingHubExists,
	matchPlaces,
	practitionerSlugByRpps,
} from "./queries/search";

/**
 * The page a search query names, if any: an RPPS number goes to its
 * practitioner page, a specialty in one place to its listing page, a specialty
 * alone to its hub. Applied by the proxy (a real 307 before anything renders)
 * and again by the page for client-side navigations.
 */
export async function searchRedirect(query: SearchQuery, page: number): Promise<Href | null> {
	if (query.rpps) {
		const slug = isValidRpps(query.rpps) ? await practitionerSlugByRpps(query.rpps) : null;
		return slug ? { pathname: "/praticien/[slug]", params: { slug } } : null;
	}
	const listingSlug = query.who ? resolveListing(query.who) : null;
	if (!listingSlug || page !== 1 || query.near) return null;
	const wantsPlace = Boolean(query.where || query.postcode);
	if (!wantsPlace) {
		return (await listingHubExists(listingSlug))
			? { pathname: "/[specialite]", params: { specialite: listingSlug } }
			: null;
	}
	const places = await matchPlaces({
		where: query.where,
		...(query.postcode ? { postcode: query.postcode } : {}),
		...(query.departmentHint ? { departmentHint: query.departmentHint } : {}),
	});
	const place = places.length === 1 ? places[0] : undefined;
	if (!place) return null;
	const target = await landingTarget(listingSlug, place);
	if (!target) return null;
	return {
		pathname: "/[specialite]/[dept]/[[...rest]]",
		params: {
			specialite: target.listingSlug,
			dept: target.deptSlug,
			rest: target.communeSlug ? [target.communeSlug] : undefined,
		},
	};
}
