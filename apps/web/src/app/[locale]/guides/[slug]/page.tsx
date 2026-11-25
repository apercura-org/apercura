import { linkStyles, Notice, ProvenanceNote } from "@apercura/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookletPage } from "~/components/booklet-page";
import { GuideBody } from "~/components/guide-body";
import { GuideList, GuideSources, GuideToc } from "~/components/guides";
import { JsonLd } from "~/components/json-ld";
import { PublicPage } from "~/components/public-page";
import { Trail, type TrailItem, trailEntries } from "~/components/trail";
import { LOCALE_TAGS, marketOf } from "~/i18n/locales";
import { getPathname, Link } from "~/i18n/navigation";
import { type Locale, routing } from "~/i18n/routing";
import { articleJsonLd } from "~/lib/article-json-ld";
import { GUIDES, guideBySlug, guidesIn } from "~/lib/guides/catalog";
import { formatGuideDate, readingMinutes } from "~/lib/guides/format";
import { guideOgImageUrl } from "~/lib/guides/og";
import { getTaxonomyLabels } from "~/lib/labels";
import { BRAND, pageMetadata, pickTitle } from "~/lib/seo";
import { absoluteUrl, siteOrigin } from "~/lib/site-url";
import { breadcrumbNode, graph, webPageNode } from "~/lib/structured-data";

export const ensureStatic = "navigation";

export function generateStaticParams() {
	return GUIDES.map((guide) => ({ slug: guide.slug }));
}

type Props = PageProps<"/[locale]/guides/[slug]">;

/** A table of contents from this many `##` headings: shorter guides read without one. */
const TOC_MIN_HEADINGS = 3;
/** Other guides of the same audience printed under a guide (the index lists them all). */
const OTHER_GUIDES = 3;

async function resolve(params: Props["params"]) {
	const { locale: requested, slug } = await params;
	const locale: Locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
	const guide = guideBySlug(slug);
	// French articles about France's health system: France's pages only.
	if (!guide || marketOf(locale) !== "FR") notFound();
	return {
		locale,
		guide,
		href: { pathname: "/guides/[slug]", params: { slug: guide.slug } } as const,
	};
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { locale, guide, href } = await resolve(params);
	const metadata = await pageMetadata({
		locale,
		href,
		title: pickTitle([
			`${guide.title} · ${BRAND}`,
			...(guide.shortTitle ? [`${guide.shortTitle} · ${BRAND}`, guide.shortTitle] : []),
			guide.title,
		]),
		description: guide.description,
		indexable: true,
		ownImage: { url: guideOgImageUrl(guide.slug), alt: guide.title },
	});
	// An article: its dates for the Open Graph card (the shared builder prints a website).
	return {
		...metadata,
		openGraph: {
			...metadata.openGraph,
			type: "article",
			publishedTime: guide.publishedAt,
			modifiedTime: guide.updatedAt,
		},
	};
}

export default async function GuidePage({ params }: Props) {
	const { locale, guide, href } = await resolve(params);
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "Guides" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const labels = await getTaxonomyLabels(locale);
	const origin = siteOrigin();
	const url = absoluteUrl(href, locale);
	const category = t(`categories.${guide.category}.label`);
	const trail: TrailItem[] = [
		{ label: t("title"), href: "/guides" },
		{ label: guide.shortTitle ?? guide.title, href },
	];
	const others = guidesIn(guide.category)
		.filter((other) => other.slug !== guide.slug)
		.slice(0, OTHER_GUIDES);
	// The text is French whatever the interface language: say so to assistive technology.
	const lang = locale === "fr" ? undefined : "fr";
	const updated = formatGuideDate(locale, guide.updatedAt);
	const reviewed = formatGuideDate(locale, guide.reviewedAt);

	return (
		<PublicPage locale={locale} href={href}>
			<JsonLd
				data={graph([
					{
						...webPageNode({
							url,
							origin,
							name: guide.title,
							description: guide.description,
							language: LOCALE_TAGS.fr,
							hasBreadcrumb: true,
							mainEntity: `${url}#article`,
							dateModified: guide.updatedAt,
						}),
						lastReviewed: guide.reviewedAt,
					},
					breadcrumbNode(url, await trailEntries(locale, trail)),
					articleJsonLd({
						url,
						origin,
						headline: guide.title,
						description: guide.description,
						language: LOCALE_TAGS.fr,
						datePublished: guide.publishedAt,
						dateModified: guide.updatedAt,
						image: guideOgImageUrl(guide.slug),
						section: category,
						editorialTeam: {
							name: t("editorialTeam"),
							url: `${origin}${getPathname({ href: "/a-propos", locale })}`,
						},
						publisherName: BRAND,
						citations: guide.sources.map((source) => ({
							name: source.title,
							url: source.url,
							publisher: source.publisher,
						})),
						wordCount: guide.wordCount,
					}),
				])}
			/>
			<div className="surface-shade border-b border-rule-soft">
				<div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 pt-10 pb-10 sm:px-8 sm:pb-12">
					<p className="type-caption text-ink">
						{t("title")} · {category}
					</p>
					<h1 lang={lang} className="max-w-[26ch] type-headline">
						{guide.title}
					</h1>
					<p lang={lang} className="max-w-[60ch] text-lead text-ink">
						{guide.description}
					</p>
					<p className="flex flex-wrap gap-x-5 gap-y-1 text-meta text-ink">
						<span>
							<span className="type-caption me-1.5">{t("imprintUpdated")}</span>
							<time dateTime={guide.updatedAt}>{updated}</time>
						</span>
						<span>
							<span className="type-caption me-1.5">{t("imprintReviewed")}</span>
							<time dateTime={guide.reviewedAt}>{reviewed}</time>
						</span>
						<span>{t("readingTime", { minutes: readingMinutes(guide.wordCount) })}</span>
					</p>
					<p className="text-meta text-ink-muted">{t("byline")}</p>
					{lang ? <p className="text-meta text-ink">{t("frenchOnly")}</p> : null}
				</div>
			</div>
			<BookletPage>
				<Trail locale={locale} items={trail} />
				<div className="grid gap-10 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)] lg:gap-16">
					<article lang={lang} className="flex min-w-0 flex-col gap-8">
						{guide.category === "patients" ? (
							<Notice role="none" title={t("emergencyTitle")} className="max-w-[65ch]">
								<p>{t("emergencyBody")}</p>
							</Notice>
						) : null}
						<GuideBody tokens={guide.tokens} externalLabel={tSite("externalLink")} />
						<p className="max-w-[65ch] border-t border-rule-soft pt-4 text-meta text-ink-muted">
							{t("disclaimer")}
						</p>
						<GuideSources locale={locale} sources={guide.sources} />
						<ProvenanceNote
							locale={LOCALE_TAGS[locale]}
							sourceLabel={t("imprintSource")}
							source={t("editorialTeam")}
							updatedLabel={t("imprintUpdated")}
							updatedAt={guide.updatedAt}
						/>
					</article>
					<div className="flex flex-col gap-8 lg:sticky lg:top-6 lg:self-start">
						{guide.headings.length >= TOC_MIN_HEADINGS ? (
							<GuideToc locale={locale} headings={guide.headings} />
						) : null}
						{guide.listings.length > 0 ? (
							<nav aria-labelledby="guide-listings-heading" className="flex flex-col gap-2">
								<h2 id="guide-listings-heading" className="type-caption text-ink">
									{t("findPractitioners")}
								</h2>
								<ul className="flex flex-col border-t border-rule-soft">
									{guide.listings.map((listing) => (
										<li key={listing} className="border-b border-rule-soft">
											<Link
												href={{ pathname: "/[specialite]", params: { specialite: listing } }}
												className={`${linkStyles()} flex min-h-11 items-center py-1.5 text-meta`}
											>
												{labels.listing(listing) ?? listing}
											</Link>
										</li>
									))}
									<li className="border-b border-rule-soft">
										<Link
											href="/annuaire"
											className={`${linkStyles()} flex min-h-11 items-center py-1.5 text-meta`}
										>
											{tSite("footerNav.directory")}
										</Link>
									</li>
								</ul>
							</nav>
						) : null}
					</div>
				</div>
				{others.length > 0 ? (
					<section aria-labelledby="other-guides-heading" className="flex flex-col gap-4">
						<h2 id="other-guides-heading" className="type-title text-ink">
							{t("otherGuides")}
						</h2>
						<GuideList locale={locale} guides={others} />
						<Link
							href="/guides"
							className={`${linkStyles()} inline-flex min-h-11 items-center text-body font-semibold`}
						>
							{t("allGuides")}
						</Link>
					</section>
				) : null}
			</BookletPage>
		</PublicPage>
	);
}
