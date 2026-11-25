import { linkStyles } from "@apercura/ui";
import { getTranslations } from "next-intl/server";
import { marketOf } from "~/i18n/locales";
import { getPathname } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { formatGuideDate } from "~/lib/guides/format";
import type { Guide, GuideHeading, GuideSource } from "~/lib/guides/guide";

const titleLink = `${linkStyles()} inline-flex min-h-11 items-center type-subtitle`;

/**
 * The guides of one category as a ruled list: title (a link), description, last update. The
 * guides' own text is French: it says so with `lang` when the page is in another language.
 */
export async function GuideList({
	locale,
	guides,
	headingLevel = 3,
}: {
	locale: Locale;
	guides: readonly Guide[];
	headingLevel?: 2 | 3;
}) {
	const t = await getTranslations({ locale, namespace: "Guides" });
	const Heading = headingLevel === 2 ? "h2" : "h3";
	const lang = locale === "fr" ? undefined : "fr";
	return (
		<ul className="flex flex-col border-t border-rule-soft">
			{guides.map((guide) => (
				<li key={guide.slug} className="flex flex-col gap-1 border-b border-rule-soft py-4">
					<Heading lang={lang} className="text-ink">
						<a
							href={getPathname({
								href: { pathname: "/guides/[slug]", params: { slug: guide.slug } },
								locale,
							})}
							className={titleLink}
						>
							{guide.title}
						</a>
					</Heading>
					<p lang={lang} className="max-w-[65ch] text-body text-ink">
						{guide.description}
					</p>
					<p className="text-meta text-ink-muted">
						{t("updated", { date: formatGuideDate(locale, guide.updatedAt) })}
					</p>
				</li>
			))}
		</ul>
	);
}

/** The table of contents of a long guide: its `##` headings, as anchors. */
export async function GuideToc({
	locale,
	headings,
}: {
	locale: Locale;
	headings: readonly GuideHeading[];
}) {
	const t = await getTranslations({ locale, namespace: "Guides" });
	return (
		<nav aria-labelledby="guide-toc-heading" className="flex flex-col gap-2">
			<h2 id="guide-toc-heading" className="type-caption text-ink">
				{t("toc")}
			</h2>
			<ol
				lang={locale === "fr" ? undefined : "fr"}
				className="flex flex-col border-t border-rule-soft"
			>
				{headings.map((heading) => (
					<li key={heading.id} className="border-b border-rule-soft">
						<a
							href={`#${heading.id}`}
							className={`${linkStyles()} flex min-h-11 items-center py-1.5 text-meta`}
						>
							{heading.text}
						</a>
					</li>
				))}
			</ol>
		</nav>
	);
}

/** The guide's official sources: title (a link to the page), publisher and the day it was checked. */
export async function GuideSources({
	locale,
	sources,
}: {
	locale: Locale;
	sources: readonly GuideSource[];
}) {
	const t = await getTranslations({ locale, namespace: "Guides" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	return (
		<section
			id="sources"
			aria-labelledby="sources-heading"
			className="flex scroll-mt-6 flex-col gap-4 border-t border-rule-soft pt-6"
		>
			<h2 id="sources-heading" className="type-title text-ink">
				{t("sourcesHeading")}
			</h2>
			<p className="max-w-[65ch] text-body text-ink">{t("sourcesIntro")}</p>
			<ol className="flex max-w-[65ch] list-decimal flex-col border-t border-rule-soft ps-7 marker:text-ink-muted">
				{sources.map((source) => (
					<li key={source.url} className="border-b border-rule-soft py-3 ps-1 text-body text-ink">
						<a
							href={source.url}
							rel="noopener noreferrer"
							lang="fr"
							className={`${linkStyles()} font-semibold break-words`}
						>
							{source.title}
							<span className="sr-only"> ({tSite("externalLink")})</span>
						</a>
						<span className="block text-meta text-ink-muted">
							<span lang="fr">{source.publisher}</span>
							{" · "}
							{t("sourceChecked", { date: formatGuideDate(locale, source.checkedAt) })}
						</span>
					</li>
				))}
			</ol>
		</section>
	);
}

/**
 * "Useful guides" on a directory page (a listing, a practitioner): a few links, set low and
 * quiet, after the page's own content. Nothing when no guide concerns the page.
 */
export async function RelatedGuides({
	locale,
	guides,
}: {
	locale: Locale;
	guides: readonly Guide[];
}) {
	if (guides.length === 0 || marketOf(locale) !== "FR") return null;
	const t = await getTranslations({ locale, namespace: "Guides" });
	return (
		<section aria-labelledby="related-guides-heading" className="flex flex-col gap-2">
			<h2 id="related-guides-heading" className="type-subtitle text-ink">
				{t("relatedHeading")}
			</h2>
			<ul className="flex flex-col border-t border-rule-soft">
				{guides.map((guide) => (
					<li key={guide.slug} className="border-b border-rule-soft">
						<a
							lang={locale === "fr" ? undefined : "fr"}
							href={getPathname({
								href: { pathname: "/guides/[slug]", params: { slug: guide.slug } },
								locale,
							})}
							className={`${linkStyles()} flex min-h-11 items-center py-1.5 text-body`}
						>
							{guide.shortTitle ?? guide.title}
						</a>
					</li>
				))}
			</ul>
		</section>
	);
}
