import { landingRoute } from "@apercura/core";
import { linkStyles } from "@apercura/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookletPage } from "~/components/booklet-page";
import { RelatedGuides } from "~/components/guides";
import { JsonLd } from "~/components/json-ld";
import { CountLinks, ListingFacts, ListingSection, ListingTitle } from "~/components/listing";
import { PublicPage } from "~/components/public-page";
import { Trail, type TrailItem, trailEntries } from "~/components/trail";
import { marketOf } from "~/i18n/locales";
import { getPathname, type Href, Link } from "~/i18n/navigation";
import { type Locale, routing } from "~/i18n/routing";
import { guidesForListing } from "~/lib/guides/catalog";
import { getTaxonomyLabels, inSentence } from "~/lib/labels";
import {
	gpCoverageNoteOf,
	isMarketListingSlug,
	listingFees,
	pharmacyCoverageOf,
} from "~/lib/market";
import { placeLabel } from "~/lib/places";
import { CONTENT_LANGUAGES, DESCRIPTION_MAX, fitText, pageMetadata, pickTitle } from "~/lib/seo";
import { absoluteUrl, siteOrigin } from "~/lib/site-url";
import { breadcrumbNode, graph, ids, itemListNode, webPageNode } from "~/lib/structured-data";
import { databaseAvailable } from "~/server/db";
import { getLandingPage, sampleListingSlugs } from "~/server/queries/landing";
import { getSwissCoverageTexts } from "~/server/queries/swiss-coverage";

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
	if (!isMarketListingSlug(locale, specialite)) notFound();
	const country = marketOf(locale);
	const data = await getLandingPage({
		country,
		listingSlug: specialite,
		place: null,
		isCity: false,
		page: 1,
	});
	const decision = landingRoute(data?.landing ?? null);
	if (decision.kind !== "page" || !data) notFound();
	return {
		locale,
		country,
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
	const values = {
		listing,
		count,
		occupation: inSentence(listing, locale),
		fees: listingFees(locale, listingSlug),
	};
	return pageMetadata({
		locale,
		href,
		title: pickTitle([t("hubMetaTitle", values), t("hubMetaTitleShort", values)]),
		description: fitText([t("hubMetaDescription", values)], DESCRIPTION_MAX),
		indexable,
	});
}

export default async function SpecialtyHub({ params }: Props) {
	const { locale, country, listingSlug, data, href } = await resolve(params);
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "Listing" });
	const labels = await getTaxonomyLabels(locale);
	const listing = labels.listing(listingSlug) ?? listingSlug;
	const count = data.landing.practitionerCount;
	const title = t("hubTitle", { listing });
	// Germany's pharmacies: two Länder only, said under the title.
	const coverage = pharmacyCoverageOf(locale, listingSlug);
	// Latvia's GP practices: those with a published address only, said under the title.
	const gpCoverage = gpCoverageNoteOf(locale, listingSlug);
	// Switzerland's lists cover some cantons only: the ones its published facilities come from.
	const swissCoverage =
		country === "CH" ? (await getSwissCoverageTexts(locale)).listing(listingSlug) : null;
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
							name: placeLabel(department, country),
							url: `${origin}${getPathname({ href: departmentHref(department.slug), locale })}`,
						})),
					}),
				])}
			/>
			<BookletPage>
				<div className="flex flex-col gap-6">
					<Trail locale={locale} items={trail} />
					<ListingTitle
						title={title}
						lead={
							// The cantons Switzerland covers for this kind, after the count.
							swissCoverage ? (
								<>
									{t("hubLead", { count, listing })} {swissCoverage}
								</>
							) : (
								t("hubLead", { count, listing })
							)
						}
						note={
							coverage
								? t("pharmacyCoverage", { states: coverage })
								: gpCoverage
									? t("gpCoverage")
									: null
						}
					/>
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
							label: placeLabel(department, country),
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
					listingSlug={listingSlug}
					payload={data.landing.payload}
					updatedAt={data.landing.updatedAt}
				/>

				<p className="text-body text-ink">
					<Link href="/annuaire" className={linkStyles()}>
						{t("browseDirectory")}
					</Link>
				</p>

				<RelatedGuides locale={locale} guides={guidesForListing(listingSlug)} />
			</BookletPage>
		</PublicPage>
	);
}
