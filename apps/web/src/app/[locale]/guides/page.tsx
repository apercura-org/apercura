import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookletPage } from "~/components/booklet-page";
import { GuideList } from "~/components/guides";
import { InstitutionalCover } from "~/components/institutional";
import { PageGraph } from "~/components/page-graph";
import { PublicPage } from "~/components/public-page";
import { Trail } from "~/components/trail";
import { marketOf } from "~/i18n/locales";
import { getPathname } from "~/i18n/navigation";
import { GUIDES, guidesIn } from "~/lib/guides/catalog";
import { GUIDE_CATEGORIES } from "~/lib/guides/guide";
import { localeOf } from "~/lib/institutional";
import { pageMetadata } from "~/lib/seo";
import { siteOrigin } from "~/lib/site-url";
import { itemListNode } from "~/lib/structured-data";

export const ensureStatic = "navigation";

const HREF = "/guides" as const;

export async function generateMetadata({ params }: PageProps<"/[locale]/guides">) {
	const locale = await localeOf(params);
	// French articles about France's health system: France's pages only.
	if (marketOf(locale) !== "FR") notFound();
	const t = await getTranslations({ locale, namespace: "Guides" });
	return pageMetadata({
		locale,
		href: HREF,
		title: t("metaTitle"),
		description: t("metaDescription"),
		indexable: true,
	});
}

/** The guides, by audience: patients first, then health practitioners. */
export default async function GuidesIndex({ params }: PageProps<"/[locale]/guides">) {
	const locale = await localeOf(params);
	if (marketOf(locale) !== "FR") notFound();
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "Guides" });
	const origin = siteOrigin();
	const url = `${origin}${getPathname({ href: HREF, locale })}`;

	return (
		<PublicPage locale={locale} href={HREF}>
			<InstitutionalCover
				title={t("title")}
				lead={t("lead")}
				note={locale === "fr" ? null : t("frenchOnly")}
			/>
			<BookletPage>
				<PageGraph
					locale={locale}
					href={HREF}
					name={t("title")}
					description={t("lead")}
					trail={[{ label: t("title"), href: HREF }]}
					type="CollectionPage"
					extra={[
						itemListNode({
							url,
							name: t("title"),
							items: GUIDES.map((guide) => ({
								name: guide.title,
								url: `${origin}${getPathname({
									href: { pathname: "/guides/[slug]", params: { slug: guide.slug } },
									locale,
								})}`,
							})),
						}),
					]}
				/>
				<Trail locale={locale} items={[{ label: t("title"), href: HREF }]} />
				{GUIDE_CATEGORIES.map((category) => (
					<section
						key={category}
						id={category}
						aria-labelledby={`${category}-heading`}
						className="grid scroll-mt-6 gap-5 border-t border-rule-soft pt-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-12"
					>
						<div className="flex flex-col gap-3">
							<h2 id={`${category}-heading`} className="type-title text-ink">
								{t(`categories.${category}.heading`)}
							</h2>
							<p className="max-w-[45ch] text-body text-ink">{t(`categories.${category}.intro`)}</p>
						</div>
						<GuideList locale={locale} guides={guidesIn(category)} />
					</section>
				))}
			</BookletPage>
		</PublicPage>
	);
}
