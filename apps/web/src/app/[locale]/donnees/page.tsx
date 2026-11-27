import { FieldList, FieldRow, tableStyles } from "@apercura/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookletPage } from "~/components/booklet-page";
import { ClientIsland, GDPR_MESSAGES } from "~/components/client-island";
import { RemovalForm, ReportForm } from "~/components/gdpr-forms";
import {
	ExternalLink,
	InstitutionalCover,
	type ProseContent,
	ProseSection,
} from "~/components/institutional";
import { DataAt } from "~/components/legal-at";
import { DataCh } from "~/components/legal-ch";
import { DataCz } from "~/components/legal-cz";
import { DataDe } from "~/components/legal-de";
import { DataEs } from "~/components/legal-es";
import { DataGb } from "~/components/legal-gb";
import { DataIt } from "~/components/legal-it";
import { PageGraph } from "~/components/page-graph";
import { PublicPage } from "~/components/public-page";
import { Trail } from "~/components/trail";
import { marketOf } from "~/i18n/locales";
import type { Locale } from "~/i18n/routing";
import { localeOf, marketInstitutionalMetadata } from "~/lib/institutional";
import { LINKS } from "~/lib/links";
import { getRegistryStatus, type RegistryFile } from "~/server/queries/registry";
import { TRPCReactProvider } from "~/trpc/client";

export const ensureStatic = "navigation";
/**
 * The response status (404, 308) is decided from the URL before anything
 * renders, so the page blocks on its params by design instead of streaming a
 * shell: a late notFound() inside Suspense would answer 200.
 */
export const instant = false;

const HREF = "/donnees" as const;

const table = tableStyles();

/** A table cell printed as a stacked row on narrow screens. */
const stacked = "max-md:block max-md:px-0 max-md:py-1";
/** The column name above a stacked value (the header row is visually hidden there). */
const cellLabel = "type-caption block text-ink md:hidden";

type SourceRow = {
	key: RegistryFile | "geo" | "geocoder" | "map";
	href: string;
	licence: "licenceOuverte" | "odbl";
};

/** The sources of the directory, in the order the import uses them. */
const SOURCES: SourceRow[] = [
	{ key: "personneActivite", href: LINKS.annuaireSante, licence: "licenceOuverte" },
	{ key: "savoirFaire", href: LINKS.annuaireSante, licence: "licenceOuverte" },
	{ key: "diplomes", href: LINKS.annuaireSante, licence: "licenceOuverte" },
	{ key: "finess", href: LINKS.finess, licence: "licenceOuverte" },
	{ key: "ameli", href: LINKS.ameli, licence: "licenceOuverte" },
	{ key: "geo", href: LINKS.geoApi, licence: "licenceOuverte" },
	{ key: "geocoder", href: LINKS.geocoder, licence: "licenceOuverte" },
	{ key: "map", href: LINKS.openStreetMap, licence: "odbl" },
];

const isFileKey = (key: SourceRow["key"]): key is RegistryFile =>
	key !== "geo" && key !== "geocoder" && key !== "map";

function formatDate(date: string, locale: Locale) {
	return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(
		new Date(`${date}T00:00:00Z`),
	);
}

export function generateMetadata({ params }: PageProps<"/[locale]/donnees">) {
	return marketInstitutionalMetadata(
		params,
		{
			FR: "DataPage",
			AT: "DataAt",
			GB: "DataGb",
			CZ: "DataCz",
			ES: "DataEs",
			IT: "DataIt",
			DE: "DataDe",
			CH: "DataCh",
		},
		HREF,
	);
}

export default async function DataPage({ params }: PageProps<"/[locale]/donnees">) {
	const locale = await localeOf(params);
	setRequestLocale(locale);
	// Austria's, the UK's, Czechia's, Spain's, Italy's and Germany's pages have texts of their own,
	// written for their law.
	if (marketOf(locale) === "AT") return <DataAt locale={locale} />;
	if (marketOf(locale) === "GB") return <DataGb locale={locale} />;
	if (marketOf(locale) === "CZ") return <DataCz locale={locale} />;
	if (marketOf(locale) === "ES") return <DataEs locale={locale} />;
	if (marketOf(locale) === "IT") return <DataIt locale={locale} />;
	if (marketOf(locale) === "DE") return <DataDe locale={locale} />;
	if (marketOf(locale) === "CH") return <DataCh locale={locale} />;
	const t = await getTranslations({ locale, namespace: "DataPage" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const registry = await getRegistryStatus();
	const external = tSite("externalLink");
	const date = (value: string | undefined) => (value ? formatDate(value, locale) : null);

	return (
		<PublicPage locale={locale} href={HREF}>
			<InstitutionalCover title={t("title")} lead={t("lead")} />
			<BookletPage>
				<PageGraph
					locale={locale}
					href={HREF}
					name={t("title")}
					trail={[{ label: t("title"), href: HREF }]}
				/>
				<Trail locale={locale} items={[{ label: t("title"), href: HREF }]} />

				<ProseSection
					id="mise-a-jour"
					content={{ heading: t("status.heading"), body: [t("status.body")] }}
				>
					<FieldList>
						<FieldRow
							label={t("status.importedAt")}
							value={
								registry ? (
									<time dateTime={registry.importedAt}>{date(registry.importedAt)}</time>
								) : null
							}
							emptyLabel={t("status.notImportedValue")}
						/>
						<FieldRow
							label={t("status.checkedAt")}
							value={
								registry ? (
									<time dateTime={registry.checkedAt}>{date(registry.checkedAt)}</time>
								) : null
							}
							emptyLabel={t("status.notImportedValue")}
						/>
					</FieldList>
					{registry ? null : <p className="text-body text-ink-muted">{t("status.notImported")}</p>}
				</ProseSection>

				<section
					aria-labelledby="sources-heading"
					className="flex min-w-0 flex-col gap-5 border-t border-rule-soft pt-6"
				>
					<div className="flex max-w-[65ch] flex-col gap-2">
						<h2 id="sources-heading" className="type-title text-ink">
							{t("sources.heading")}
						</h2>
						<p className="text-body text-ink">{t("sources.body")}</p>
					</div>
					{/* Below 768 px each source stacks as label-over-value rows: the page never scrolls sideways. */}
					<div>
						<table className={table.table({ className: "max-md:block" })}>
							<caption className="sr-only">{t("sources.caption")}</caption>
							<thead className={table.head({ className: "max-md:sr-only" })}>
								<tr>
									<th scope="col" className={table.column()}>
										{t("sources.columns.source")}
									</th>
									<th scope="col" className={table.column()}>
										{t("sources.columns.use")}
									</th>
									<th scope="col" className={table.column()}>
										{t("sources.columns.licence")}
									</th>
									<th scope="col" className={table.column()}>
										{t("sources.columns.date")}
									</th>
								</tr>
							</thead>
							<tbody className="max-md:block">
								{SOURCES.map((source) => {
									const fileDate = isFileKey(source.key) ? registry?.files[source.key] : undefined;
									return (
										<tr
											key={source.key}
											className={table.row({ className: "max-md:block max-md:py-3" })}
										>
											<th
												scope="row"
												className={table.cell({ className: `text-left font-normal ${stacked}` })}
											>
												<ExternalLink href={source.href} externalLabel={external}>
													{t(`sources.items.${source.key}.name`)}
												</ExternalLink>
												<span className="block text-meta text-ink-muted">
													{t(`sources.items.${source.key}.producer`)}
												</span>
											</th>
											<td className={table.cell({ className: stacked })}>
												<span className={cellLabel}>{t("sources.columns.use")}</span>
												{t(`sources.items.${source.key}.use`)}
											</td>
											<td className={table.cell({ className: stacked })}>
												<span className={cellLabel}>{t("sources.columns.licence")}</span>
												<ExternalLink
													href={source.licence === "odbl" ? LINKS.odbl : LINKS.licenceOuverte}
													externalLabel={external}
												>
													{t(`sources.${source.licence}`)}
												</ExternalLink>
											</td>
											<td
												className={table.cell({
													className: `tabular whitespace-nowrap ${stacked}`,
												})}
											>
												<span className={cellLabel}>{t("sources.columns.date")}</span>
												{fileDate ? (
													<time dateTime={fileDate}>{date(fileDate)}</time>
												) : (
													<span className="text-ink-muted">{t("sources.noDate")}</span>
												)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
					<p className="max-w-[65ch] border-t border-rule-soft pt-3 text-meta text-ink-muted">
						<span className="type-caption me-1.5 text-ink">{t("sources.sourceLabel")}</span>
						{t("sources.attribution")}{" "}
						<ExternalLink href={LINKS.licenceOuverte} externalLabel={external}>
							{t("sources.licenceLink")}
						</ExternalLink>
					</p>
				</section>

				<ProseSection
					id="pages"
					content={(t.raw as (key: string) => unknown)("rules") as ProseContent}
				/>

				<ProseSection
					id="corriger"
					content={{
						heading: t("correct.heading"),
						body: t.raw("correct.body") as string[],
						list: t.raw("correct.list") as string[],
					}}
				>
					<div className="flex flex-col gap-4">
						<h3 className="type-subtitle text-ink">{t("correct.formTitle")}</h3>
						<p className="max-w-[65ch] text-body text-ink">{t("correct.formBody")}</p>
						<ClientIsland locale={locale} namespaces={GDPR_MESSAGES}>
							<TRPCReactProvider>
								<ReportForm />
							</TRPCReactProvider>
						</ClientIsland>
					</div>
				</ProseSection>

				<ProseSection
					id="retrait"
					content={{ heading: t("remove.heading"), body: t.raw("remove.body") as string[] }}
				>
					<div className="flex flex-col gap-4">
						<h3 className="type-subtitle text-ink">{t("remove.formTitle")}</h3>
						<p className="max-w-[65ch] text-body text-ink">{t("remove.formBody")}</p>
						<ClientIsland locale={locale} namespaces={GDPR_MESSAGES}>
							<TRPCReactProvider>
								<RemovalForm />
							</TRPCReactProvider>
						</ClientIsland>
					</div>
				</ProseSection>
			</BookletPage>
		</PublicPage>
	);
}
