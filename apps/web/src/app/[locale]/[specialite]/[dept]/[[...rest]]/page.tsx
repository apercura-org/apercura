import { LISTING_PAGE_SIZE, landingRoute, pageCount, parsePageSegment } from "@apercura/core";
import { linkStyles } from "@apercura/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookletPage } from "~/components/booklet-page";
import { RelatedGuides } from "~/components/guides";
import { JsonLd } from "~/components/json-ld";
import {
	CountLinks,
	ListingFacts,
	ListingSection,
	ListingTitle,
	Pagination,
	PractitionerTable,
} from "~/components/listing";
import { PublicPage } from "~/components/public-page";
import { Trail, type TrailItem, trailEntries } from "~/components/trail";
import { marketOf } from "~/i18n/locales";
import { getPathname, type Href, Link, permanentRedirect } from "~/i18n/navigation";
import { type Locale, routing } from "~/i18n/routing";
import { guidesForListing } from "~/lib/guides/catalog";
import { getTaxonomyLabels, inSentence } from "~/lib/labels";
import {
	gpCoverageNoteOf,
	isMarketListingSlug,
	listingCoverageOf,
	listingFees,
} from "~/lib/market";
import { isDepartmentSlug, isPlaceSlug, placeLabel } from "~/lib/places";
import {
	CONTENT_LANGUAGES,
	DESCRIPTION_MAX,
	fitText,
	pageMetadata,
	pickTitle,
	shortPlaceName,
} from "~/lib/seo";
import { absoluteUrl, siteOrigin } from "~/lib/site-url";
import { breadcrumbNode, graph, ids, itemListNode, webPageNode } from "~/lib/structured-data";
import { databaseAvailable } from "~/server/db";
import { getLandingPage, sampleLandingParams } from "~/server/queries/landing";
import { resolvePlace } from "~/server/queries/places";
import { getSwissCoverageTexts } from "~/server/queries/swiss-coverage";

export const ensureStatic = "navigation";
/**
 * The response status (404, 308) is decided from the URL before anything
 * renders, so the page blocks on its params by design instead of streaming a
 * shell: a late notFound() inside Suspense would answer 200.
 */
export const instant = false;

/** Not a listing slug: answers 404 without touching the database. */
const BUILD_WITHOUT_DATABASE = { specialite: "exemple", dept: "00-exemple", rest: [] };

export async function generateStaticParams() {
	if (!(await databaseAvailable())) return [BUILD_WITHOUT_DATABASE];
	const rows = await sampleLandingParams(10);
	const params = rows.map((row) => ({
		specialite: row.listingSlug,
		dept: row.departmentSlug,
		rest: row.placeSlug ? [row.placeSlug] : [],
	}));
	return params.length > 0 ? params : [BUILD_WITHOUT_DATABASE];
}

type Props = PageProps<"/[locale]/[specialite]/[dept]/[[...rest]]">;

function landingHref(listingSlug: string, dept: string, placeSlug: string | null, page = 1): Href {
	const rest = [...(placeSlug ? [placeSlug] : []), ...(page > 1 ? [String(page)] : [])];
	return {
		pathname: "/[specialite]/[dept]/[[...rest]]",
		params: { specialite: listingSlug, dept, rest: rest.length > 0 ? rest : undefined },
	};
}

/**
 * Decides the response before rendering: unknown listing or place slugs, an
 * empty listing or a page past the end answer 404; old slugs, the Paris city
 * and non-canonical page numbers answer 308.
 */
async function resolve(params: Props["params"]) {
	const { locale: requested, specialite, dept, rest = [] } = await params;
	const locale: Locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
	const country = marketOf(locale);
	if (
		!isMarketListingSlug(locale, specialite) ||
		!isDepartmentSlug(dept, country) ||
		rest.length > 2
	) {
		notFound();
	}

	let placeSlug: string | null = null;
	let page = 1;
	let canonicalPage = true;
	const [first, second] = rest;
	if (first !== undefined) {
		const asPage = parsePageSegment(first);
		if (asPage && second === undefined) {
			page = asPage.page;
			canonicalPage = asPage.canonical;
		} else if (isPlaceSlug(first)) {
			placeSlug = first;
			if (second !== undefined) {
				const parsed = parsePageSegment(second);
				if (!parsed) notFound();
				page = parsed.page;
				canonicalPage = parsed.canonical;
			}
		} else {
			notFound();
		}
	}

	const resolution = await resolvePlace(country, dept, placeSlug);
	if (resolution.kind === "not_found") notFound();
	if (resolution.kind === "moved") {
		permanentRedirect({
			href: landingHref(specialite, resolution.departmentSlug, resolution.placeSlug, page),
			locale,
		});
	}
	if (!canonicalPage) {
		permanentRedirect({ href: landingHref(specialite, dept, placeSlug, page), locale });
	}

	const place = resolution.place ?? resolution.department;
	const data = await getLandingPage({
		country,
		listingSlug: specialite,
		place,
		isCity: resolution.isCity,
		page,
	});
	const decision = landingRoute(data?.landing ?? null);
	if (decision.kind !== "page" || !data) notFound();
	const pages = pageCount(data.landing.practitionerCount);
	if (page > pages) notFound();

	return {
		locale,
		country,
		listingSlug: specialite,
		department: resolution.department,
		place,
		placeSlug,
		isCity: resolution.isCity,
		page,
		pages,
		data,
		// Every page of an indexable listing is indexable, each its own canonical: the
		// practitioners of page 187 are one click from an indexed page, not only from
		// the sitemap (docs/public-site.md, SEO checklist).
		indexable: decision.indexable,
		href: landingHref(specialite, dept, placeSlug, page),
	};
}

/** The first and last names of a page, which tell its description apart from the others'. */
function nameRange(rows: readonly { firstName: string; lastName: string }[]) {
	const name = (row: (typeof rows)[number] | undefined) =>
		[row?.firstName, row?.lastName].filter(Boolean).join(" ");
	return { first: name(rows[0]), last: name(rows.at(-1)) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const resolved = await resolve(params);
	const { locale, data, page, pages } = resolved;
	const t = await getTranslations({ locale, namespace: "Listing" });
	const labels = await getTaxonomyLabels(locale);
	const listing = labels.listing(resolved.listingSlug) ?? resolved.listingSlug;
	const place = placeLabel(resolved.place, resolved.country);
	const short = placeLabel(
		{ ...resolved.place, name: shortPlaceName(resolved.place.name) },
		resolved.country,
	);
	const count = data.landing.practitionerCount;
	const values = {
		listing,
		place,
		count,
		page,
		pages,
		occupation: inSentence(listing, locale),
		fees: listingFees(locale, resolved.listingSlug),
	};
	const shortValues = { ...values, place: short };
	return pageMetadata({
		locale,
		href: resolved.href,
		title:
			page > 1
				? pickTitle([t("metaTitlePage", values), t("metaTitlePage", shortValues)])
				: pickTitle([
						t("metaTitle", values),
						t("metaTitle", shortValues),
						t("metaTitleShort", shortValues),
					]),
		description: fitText(
			page > 1
				? [
						t("metaDescriptionPageRange", { ...values, ...nameRange(data.rows) }),
						t("metaDescriptionPage", values),
					]
				: [t("metaDescription", values)],
			DESCRIPTION_MAX,
		),
		indexable: resolved.indexable,
	});
}

export default async function LandingPage({ params }: Props) {
	const resolved = await resolve(params);
	const { locale, country, data, department, place, placeSlug, listingSlug, page, pages } =
		resolved;
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "Listing" });
	const labels = await getTaxonomyLabels(locale);
	const listing = labels.listing(listingSlug) ?? listingSlug;
	const placeName = placeLabel(place, country);
	const count = data.landing.practitionerCount;
	// Germany's pharmacies (two Länder) and Sweden's health centres (one region): said under the title.
	const coverage = listingCoverageOf(locale, listingSlug);
	// Latvia's GP practices: those with a published address only, said under the title.
	const gpCoverage = gpCoverageNoteOf(locale, listingSlug);
	// Switzerland's lists cover some cantons only: the ones its published facilities come from.
	const swissCoverage =
		country === "CH" ? (await getSwissCoverageTexts(locale)).listing(listingSlug) : null;
	const isDepartment = place.kind === "department";
	// A UK region (England's regions, the other nations) sits in the department's slot: its
	// places are local authorities, and it has no hub of a commune.
	const isRegion = place.kind === "region";
	const isTop = isDepartment || isRegion;

	const trail: TrailItem[] = [
		{ label: listing, href: { pathname: "/[specialite]", params: { specialite: listingSlug } } },
		{ label: department.name, href: landingHref(listingSlug, department.slug, null) },
	];
	if (!isTop && placeSlug) {
		trail.push({ label: place.name, href: landingHref(listingSlug, department.slug, placeSlug) });
	}
	if (page > 1) {
		trail.push({ label: t("pagination.status", { page, pages }), href: resolved.href });
	}

	const title = t("title", { listing, place: placeName });
	const url = absoluteUrl(resolved.href, locale);
	const origin = siteOrigin();

	const hubHref: Href = isTop
		? { pathname: "/annuaire/[dept]", params: { dept: department.slug } }
		: {
				pathname: "/annuaire/[dept]/[commune]",
				params: { dept: department.slug, commune: placeSlug ?? "" },
			};

	return (
		<PublicPage locale={locale} href={resolved.href}>
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
						name: title,
						total: count,
						offset: (page - 1) * LISTING_PAGE_SIZE,
						items: data.rows.map((row) => ({
							name: labels.personName(row),
							url: `${origin}${getPathname({
								href: { pathname: "/praticien/[slug]", params: { slug: row.slug } },
								locale,
							})}`,
						})),
					}),
				])}
			/>
			<BookletPage>
				<div className="flex flex-col gap-6">
					<Trail locale={locale} items={trail} />
					<ListingTitle
						title={t("title", { listing, place: placeName })}
						lead={
							// The cantons Switzerland covers for this kind, after the count.
							swissCoverage ? (
								<>
									{t("lead", { count, listing, place: placeName })} {swissCoverage}
								</>
							) : (
								t("lead", { count, listing, place: placeName })
							)
						}
						note={
							coverage
								? coverage.key === "pharmacyCoverage"
									? t("pharmacyCoverage", { states: coverage.places })
									: t("healthCentreCoverage", { regions: coverage.places })
								: gpCoverage
									? t("gpCoverage")
									: null
						}
					/>
				</div>

				<ListingSection
					id="practitioners-heading"
					title={t("practitionersHeading", { count })}
					intro={t("practitionersIntro")}
				>
					<PractitionerTable
						locale={locale}
						listingSlug={listingSlug}
						caption={t("title", { listing, place: placeName })}
						rows={data.rows}
					/>
					<Pagination
						locale={locale}
						page={page}
						pages={pages}
						hrefOf={(target) => landingHref(listingSlug, department.slug, placeSlug, target)}
					/>
				</ListingSection>

				<ListingFacts
					locale={locale}
					listingSlug={listingSlug}
					payload={data.landing.payload}
					updatedAt={data.landing.updatedAt}
				/>

				{data.nearby.length > 0 ? (
					<ListingSection
						id="nearby-heading"
						title={
							isRegion
								? t("authoritiesHeading", { listing, place: placeName })
								: isDepartment
									? t("communesHeading", { listing, place: placeName })
									: t("nearbyHeading", { listing })
						}
					>
						<CountLinks
							locale={locale}
							items={data.nearby.map((item) => ({
								key: item.id,
								label: placeLabel(item, country),
								href: landingHref(
									listingSlug,
									item.departmentSlug,
									item.kind === "department" ? null : item.slug,
								),
								count: item.practitionerCount,
							}))}
						/>
					</ListingSection>
				) : null}

				{data.establishments.length > 0 ? (
					<ListingSection
						id="establishments-heading"
						title={t("establishmentsHeading", { place: placeName })}
						intro={t("establishmentsIntro", { occupation: inSentence(listing, locale) })}
					>
						<CountLinks
							locale={locale}
							items={data.establishments.map((item) => ({
								key: item.slug,
								label: item.name,
								href: { pathname: "/etablissement/[slug]", params: { slug: item.slug } },
								count: item.practitionerCount,
							}))}
						/>
					</ListingSection>
				) : null}

				<p className="text-body text-ink">
					<Link href={hubHref} className={linkStyles()}>
						{t("allSpecialties", { place: placeName })}
					</Link>
				</p>

				<RelatedGuides locale={locale} guides={guidesForListing(listingSlug)} />
			</BookletPage>
		</PublicPage>
	);
}
