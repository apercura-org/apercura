import { BookletSearch, buttonStyles, EmptyState } from "@apercura/ui";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { BookletPage } from "~/components/booklet-page";
import { SiteFooter } from "~/components/site-footer";
import { SiteHeader } from "~/components/site-header";
import { getPathname, Link } from "~/i18n/navigation";
import { type Locale, routing } from "~/i18n/routing";

export async function generateMetadata({
	params,
}: PageProps<"/[locale]/recherche">): Promise<Metadata> {
	const { locale: requested } = await params;
	const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
	const t = await getTranslations({ locale, namespace: "Metadata" });
	return { title: t("searchTitle"), robots: { index: false } };
}

const first = (value: string | string[] | undefined) =>
	(Array.isArray(value) ? value[0] : value)?.trim().slice(0, 120) ?? "";

async function SearchForm({
	locale,
	searchParams,
}: {
	locale: Locale;
	searchParams?: PageProps<"/[locale]/recherche">["searchParams"];
}) {
	const tSearch = await getTranslations({ locale, namespace: "Search" });
	const params = searchParams ? await searchParams : {};
	return (
		<BookletSearch
			action={getPathname({ href: "/recherche", locale })}
			label={tSearch("label")}
			submitLabel={tSearch("submit")}
			fields={[
				{
					name: "quoi",
					label: tSearch("who"),
					hint: tSearch("whoHint"),
					defaultValue: first(params.quoi),
				},
				{
					name: "ou",
					label: tSearch("where"),
					hint: tSearch("whereHint"),
					defaultValue: first(params.ou),
					autoComplete: "address-level2",
				},
			]}
		/>
	);
}

async function QuerySummary({
	locale,
	searchParams,
}: {
	locale: Locale;
	searchParams: PageProps<"/[locale]/recherche">["searchParams"];
}) {
	const t = await getTranslations({ locale, namespace: "SearchPage" });
	const params = await searchParams;
	const who = first(params.quoi);
	const where = first(params.ou);
	if (!who && !where) {
		return null;
	}
	const text =
		who && where
			? t("queryWhere", { who, where })
			: who
				? t("query", { who })
				: t("queryOnlyWhere", { where });
	return <p className="text-lead text-ink">{text}</p>;
}

/** Placeholder until directory search lands: keeps the form working and says honestly that results are not there yet. */
export default async function SearchPage({
	params,
	searchParams,
}: PageProps<"/[locale]/recherche">) {
	const { locale: requested } = await params;
	const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "SearchPage" });
	const tSite = await getTranslations({ locale, namespace: "Site" });

	return (
		<>
			<div className="surface-cover">
				<SiteHeader locale={locale} pathname="/recherche" />
			</div>
			<main id="main" tabIndex={-1} className="flex-1 outline-none">
				<div className="surface-cover">
					<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 pt-8 pb-10 sm:px-8">
						<h1 className="font-display text-headline font-black tracking-[-0.02em] font-stretch-expanded">
							{t("title")}
						</h1>
						<Suspense fallback={<SearchForm locale={locale} />}>
							<SearchForm locale={locale} searchParams={searchParams} />
						</Suspense>
					</div>
				</div>
				{/* Results are paginated; this placeholder is the first results page. */}
				<BookletPage runningHead={tSite("runningHead")} folio={tSite("folio", { number: 1 })}>
					<div className="flex flex-col gap-5">
						<Suspense fallback={null}>
							<QuerySummary locale={locale} searchParams={searchParams} />
						</Suspense>
						<EmptyState
							title={t("emptyTitle")}
							description={t("emptyBody")}
							action={
								<Link href="/" className={buttonStyles({ intent: "ink" })}>
									{t("backHome")}
								</Link>
							}
						/>
					</div>
				</BookletPage>
			</main>
			<SiteFooter locale={locale} />
		</>
	);
}
