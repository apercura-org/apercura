import {
	BrandSeal,
	buttonStyles,
	FieldList,
	FieldRow,
	ProvenanceNote,
	tableStyles,
} from "@apercura/ui";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookletPage } from "~/components/booklet-page";
import { ClientIsland, SEARCH_FORM_MESSAGES } from "~/components/client-island";
import { PageGraph } from "~/components/page-graph";
import { SearchForm } from "~/components/search-form";
import { SiteFooter } from "~/components/site-footer";
import { SiteHeader } from "~/components/site-header";
import { SpecimenPage } from "~/components/specimen-page";
import { serverEnv } from "~/env";
import { getPathname, Link } from "~/i18n/navigation";
import { routing } from "~/i18n/routing";
import { LINKS } from "~/lib/links";
import { getPillars } from "~/lib/pillars";
import { BRAND, CONTENT_LANGUAGES, pageMetadata } from "~/lib/seo";
import { siteOrigin } from "~/lib/site-url";
import { siteNodes } from "~/lib/structured-data";
import { TRPCReactProvider } from "~/trpc/client";

/** National register figures supplied in PRODUCT.md (Annuaire Santé, 19 November 2026). */
const REGISTRY = {
	date: "2026-11-19",
	doctors: 401_691,
	dentists: 65_056,
	midwives: 32_436,
	withAddress: 311_000,
} as const;

const table = tableStyles();

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
	});
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
	const { locale: requested } = await params;
	const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
	setRequestLocale(locale);

	const t = await getTranslations({ locale, namespace: "HomePage" });
	const tSite = await getTranslations({ locale, namespace: "Site" });

	const tMeta = await getTranslations({ locale, namespace: "Metadata" });
	const origin = siteOrigin();
	const searchPath = getPathname({ href: "/recherche", locale });

	return (
		<>
			<PageGraph
				locale={locale}
				href="/"
				name={tMeta("homeTitle")}
				description={tMeta("description")}
				extra={siteNodes({
					origin,
					name: BRAND,
					description: tMeta("description"),
					language: CONTENT_LANGUAGES[locale],
					logo: `${origin}/icon/512`,
					// The search page reads `quoi`; a query naming a page answers a redirect to it.
					searchUrlTemplate: `${origin}${searchPath}?quoi={search_term_string}`,
					sameAs: [LINKS.repository],
				})}
			/>
			<div className="surface-cover">
				<SiteHeader locale={locale} href="/" showWordmark={false} />
			</div>
			<main id="main" tabIndex={-1} className="flex-1 outline-none">
				<div className="surface-cover flex min-h-[calc(60svh-3.5rem)] flex-col">
					<div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-end gap-7 px-5 pt-10 pb-10 sm:px-8 sm:pb-14">
						<div className="flex items-end justify-between gap-10">
							<div className="flex flex-col gap-4">
								<h1 className="font-display text-display font-black tracking-[-0.03em] font-stretch-expanded">
									{t("title")}
								</h1>
								<p className="max-w-[40ch] text-lead text-cover-ink sm:text-[1.625rem] sm:leading-snug">
									{t("hook")}
								</p>
							</div>
							{/* Apercura's own seal (brand seed, never an RPPS), printed in paper white on the cover. */}
							<BrandSeal size={208} className="hidden shrink-0 text-cover-ink md:block" />
						</div>
						<ClientIsland locale={locale} namespaces={SEARCH_FORM_MESSAGES}>
							<TRPCReactProvider>
								<SearchForm idPrefix="home-search" />
							</TRPCReactProvider>
						</ClientIsland>
					</div>
					<div aria-hidden="true" className="mx-auto w-full max-w-6xl px-5 sm:px-8">
						<div className="border-t-2 border-cover-rule pb-1" />
						<div className="border-t border-cover-rule pb-3" />
					</div>
				</div>

				<BookletPage runningHead={tSite("runningHead")} folio={tSite("folio", { number: 1 })}>
					<section aria-labelledby="specimen-heading" className="flex flex-col gap-5">
						<div className="flex max-w-[65ch] flex-col gap-2">
							<h2
								id="specimen-heading"
								className="font-display text-title font-bold text-ink font-stretch-semi-expanded"
							>
								{t("specimen.heading")}
							</h2>
							<p className="text-body text-ink">{t("specimen.intro")}</p>
						</div>
						<SpecimenPage locale={locale} />
					</section>

					<section aria-labelledby="pillars-heading" className="flex flex-col gap-5">
						<h2
							id="pillars-heading"
							className="font-display text-title font-bold text-ink font-stretch-semi-expanded"
						>
							{t("pillarsHeading")}
						</h2>
						<table className={table.table()} aria-labelledby="pillars-heading">
							<thead className={table.head()}>
								<tr>
									<th scope="col" className={table.column({ className: "w-16 sm:w-24" })}>
										{t("columns.number")}
									</th>
									<th scope="col" className={table.column()}>
										{t("columns.commitment")}
									</th>
								</tr>
							</thead>
							<tbody>
								{getPillars(serverEnv.PUBLIC_HDS_HOST).map((pillar, index) => (
									<tr key={pillar.key} className={table.row()}>
										<td
											className={table.cell({
												className: "py-5 font-display text-title font-extrabold tabular",
											})}
										>
											{index + 1}
										</td>
										<td className={table.cell({ className: "py-5" })}>
											<p className="font-display text-lead font-bold text-ink">
												{t(`pillars.${pillar.key}.title`)}
											</p>
											<p className="mt-1 max-w-[65ch] text-body text-ink">
												{pillar.key === "hostedInFrance"
													? t("pillars.hostedInFrance.description", { host: pillar.host })
													: t(`pillars.${pillar.key}.description`)}
											</p>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</section>

					<section
						aria-labelledby="registry-heading"
						className="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-12"
					>
						<div className="flex flex-col gap-3">
							<h2
								id="registry-heading"
								className="font-display text-title font-bold text-ink font-stretch-semi-expanded"
							>
								{t("registry.heading")}
							</h2>
							<p className="max-w-[60ch] text-body text-ink">{t("registry.intro")}</p>
						</div>
						<div className="flex flex-col gap-3">
							<FieldList>
								<FieldRow
									label={t("registry.doctors")}
									emptyLabel=""
									value={
										<span className="tabular">
											{t("registry.count", { count: REGISTRY.doctors })}
										</span>
									}
								/>
								<FieldRow
									label={t("registry.dentists")}
									emptyLabel=""
									value={
										<span className="tabular">
											{t("registry.count", { count: REGISTRY.dentists })}
										</span>
									}
								/>
								<FieldRow
									label={t("registry.midwives")}
									emptyLabel=""
									value={
										<span className="tabular">
											{t("registry.count", { count: REGISTRY.midwives })}
										</span>
									}
								/>
								<FieldRow
									label={t("registry.withAddress")}
									emptyLabel=""
									value={
										<span className="tabular">
											{t("registry.approxCount", { count: REGISTRY.withAddress })}
										</span>
									}
								/>
							</FieldList>
							<ProvenanceNote
								locale={locale}
								sourceLabel={t("registry.sourceLabel")}
								source={t("registry.sourceName")}
								updatedLabel={t("registry.updatedLabel")}
								updatedAt={REGISTRY.date}
							/>
						</div>
					</section>

					<section
						aria-labelledby="pro-heading"
						className="surface-cover flex flex-col gap-4 px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8"
					>
						<div className="flex flex-col gap-1">
							<h2
								id="pro-heading"
								className="font-display text-lead font-bold font-stretch-semi-expanded"
							>
								{t("pro.heading")}
							</h2>
							<p className="text-body text-cover-muted">{t("pro.body")}</p>
						</div>
						<Link href="/pro" className={buttonStyles({ intent: "cover", size: "lg" })}>
							{t("pro.cta")}
						</Link>
					</section>
				</BookletPage>
			</main>
			<SiteFooter locale={locale} />
		</>
	);
}
