import { buttonStyles, FieldList, FieldRow, ProvenanceNote } from "@apercura/ui";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookletPage } from "~/components/booklet-page";
import { HomeSearch } from "~/components/home-search";
import { PageGraph } from "~/components/page-graph";
import { SiteFooter } from "~/components/site-footer";
import { SiteHeader } from "~/components/site-header";
import { SpecimenPage } from "~/components/specimen-page";
import { serverEnv } from "~/env";
import { Link } from "~/i18n/navigation";
import { routing } from "~/i18n/routing";
import { getPillars } from "~/lib/pillars";
import { homeAlternates, pageMetadata } from "~/lib/seo";
import { apercuraSiteNodes } from "~/lib/site-entities";
import { getRegistryFigures } from "~/server/queries/registry";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
	const { locale: requested } = await params;
	const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
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
	// Live from the directory; left out before the first import.
	const figures = await getRegistryFigures();

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
				<div className="surface-shade border-b border-rule-soft">
					<div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 pt-12 pb-12 sm:px-8 sm:pt-20 sm:pb-16">
						<div className="flex max-w-3xl flex-col gap-4">
							<h1 className="type-display">{t("title")}</h1>
							<p className="max-w-[46ch] text-lead text-ink-muted sm:text-[1.375rem] sm:leading-snug">
								{t("hook")}
							</p>
						</div>
						<HomeSearch locale={locale} idPrefix="home-search" />
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

					<section aria-labelledby="pillars-heading" className="flex flex-col gap-5">
						<h2 id="pillars-heading" className="type-title text-ink">
							{t("pillarsHeading")}
						</h2>
						<ol className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
							{getPillars(serverEnv.PUBLIC_HDS_HOST).map((pillar) => (
								<li
									key={pillar.key}
									className="flex flex-col gap-2 border-t border-field-edge pt-4"
								>
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

					{figures ? (
						<section
							aria-labelledby="registry-heading"
							className="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-12"
						>
							<div className="flex flex-col gap-3">
								<h2 id="registry-heading" className="type-title text-ink">
									{t("registry.heading")}
								</h2>
								<p className="max-w-[60ch] text-body text-ink">{t("registry.intro")}</p>
							</div>
							<div className="flex flex-col gap-3">
								<FieldList>
									{figures.professions.map((profession) => (
										<FieldRow
											key={profession.key}
											label={t(`registry.${profession.key}`)}
											emptyLabel=""
											value={
												<span className="tabular">
													{t("registry.count", { count: profession.count })}
												</span>
											}
										/>
									))}
									<FieldRow
										label={t("registry.withAddress")}
										emptyLabel=""
										value={
											<span className="tabular">
												{t("registry.count", { count: figures.withAddress })}
											</span>
										}
									/>
								</FieldList>
								<ProvenanceNote
									locale={locale}
									sourceLabel={t("registry.sourceLabel")}
									source={t("registry.sourceName")}
									updatedLabel={t("registry.updatedLabel")}
									updatedAt={figures.importedAt}
								/>
							</div>
						</section>
					) : null}

					<section
						aria-labelledby="pro-heading"
						className="surface-shade flex flex-col gap-4 rounded-panel border border-rule-soft px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8"
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
