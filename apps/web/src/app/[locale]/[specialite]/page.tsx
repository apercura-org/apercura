import { landingRoute } from "@apercura/core";
import { isListingSlug } from "@apercura/core/taxonomy";
import { linkStyles } from "@apercura/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookletPage } from "~/components/booklet-page";
import { JsonLd } from "~/components/json-ld";
import { CountLinks, ListingFacts, ListingSection, ListingTitle } from "~/components/listing";
import { PublicPage } from "~/components/public-page";
import { Trail, type TrailItem, trailEntries } from "~/components/trail";
import { getPathname, type Href, Link } from "~/i18n/navigation";
import { type Locale, routing } from "~/i18n/routing";
import { getTaxonomyLabels, inSentence } from "~/lib/labels";
import { placeLabel } from "~/lib/places";
import { CONTENT_LANGUAGES, DESCRIPTION_MAX, fitText, pageMetadata, pickTitle } from "~/lib/seo";
import { absoluteUrl, siteOrigin } from "~/lib/site-url";
import { breadcrumbNode, graph, ids, itemListNode, webPageNode } from "~/lib/structured-data";
import { databaseAvailable } from "~/server/db";
import { getLandingPage, sampleListingSlugs } from "~/server/queries/landing";

export const ensureStatic = "navigation";
/**
 * The response status (404, 308) is decided from the URL before anything
 * renders, so the page blocks on its params by design instead of streaming a
 * shell: a late notFound() inside Suspense would answer 200.
 */
export const instant = false;

export async function generateStaticParams() {
	const slugs = (await databaseAvailable()) ? await sampleListingSlugs(5) : [];
	// "exemple" is not a listing slug: it answers 404 without touching the database.
	return (slugs.length > 0 ? slugs : ["exemple"]).map((specialite) => ({ specialite }));
}

type Props = PageProps<"/[locale]/[specialite]">;

/** Specialty hub (`/cardiologue`): France-wide facts and the departments where it is listed. */
async function resolve(params: Props["params"]) {
	const { locale: requested, specialite } = await params;
	const locale: Locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
	// Reserved first segments (praticien, annuaire, pro…) are never listings.
	if (!isListingSlug(specialite)) notFound();
	const data = await getLandingPage({
		listingSlug: specialite,
		place: null,
		isCity: false,
		page: 1,
	});
	const decision = landingRoute(data?.landing ?? null);
	if (decision.kind !== "page" || !data) notFound();
	return {
		locale,
		listingSlug: specialite,
		data,
		indexable: decision.indexable,
		href: { pathname: "/[specialite]", params: { specialite } } as const,
	};
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { locale, listingSlug, data, indexable, href } = await resolve(params);
	const t = await getTranslations({ locale, namespace: "Listing" });
	const labels = await getTaxonomyLabels(locale);
	const listing = labels.listing(listingSlug) ?? listingSlug;
	const count = data.landing.practitionerCount;
	const values = { listing, count, occupation: inSentence(listing, locale) };
	return pageMetadata({
		locale,
		href,
		title: pickTitle([t("hubMetaTitle", values), t("hubMetaTitleShort", values)]),
		description: fitText([t("hubMetaDescription", values)], DESCRIPTION_MAX),
		indexable,
	});
}

export default async function SpecialtyHub({ params }: Props) {
	const { locale, listingSlug, data, href } = await resolve(params);
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "Listing" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const labels = await getTaxonomyLabels(locale);
	const listing = labels.listing(listingSlug) ?? listingSlug;
	const count = data.landing.practitionerCount;
	const title = t("hubTitle", { listing });
	const trail: TrailItem[] = [{ label: listing, href }];
	const url = absoluteUrl(href, locale);
	const origin = siteOrigin();
	const departmentHref = (dept: string): Href => ({
		pathname: "/[specialite]/[dept]/[[...rest]]",
		params: { specialite: listingSlug, dept, rest: undefined },
	});

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
						dateModified: data.landing.updatedAt,
					}),
					breadcrumbNode(url, await trailEntries(locale, trail)),
					itemListNode({
						url,
						name: t("departmentsHeading", { listing }),
						items: data.nearby.map((department) => ({
							name: placeLabel(department),
							url: `${origin}${getPathname({ href: departmentHref(department.slug), locale })}`,
						})),
					}),
				])}
			/>
			<BookletPage runningHead={tSite("runningHead")}>
				<div className="flex flex-col gap-6">
					<Trail locale={locale} items={trail} />
					<ListingTitle title={title} lead={t("hubLead", { count, listing })} />
				</div>

				<ListingSection
					id="departments-heading"
					title={t("departmentsHeading", { listing })}
					intro={t("departmentsIntro")}
				>
					<CountLinks
						locale={locale}
						items={data.nearby.map((department) => ({
							key: department.id,
							label: placeLabel(department),
							href: {
								pathname: "/[specialite]/[dept]/[[...rest]]",
								params: { specialite: listingSlug, dept: department.slug, rest: undefined },
							},
							count: department.practitionerCount,
						}))}
					/>
				</ListingSection>

				<ListingFacts
					locale={locale}
					payload={data.landing.payload}
					updatedAt={data.landing.updatedAt}
				/>

				<p className="text-body text-ink">
					<Link href="/annuaire" className={linkStyles()}>
						{t("browseDirectory")}
					</Link>
				</p>
			</BookletPage>
		</PublicPage>
	);
}
