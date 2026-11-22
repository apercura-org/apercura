import { EmptyState } from "@apercura/ui";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookletPage } from "~/components/booklet-page";
import { JsonLd } from "~/components/json-ld";
import { CountLinks, ListingSection, ListingTitle } from "~/components/listing";
import { PublicPage } from "~/components/public-page";
import { Trail, type TrailItem, trailEntries } from "~/components/trail";
import { getPathname } from "~/i18n/navigation";
import { type Locale, routing } from "~/i18n/routing";
import { placeLabel } from "~/lib/places";
import { CONTENT_LANGUAGES, pageMetadata } from "~/lib/seo";
import { absoluteUrl, siteOrigin } from "~/lib/site-url";
import { breadcrumbNode, graph, ids, itemListNode, webPageNode } from "~/lib/structured-data";
import { getDirectoryIndex } from "~/server/queries/hubs";

export const ensureStatic = "navigation";

function localeOf(requested: string): Locale {
	return hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
}

export async function generateMetadata({
	params,
}: PageProps<"/[locale]/annuaire">): Promise<Metadata> {
	const locale = localeOf((await params).locale);
	const t = await getTranslations({ locale, namespace: "Directory" });
	const index = await getDirectoryIndex();
	return pageMetadata({
		locale,
		href: "/annuaire",
		title: t("metaTitle"),
		description: t("metaDescription"),
		indexable: index.regions.length > 0,
	});
}

/** The directory by place: every department with practitioners, grouped by region. */
export default async function DirectoryPage({ params }: PageProps<"/[locale]/annuaire">) {
	const locale = localeOf((await params).locale);
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "Directory" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const index = await getDirectoryIndex();
	const total = index.regions.reduce(
		(sum, region) =>
			sum +
			region.departments.reduce((inner, department) => inner + department.practitionerCount, 0),
		0,
	);

	const trail: TrailItem[] = [{ label: t("title"), href: "/annuaire" }];
	const url = absoluteUrl("/annuaire", locale);
	const origin = siteOrigin();

	return (
		<PublicPage locale={locale} href="/annuaire">
			<JsonLd
				data={graph([
					webPageNode({
						url,
						origin,
						name: t("title"),
						language: CONTENT_LANGUAGES[locale],
						type: "CollectionPage",
						hasBreadcrumb: true,
						mainEntity: ids.list(url),
					}),
					breadcrumbNode(url, await trailEntries(locale, trail)),
					itemListNode({
						url,
						name: t("title"),
						items: index.regions.flatMap((region) =>
							region.departments.map((department) => ({
								name: placeLabel(department),
								url: `${origin}${getPathname({
									href: { pathname: "/annuaire/[dept]", params: { dept: department.slug } },
									locale,
								})}`,
							})),
						),
					}),
				])}
			/>
			<BookletPage runningHead={tSite("runningHead")}>
				<div className="flex flex-col gap-6">
					<Trail locale={locale} items={trail} />
					<ListingTitle title={t("title")} lead={t("lead", { count: total })} />
				</div>
				{index.regions.length === 0 ? (
					<EmptyState title={t("emptyTitle")} description={t("emptyBody")} />
				) : (
					index.regions.map((region) => (
						<ListingSection
							key={region.code || "none"}
							id={`region-${region.code || "none"}`}
							title={region.name || t("otherRegion")}
						>
							<CountLinks
								locale={locale}
								items={region.departments.map((department) => ({
									key: department.id,
									label: placeLabel(department),
									href: { pathname: "/annuaire/[dept]", params: { dept: department.slug } },
									count: department.practitionerCount,
								}))}
							/>
						</ListingSection>
					))
				)}
			</BookletPage>
		</PublicPage>
	);
}
