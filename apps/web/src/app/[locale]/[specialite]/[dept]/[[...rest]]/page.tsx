import { landingRoute, pageCount, parsePageSegment } from "@apercura/core";
import { isListingSlug } from "@apercura/core/taxonomy";
import { linkStyles } from "@apercura/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookletPage } from "~/components/booklet-page";
import { JsonLd } from "~/components/json-ld";
import {
	CountLinks,
	itemListData,
	ListingFacts,
	ListingSection,
	ListingTitle,
	Pagination,
	PractitionerTable,
} from "~/components/listing";
import { PublicPage } from "~/components/public-page";
import { Trail, type TrailItem } from "~/components/trail";
import { type Href, Link, permanentRedirect } from "~/i18n/navigation";
import { type Locale, routing } from "~/i18n/routing";
import { getTaxonomyLabels } from "~/lib/labels";
import { isDepartmentSlug, isPlaceSlug, placeLabel } from "~/lib/places";
import { robotsFor } from "~/lib/robots";
import { pageAlternates, siteOrigin } from "~/lib/site-url";
import { databaseAvailable } from "~/server/db";
import { getLandingPage, sampleLandingParams } from "~/server/queries/landing";
import { resolvePlace } from "~/server/queries/places";

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
	if (!isListingSlug(specialite) || !isDepartmentSlug(dept) || rest.length > 2) notFound();

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

	const resolution = await resolvePlace(dept, placeSlug);
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
		listingSlug: specialite,
		department: resolution.department,
		place,
		placeSlug,
		isCity: resolution.isCity,
		page,
		pages,
		data,
		indexable: decision.indexable && page === 1,
		href: landingHref(specialite, dept, placeSlug, page),
	};
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const resolved = await resolve(params);
	const { locale, data, page } = resolved;
	const t = await getTranslations({ locale, namespace: "Listing" });
	const labels = await getTaxonomyLabels(locale);
	const listing = labels.listing(resolved.listingSlug) ?? resolved.listingSlug;
	const place = placeLabel(resolved.place);
	const count = data.landing.practitionerCount;
	return {
		title:
			page > 1
				? t("metaTitlePage", { listing, place, count, page })
				: t("metaTitle", { listing, place, count }),
		description: t("metaDescription", { listing, place, count }),
		robots: robotsFor(locale, resolved.indexable),
		alternates: pageAlternates(resolved.href, locale),
		openGraph: { images: [{ url: "/og/annuaire.png", width: 1200, height: 630 }] },
	};
}

export default async function LandingPage({ params }: Props) {
	const resolved = await resolve(params);
	const { locale, data, department, place, placeSlug, listingSlug, page, pages } = resolved;
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "Listing" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const labels = await getTaxonomyLabels(locale);
	const listing = labels.listing(listingSlug) ?? listingSlug;
	const placeName = placeLabel(place);
	const count = data.landing.practitionerCount;
	const isDepartment = place.kind === "department";

	const trail: TrailItem[] = [
		{ label: listing, href: { pathname: "/[specialite]", params: { specialite: listingSlug } } },
		{ label: department.name, href: landingHref(listingSlug, department.slug, null) },
	];
	if (!isDepartment && placeSlug) {
		trail.push({ label: place.name, href: landingHref(listingSlug, department.slug, placeSlug) });
	}
	if (page > 1) {
		trail.push({ label: t("pagination.status", { page, pages }), href: resolved.href });
	}

	const hubHref: Href = isDepartment
		? { pathname: "/annuaire/[dept]", params: { dept: department.slug } }
		: {
				pathname: "/annuaire/[dept]/[commune]",
				params: { dept: department.slug, commune: placeSlug ?? "" },
			};

	return (
		<PublicPage locale={locale} href={resolved.href}>
			<JsonLd data={itemListData(locale, siteOrigin(), data.rows)} />
			<BookletPage
				runningHead={tSite("runningHead")}
				folio={pages > 1 ? tSite("folio", { number: page }) : undefined}
			>
				<div className="flex flex-col gap-6">
					<Trail locale={locale} items={trail} />
					<ListingTitle
						title={t("title", { listing, place: placeName })}
						lead={t("lead", { count, listing, place: placeName })}
					/>
				</div>

				<ListingSection
					id="practitioners-heading"
					title={t("practitionersHeading", { count })}
					intro={t("practitionersIntro")}
				>
					<PractitionerTable
						locale={locale}
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
					payload={data.landing.payload}
					updatedAt={data.landing.updatedAt}
				/>

				{data.nearby.length > 0 ? (
					<ListingSection
						id="nearby-heading"
						title={
							isDepartment
								? t("communesHeading", { listing, place: placeName })
								: t("nearbyHeading", { listing })
						}
					>
						<CountLinks
							locale={locale}
							items={data.nearby.map((item) => ({
								key: item.id,
								label: placeLabel(item),
								href: landingHref(listingSlug, item.departmentSlug, item.slug),
								count: item.practitionerCount,
							}))}
						/>
					</ListingSection>
				) : null}

				{data.establishments.length > 0 ? (
					<ListingSection
						id="establishments-heading"
						title={t("establishmentsHeading", { place: placeName })}
						intro={t("establishmentsIntro", { listing })}
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
			</BookletPage>
		</PublicPage>
	);
}
