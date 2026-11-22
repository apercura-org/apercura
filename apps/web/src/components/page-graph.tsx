import type { Thing } from "schema-dts";
import type { Href } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { CONTENT_LANGUAGES } from "~/lib/seo";
import { absoluteUrl, siteOrigin } from "~/lib/site-url";
import { breadcrumbNode, graph, type WebPageInput, webPageNode } from "~/lib/structured-data";
import { JsonLd } from "./json-ld";
import { type TrailItem, trailEntries } from "./trail";

/**
 * The structured data of a page without a domain entity (institutional
 * pages, the practitioners' page): its `WebPage` and the `BreadcrumbList` of
 * its trail, plus any extra entities.
 */
export async function PageGraph({
	locale,
	href,
	name,
	description,
	trail,
	type,
	extra = [],
}: {
	locale: Locale;
	href: Href;
	name: string;
	description?: string;
	/** The visible trail, without the home page; none when the page shows no trail. */
	trail?: TrailItem[];
	type?: WebPageInput["type"];
	extra?: Thing[];
}) {
	const url = absoluteUrl(href, locale);
	return (
		<JsonLd
			data={graph([
				webPageNode({
					url,
					origin: siteOrigin(),
					name,
					description,
					language: CONTENT_LANGUAGES[locale],
					type,
					hasBreadcrumb: trail !== undefined,
				}),
				...(trail ? [breadcrumbNode(url, await trailEntries(locale, trail))] : []),
				...extra,
			])}
		/>
	);
}
