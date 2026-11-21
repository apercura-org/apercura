import { Breadcrumb, Breadcrumbs } from "@apercura/ui";
import { getTranslations } from "next-intl/server";
import { getPathname, type Href } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { siteOrigin } from "~/lib/site-url";
import { JsonLd } from "./json-ld";

export type TrailItem = { label: string; href: Href };

/**
 * The breadcrumb trail (Home › Specialty › Department › Commune › Page), with
 * its BreadcrumbList structured data. The last item is the current page.
 */
export async function Trail({ locale, items }: { locale: Locale; items: TrailItem[] }) {
	const t = await getTranslations({ locale, namespace: "Site" });
	const all: TrailItem[] = [{ label: t("home"), href: "/" }, ...items];
	const paths = all.map((item) => getPathname({ href: item.href, locale }));
	return (
		<>
			<Breadcrumbs label={t("breadcrumbs")}>
				{all.map((item, index) => (
					<Breadcrumb key={paths[index]} href={paths[index]}>
						{item.label}
					</Breadcrumb>
				))}
			</Breadcrumbs>
			<JsonLd
				data={{
					"@context": "https://schema.org",
					"@type": "BreadcrumbList",
					itemListElement: all.map((item, index) => ({
						"@type": "ListItem",
						position: index + 1,
						name: item.label,
						item: `${siteOrigin()}${paths[index]}`,
					})),
				}}
			/>
		</>
	);
}
