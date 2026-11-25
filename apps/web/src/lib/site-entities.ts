import type { Thing } from "schema-dts";
import { LINKS } from "./links";
import { BRAND } from "./seo";
import { siteOrigin } from "./site-url";
import { siteNodes } from "./structured-data";

/**
 * Apercura's `WebSite` and `Organization`, the same on both homes (`/` and `/fr`, and the
 * `noindex` homes of the other locales): the logo is the 512 px site icon, `sameAs` only real
 * profiles of Apercura (its public source repository).
 */
export function apercuraSiteNodes(): Thing[] {
	const origin = siteOrigin();
	return siteNodes({
		origin,
		name: BRAND,
		logo: `${origin}/icon/512`,
		sameAs: [LINKS.repository],
	});
}
