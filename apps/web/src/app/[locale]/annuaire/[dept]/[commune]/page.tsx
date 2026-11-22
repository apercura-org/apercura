import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PlaceHub } from "~/components/place-hub";
import { type Href, permanentRedirect } from "~/i18n/navigation";
import { type Locale, routing } from "~/i18n/routing";
import { isDepartmentSlug, isPlaceSlug, placeLabel } from "~/lib/places";
import { DESCRIPTION_MAX, fitText, pageMetadata, pickTitle, shortPlaceName } from "~/lib/seo";
import { databaseAvailable } from "~/server/db";
import { getPlaceHub } from "~/server/queries/hubs";
import { sampleLandingParams } from "~/server/queries/landing";
import { resolvePlace } from "~/server/queries/places";

export const ensureStatic = "navigation";
/**
 * The response status (404, 308) is decided from the URL before anything
 * renders, so the page blocks on its params by design instead of streaming a
 * shell: a late notFound() inside Suspense would answer 200.
 */
export const instant = false;

export async function generateStaticParams() {
	const rows = (await databaseAvailable()) ? await sampleLandingParams(20) : [];
	const params = rows
		.filter((row) => row.placeSlug)
		.slice(0, 5)
		.map((row) => ({ dept: row.departmentSlug, commune: row.placeSlug as string }));
	// "-" is not a department slug: it answers 404 without touching the database.
	return params.length > 0 ? params : [{ dept: "-", commune: "-" }];
}

type Props = PageProps<"/[locale]/annuaire/[dept]/[commune]">;

async function resolve(params: Props["params"]) {
	const { locale: requested, dept, commune } = await params;
	const locale: Locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
	if (!isDepartmentSlug(dept) || !isPlaceSlug(commune)) notFound();
	const resolution = await resolvePlace(dept, commune);
	if (resolution.kind === "not_found") notFound();
	if (resolution.kind === "moved") {
		// Old slugs and merged communes move; the Paris city is its department page.
		const target: Href = resolution.placeSlug
			? {
					pathname: "/annuaire/[dept]/[commune]",
					params: { dept: resolution.departmentSlug, commune: resolution.placeSlug },
				}
			: { pathname: "/annuaire/[dept]", params: { dept: resolution.departmentSlug } };
		permanentRedirect({ href: target, locale });
	}
	const place = resolution.place;
	if (!place) notFound();
	const hub = await getPlaceHub(place, resolution.isCity);
	if (hub.total === 0) notFound();
	return {
		locale,
		department: resolution.department,
		place,
		hub,
		href: { pathname: "/annuaire/[dept]/[commune]", params: { dept, commune } } as const,
	};
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { locale, place, hub, href } = await resolve(params);
	const t = await getTranslations({ locale, namespace: "Directory" });
	const name = placeLabel(place);
	const short = placeLabel({ ...place, name: shortPlaceName(place.name) });
	return pageMetadata({
		locale,
		href,
		title: pickTitle([
			t("placeMetaTitle", { place: name }),
			t("placeMetaTitle", { place: short }),
			t("placeMetaTitleShort", { place: short }),
		]),
		description: fitText(
			[t("placeMetaDescription", { place: name, count: hub.total })],
			DESCRIPTION_MAX,
		),
		indexable: hub.listings.some((listing) => listing.indexable),
	});
}

export default async function CommuneHub({ params }: Props) {
	const { locale, department, place, hub, href } = await resolve(params);
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "Directory" });
	return (
		<PlaceHub
			locale={locale}
			href={href}
			department={department}
			place={place}
			hub={hub}
			trail={[
				{ label: t("title"), href: "/annuaire" },
				{
					label: department.name,
					href: { pathname: "/annuaire/[dept]", params: { dept: department.slug } },
				},
				{ label: place.name, href },
			]}
		/>
	);
}
