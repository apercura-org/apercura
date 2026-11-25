import { austria, unitedKingdom } from "@apercura/core/country";
import {
	AT_DENTIST,
	AT_DOCTOR,
	GB_DENTAL_PRACTICE,
	GB_GP_PRACTICE,
	GB_PHARMACY,
} from "@apercura/core/taxonomy";
import { buttonStyles, FieldList, FieldRow, ProvenanceNote } from "@apercura/ui";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookletPage } from "~/components/booklet-page";
import { HomeSearch } from "~/components/home-search";
import { CountLinks } from "~/components/listing";
import { PageGraph } from "~/components/page-graph";
import { SiteFooter } from "~/components/site-footer";
import { SiteHeader } from "~/components/site-header";
import { SpecimenPage } from "~/components/specimen-page";
import { serverEnv } from "~/env";
import { marketOf } from "~/i18n/locales";
import { Link } from "~/i18n/navigation";
import { type Locale, routing } from "~/i18n/routing";
import { getTaxonomyLabels } from "~/lib/labels";
import { getPillars, type Pillar } from "~/lib/pillars";
import { homeAlternates, pageMetadata } from "~/lib/seo";
import { apercuraSiteNodes } from "~/lib/site-entities";
import { getDirectoryIndex, getMarketOverview } from "~/server/queries/hubs";
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
	// Austria and the UK: a directory from open lists, without booking or the French registry.
	const market = marketOf(locale);
	const austrian = market !== "FR";
	const pillars: Pillar[] = austrian
		? [{ key: "free" }, { key: "openSource" }, { key: "selfHostable" }]
		: getPillars(serverEnv.PUBLIC_HDS_HOST);
	// Live from the directory; left out before the first import.
	const figures = austrian ? null : await getRegistryFigures();

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
					{austrian ? (
						<MarketDirectory locale={locale} />
					) : (
						<section aria-labelledby="specimen-heading" className="flex flex-col gap-5">
							<div className="flex max-w-[65ch] flex-col gap-2">
								<h2 id="specimen-heading" className="type-title text-ink">
									{t("specimen.heading")}
								</h2>
								<p className="text-body text-ink">{t("specimen.intro")}</p>
							</div>
							<SpecimenPage locale={locale} />
						</section>
					)}

					<section aria-labelledby="pillars-heading" className="flex flex-col gap-5">
						<h2 id="pillars-heading" className="type-title text-ink">
							{t("pillarsHeading")}
						</h2>
						<ol className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
							{pillars.map((pillar) => (
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

					{austrian ? <OpenDataRegistry locale={locale} /> : null}
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

/**
 * The home of a market opened from open lists: its largest listings and its places, from the
 * read models. Austria lists its Bundesländer; the UK its regions and nations, each a hub.
 */
async function MarketDirectory({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "HomePage" });
	const labels = await getTaxonomyLabels(locale);
	const country = marketOf(locale);
	const [overview, index] = await Promise.all([
		getMarketOverview(country),
		getDirectoryIndex(country),
	]);
	const states =
		country === "GB"
			? index.regions
					.filter((region) => region.slug)
					.map((region) => ({
						id: region.code,
						name: region.name,
						slug: region.slug,
						practitionerCount: region.departments.reduce(
							(sum, department) => sum + department.practitionerCount,
							0,
						),
					}))
			: index.regions.flatMap((region) => region.departments);
	if (overview.listings.length === 0 && states.length === 0) return null;
	return (
		<>
			{overview.listings.length > 0 ? (
				<section aria-labelledby="listings-heading" className="flex flex-col gap-4">
					<h2 id="listings-heading" className="type-title text-ink">
						{t("market.listingsHeading")}
					</h2>
					<CountLinks
						locale={locale}
						items={overview.listings.map((listing) => ({
							key: listing.listingSlug,
							label: labels.listing(listing.listingSlug) ?? listing.listingSlug,
							href: { pathname: "/[specialite]", params: { specialite: listing.listingSlug } },
							count: listing.practitionerCount,
						}))}
					/>
				</section>
			) : null}
			{states.length > 0 ? (
				<section aria-labelledby="places-heading" className="flex flex-col gap-4">
					<h2 id="places-heading" className="type-title text-ink">
						{t("market.placesHeading")}
					</h2>
					<CountLinks
						locale={locale}
						items={states.map((state) => ({
							key: state.id,
							label: state.name,
							href: { pathname: "/annuaire/[dept]", params: { dept: state.slug } },
							count: state.practitionerCount,
						}))}
					/>
				</section>
			) : null}
		</>
	);
}

/**
 * The sources and figures of a market opened from open lists: pages by profession (Austria's
 * doctors and dentists, the UK's GP practices, dental practices and pharmacies) and the lists.
 */
async function OpenDataRegistry({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "HomePage" });
	const labels = await getTaxonomyLabels(locale);
	const country = marketOf(locale);
	const overview = await getMarketOverview(country);
	const countOf = (code: string) =>
		overview.professions.find((row) => row.professionCode === code)?.practitionerCount ?? 0;
	const adapter = country === "GB" ? unitedKingdom : austria;
	const sources = [
		...new Set(
			adapter.registries
				.filter((registry) => registry.provides.includes("practitioners"))
				// The UK's eight lists come from three publishers: named by publisher.
				.map((registry) => (country === "GB" ? registry.publisher : registry.name)),
		),
	].join(country === "GB" ? "; " : ", ");
	const rows =
		country === "GB"
			? [GB_GP_PRACTICE, GB_DENTAL_PRACTICE, GB_PHARMACY].map((code) => ({
					code,
					label: labels.listing(unitedKingdom.taxonomy.listingSlugFor(code, null)) ?? code,
				}))
			: [
					{ code: AT_DOCTOR, label: t("registry.doctors") },
					{ code: AT_DENTIST, label: t("registry.dentists") },
				];
	return (
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
					{rows.map((row) => (
						<FieldRow
							key={row.code}
							label={row.label}
							emptyLabel=""
							value={
								<span className="tabular">{t("registry.count", { count: countOf(row.code) })}</span>
							}
						/>
					))}
				</FieldList>
				{overview.updatedAt ? (
					<ProvenanceNote
						locale={locale}
						sourceLabel={t("registry.sourceLabel")}
						source={sources}
						updatedLabel={t("registry.updatedLabel")}
						updatedAt={overview.updatedAt}
					/>
				) : null}
			</div>
		</section>
	);
}
