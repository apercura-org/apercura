import { buttonStyles } from "@apercura/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookletPage } from "~/components/booklet-page";
import { HomeSearch } from "~/components/home-search";
import { HomeDirectory, HomeSources } from "~/components/home-sections";
import { PageGraph } from "~/components/page-graph";
import { SampleStamps } from "~/components/sample-stamps";
import { SiteFooter } from "~/components/site-footer";
import { SiteHeader } from "~/components/site-header";
import { SpecimenPage } from "~/components/specimen-page";
import { serverEnv } from "~/env";
import { marketOf } from "~/i18n/locales";
import { Link } from "~/i18n/navigation";
import { routing } from "~/i18n/routing";
import { getPillars } from "~/lib/pillars";
import { homeAlternates, pageMetadata } from "~/lib/seo";
import { apercuraSiteNodes } from "~/lib/site-entities";
import { getSwissCoverageTexts } from "~/server/queries/swiss-coverage";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
	const { locale: requested } = await params;
	// A first segment that is no locale (`/missing.txt`) is the root 404, never France's home.
	if (!hasLocale(routing.locales, requested)) notFound();
	const locale = requested;
	const t = await getTranslations({ locale, namespace: "Metadata" });
	return pageMetadata({
		locale,
		href: "/",
		title: t("homeTitle"),
		description: t("description"),
		indexable: true,
		languages: homeAlternates(),
	});
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
	const { locale: requested } = await params;
	const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
	setRequestLocale(locale);

	const t = await getTranslations({ locale, namespace: "HomePage" });

	const tMeta = await getTranslations({ locale, namespace: "Metadata" });
	// One home for every market: the same sections in the same order, each filled with the
	// market's own pages, sources and figures (#163).
	const pillars = getPillars(serverEnv.PUBLIC_HDS_HOST);
	// Switzerland names the cantons whose lists it publishes, live from the directory.
	const hook = marketOf(locale) === "CH" ? (await getSwissCoverageTexts(locale)).hook : t("hook");

	return (
		<>
			<PageGraph
				locale={locale}
				href="/"
				name={tMeta("homeTitle")}
				description={tMeta("description")}
				extra={apercuraSiteNodes()}
			/>
			<SiteHeader locale={locale} href="/" />
			<main id="main" tabIndex={-1} className="flex-1 outline-none">
				{/*
				 * The opening, set like the top of a form: the title and the search on two thirds of the
				 * twelve columns, the sample stamps on the last third, closed by a hairline.
				 */}
				<div className="rule-b">
					<div className="mx-auto grid w-full max-w-6xl gap-x-8 gap-y-10 px-5 pt-10 pb-12 sm:px-8 sm:pt-14 lg:grid-cols-12 lg:pt-16 lg:pb-16">
						<div className="flex flex-col gap-8 lg:col-span-8">
							<div className="flex flex-col gap-4">
								<h1 className="type-display">{t("title")}</h1>
								<p className="max-w-[46ch] text-lead text-ink-muted">{hook}</p>
							</div>
							<HomeSearch locale={locale} idPrefix="home-search" />
						</div>
						<div className="lg:col-span-4 lg:border-s lg:border-rule-soft lg:ps-8">
							<SampleStamps locale={locale} />
						</div>
					</div>
				</div>

				<BookletPage>
					<section aria-labelledby="specimen-heading" className="flex flex-col gap-5">
						<div className="flex max-w-[65ch] flex-col gap-2">
							<h2 id="specimen-heading" className="type-title text-ink">
								{t("specimen.heading")}
							</h2>
							<p className="text-body text-ink">{t("specimen.intro")}</p>
						</div>
						<SpecimenPage locale={locale} />
					</section>

					<HomeDirectory locale={locale} />

					<section aria-labelledby="pillars-heading" className="flex flex-col gap-5">
						<h2 id="pillars-heading" className="type-title text-ink">
							{t("pillarsHeading")}
						</h2>
						<ol className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
							{pillars.map((pillar) => (
								<li key={pillar.key} className="flex flex-col gap-2 border-t border-ink pt-4">
									<h3 className="type-subtitle text-ink">{t(`pillars.${pillar.key}.title`)}</h3>
									<p className="text-body text-ink-muted">
										{pillar.key === "hostedInFrance"
											? t("pillars.hostedInFrance.description", { host: pillar.host })
											: t(`pillars.${pillar.key}.description`)}
									</p>
								</li>
							))}
						</ol>
					</section>

					<HomeSources locale={locale} />

					<section
						aria-labelledby="pro-heading"
						className="rule-t flex flex-col gap-4 border-b border-rule-soft pt-6 pb-7 sm:flex-row sm:items-center sm:justify-between"
					>
						<div className="flex flex-col gap-1">
							<h2 id="pro-heading" className="type-subtitle">
								{t("pro.heading")}
							</h2>
							<p className="text-body text-ink-muted">{t("pro.body")}</p>
						</div>
						<Link href="/pro" className={buttonStyles({ intent: "ink", size: "lg" })}>
							{t("pro.cta")}
						</Link>
					</section>
				</BookletPage>
			</main>
			<SiteFooter locale={locale} />
		</>
	);
}
