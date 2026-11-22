import { getTranslations } from "next-intl/server";
import { BookletPage } from "~/components/booklet-page";
import { JsonLd } from "~/components/json-ld";
import { CountLinks, ListingSection, ListingTitle } from "~/components/listing";
import { PublicPage } from "~/components/public-page";
import { Trail, type TrailItem, trailEntries } from "~/components/trail";
import { getPathname, type Href } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { getTaxonomyLabels } from "~/lib/labels";
import { placeLabel } from "~/lib/places";
import { CONTENT_LANGUAGES } from "~/lib/seo";
import { absoluteUrl, siteOrigin } from "~/lib/site-url";
import { breadcrumbNode, graph, ids, itemListNode, webPageNode } from "~/lib/structured-data";
import type { PlaceHub as PlaceHubData } from "~/server/queries/hubs";
import type { PlaceRef } from "~/server/queries/types";

/**
 * A place hub: the specialties listed in a department, commune or city, its
 * communes (or arrondissements) and its establishments.
 */
export async function PlaceHub({
	locale,
	href,
	trail,
	department,
	place,
	hub,
}: {
	locale: Locale;
	href: Href;
	trail: TrailItem[];
	department: PlaceRef;
	place: PlaceRef;
	hub: PlaceHubData;
}) {
	const t = await getTranslations({ locale, namespace: "Directory" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const labels = await getTaxonomyLabels(locale);
	const name = placeLabel(place);
	const isDepartment = place.kind === "department";
	const landing = (listingSlug: string): Href => ({
		pathname: "/[specialite]/[dept]/[[...rest]]",
		params: {
			specialite: listingSlug,
			dept: department.slug,
			rest: isDepartment ? undefined : [place.slug],
		},
	});
	const title = t("placeTitle", { place: name });
	const url = absoluteUrl(href, locale);
	const origin = siteOrigin();
	return (
		<PublicPage locale={locale} href={href}>
			<JsonLd
				data={graph([
					webPageNode({
						url,
						origin,
						name: title,
						language: CONTENT_LANGUAGES[locale],
						type: "CollectionPage",
						hasBreadcrumb: true,
						mainEntity: ids.list(url),
					}),
					breadcrumbNode(url, await trailEntries(locale, trail)),
					itemListNode({
						url,
						name: t("specialtiesHeading"),
						items: hub.listings.map((listing) => ({
							name: labels.listing(listing.listingSlug) ?? listing.listingSlug,
							url: `${origin}${getPathname({ href: landing(listing.listingSlug), locale })}`,
						})),
					}),
				])}
			/>
			<BookletPage runningHead={tSite("runningHead")}>
				<div className="flex flex-col gap-6">
					<Trail locale={locale} items={trail} />
					<ListingTitle title={title} lead={t("placeLead", { count: hub.total, place: name })} />
				</div>
				<ListingSection id="specialties-heading" title={t("specialtiesHeading")}>
					<CountLinks
						locale={locale}
						items={hub.listings.map((listing) => ({
							key: listing.listingSlug,
							label: labels.listing(listing.listingSlug) ?? listing.listingSlug,
							href: landing(listing.listingSlug),
							count: listing.practitionerCount,
						}))}
					/>
				</ListingSection>
				{hub.places.length > 0 ? (
					<ListingSection
						id="places-heading"
						title={
							isDepartment ? t("communesHeading", { place: name }) : t("arrondissementsHeading")
						}
					>
						<CountLinks
							locale={locale}
							items={hub.places.map((item) => ({
								key: item.id,
								label: placeLabel(item),
								href: {
									pathname: "/annuaire/[dept]/[commune]",
									params: { dept: department.slug, commune: item.slug },
								},
								count: item.practitionerCount,
							}))}
						/>
					</ListingSection>
				) : null}
				{hub.establishments.length > 0 ? (
					<ListingSection
						id="establishments-heading"
						title={t("establishmentsHeading", { place: name })}
					>
						<CountLinks
							locale={locale}
							items={hub.establishments.map((item) => ({
								key: item.slug,
								label: item.name,
								href: { pathname: "/etablissement/[slug]", params: { slug: item.slug } },
								count: item.practitionerCount,
							}))}
						/>
					</ListingSection>
				) : null}
			</BookletPage>
		</PublicPage>
	);
}
