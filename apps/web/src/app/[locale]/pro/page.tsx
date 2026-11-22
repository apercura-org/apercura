import { BookletSearch, tableStyles } from "@apercura/ui";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookletPage } from "~/components/booklet-page";
import { PageGraph } from "~/components/page-graph";
import { SiteFooter } from "~/components/site-footer";
import { SiteHeader } from "~/components/site-header";
import { SpecimenPage } from "~/components/specimen-page";
import { getPathname } from "~/i18n/navigation";
import { routing } from "~/i18n/routing";
import { pageMetadata } from "~/lib/seo";

const STEPS = ["find", "verify", "complete"] as const;

const table = tableStyles();

export async function generateMetadata({ params }: PageProps<"/[locale]/pro">): Promise<Metadata> {
	const { locale: requested } = await params;
	const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
	const t = await getTranslations({ locale, namespace: "Metadata" });
	return pageMetadata({
		locale,
		href: "/pro",
		title: t("proTitle"),
		description: t("proDescription"),
		indexable: true,
	});
}

export default async function ProPage({ params }: PageProps<"/[locale]/pro">) {
	const { locale: requested } = await params;
	const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
	setRequestLocale(locale);

	const t = await getTranslations({ locale, namespace: "ProPage" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const tMeta = await getTranslations({ locale, namespace: "Metadata" });

	return (
		<>
			<PageGraph
				locale={locale}
				href="/pro"
				name={tMeta("proTitle")}
				description={tMeta("proDescription")}
			/>
			<div className="surface-cover">
				<SiteHeader locale={locale} href="/pro" />
			</div>
			<main id="main" tabIndex={-1} className="flex-1 outline-none">
				<div className="surface-cover">
					<div className="mx-auto flex min-h-[calc(60svh-3.5rem)] w-full max-w-6xl flex-col justify-end gap-7 px-5 pt-12 pb-12 sm:px-8 sm:pb-14">
						<div className="flex flex-col gap-4">
							<h1 className="max-w-[18ch] font-display text-headline font-black tracking-[-0.02em] font-stretch-expanded sm:text-[clamp(2.75rem,1.5rem+3.5vw,4.5rem)]">
								{t("title")}
							</h1>
							<p className="max-w-[58ch] text-lead text-cover-ink">{t("lead")}</p>
						</div>
						<BookletSearch
							className="max-w-3xl"
							action={getPathname({ href: "/recherche", locale })}
							label={t("search.label")}
							submitLabel={t("search.submit")}
							fields={[{ name: "quoi", label: t("search.field"), hint: t("search.hint") }]}
						/>
					</div>
				</div>

				<BookletPage runningHead={tSite("runningHead")}>
					<section aria-labelledby="steps-heading" className="flex flex-col gap-5">
						<h2
							id="steps-heading"
							className="font-display text-title font-bold text-ink font-stretch-semi-expanded"
						>
							{t("stepsHeading")}
						</h2>
						<table className={table.table()} aria-labelledby="steps-heading">
							<thead className={table.head()}>
								<tr>
									<th scope="col" className={table.column({ className: "w-16 sm:w-24" })}>
										{t("columns.step")}
									</th>
									<th scope="col" className={table.column()}>
										{t("columns.what")}
									</th>
								</tr>
							</thead>
							<tbody>
								{STEPS.map((step, index) => (
									<tr key={step} className={table.row()}>
										<td
											className={table.cell({
												className: "py-5 font-display text-title font-extrabold tabular",
											})}
										>
											{index + 1}
										</td>
										<td className={table.cell({ className: "py-5" })}>
											<p className="font-display text-lead font-bold text-ink">
												{t(`steps.${step}.title`)}
											</p>
											<p className="mt-1 max-w-[65ch] text-body text-ink">
												{t(`steps.${step}.description`)}
											</p>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</section>

					<section aria-labelledby="sample-heading" className="flex flex-col gap-5">
						<div className="flex flex-col gap-1">
							<h2
								id="sample-heading"
								className="font-display text-title font-bold text-ink font-stretch-semi-expanded"
							>
								{t("sampleHeading")}
							</h2>
							<p className="text-meta text-ink-muted">{t("sampleNote")}</p>
						</div>
						<SpecimenPage locale={locale} />
					</section>

					<section aria-labelledby="facts-heading" className="flex max-w-[65ch] flex-col gap-3">
						<h2
							id="facts-heading"
							className="font-display text-title font-bold text-ink font-stretch-semi-expanded"
						>
							{t("factsHeading")}
						</h2>
						<p className="text-body text-ink">{t("facts")}</p>
					</section>
				</BookletPage>
			</main>
			<SiteFooter locale={locale} />
		</>
	);
}
