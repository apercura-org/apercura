import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PlaceHub } from "~/components/place-hub";
import { permanentRedirect } from "~/i18n/navigation";
import { type Locale, routing } from "~/i18n/routing";
import { isDepartmentSlug, placeLabel } from "~/lib/places";
import { DESCRIPTION_MAX, fitText, pageMetadata, pickTitle, shortPlaceName } from "~/lib/seo";
import { databaseAvailable } from "~/server/db";
import { getPlaceHub, sampleDepartmentSlugs } from "~/server/queries/hubs";
import { resolvePlace } from "~/server/queries/places";

export const ensureStatic = "navigation";
/**
 * The response status (404, 308) is decided from the URL before anything
 * renders, so the page blocks on its params by design instead of streaming a
 * shell: a late notFound() inside Suspense would answer 200.
 */
export const instant = false;

export async function generateStaticParams() {
	const slugs = (await databaseAvailable()) ? await sampleDepartmentSlugs(5) : [];
	// "-" is not a department slug: it answers 404 without touching the database.
	return (slugs.length > 0 ? slugs : ["-"]).map((dept) => ({ dept }));
}

type Props = PageProps<"/[locale]/annuaire/[dept]">;

async function resolve(params: Props["params"]) {
	const { locale: requested, dept } = await params;
	const locale: Locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
	if (!isDepartmentSlug(dept)) notFound();
	const resolution = await resolvePlace(dept, null);
	if (resolution.kind === "not_found") notFound();
	if (resolution.kind === "moved") {
		permanentRedirect({
			href: { pathname: "/annuaire/[dept]", params: { dept: resolution.departmentSlug } },
			locale,
		});
	}
	const hub = await getPlaceHub(resolution.department, false);
	if (hub.total === 0) notFound();
	return {
		locale,
		department: resolution.department,
		hub,
		href: { pathname: "/annuaire/[dept]", params: { dept } } as const,
	};
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { locale, department, hub, href } = await resolve(params);
	const t = await getTranslations({ locale, namespace: "Directory" });
	const place = placeLabel(department);
	const short = placeLabel({ ...department, name: shortPlaceName(department.name) });
	return pageMetadata({
		locale,
		href,
		title: pickTitle([
			t("placeMetaTitle", { place }),
			t("placeMetaTitle", { place: short }),
			t("placeMetaTitleShort", { place: short }),
		]),
		description: fitText([t("placeMetaDescription", { place, count: hub.total })], DESCRIPTION_MAX),
		indexable: hub.listings.some((listing) => listing.indexable),
	});
}

export default async function DepartmentHub({ params }: Props) {
	const { locale, department, hub, href } = await resolve(params);
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "Directory" });
	return (
		<PlaceHub
			locale={locale}
			href={href}
			department={department}
			place={department}
			hub={hub}
			trail={[
				{ label: t("title"), href: "/annuaire" },
				{ label: department.name, href },
			]}
		/>
	);
}
