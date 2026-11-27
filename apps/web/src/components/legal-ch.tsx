import { type RegistrySource, switzerland } from "@apercura/core/country";
import { CH_DEFAULT_PROFESSIONS } from "@apercura/core/taxonomy";
import { FieldList, FieldRow, linkStyles, tableStyles } from "@apercura/ui";
import { getFormatter, getTranslations } from "next-intl/server";
import { BookletPage } from "~/components/booklet-page";
import { ClientIsland, GDPR_MESSAGES } from "~/components/client-island";
import { RemovalForm, ReportForm } from "~/components/gdpr-forms";
import {
	ExternalLink,
	InstitutionalCover,
	LegalFactRow,
	type ProseContent,
	ProseSection,
} from "~/components/institutional";
import { PageGraph } from "~/components/page-graph";
import { PublicPage } from "~/components/public-page";
import { Trail } from "~/components/trail";
import { serverEnv } from "~/env";
import { getPathname, Link } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { proseSections } from "~/lib/institutional";
import {
	ACCESSIBILITY_STATEMENT_DATE,
	LEGAL_TEXTS_REVIEWED,
	type LegalValue,
	legalFacts,
	publisherVatId,
} from "~/lib/legal";
import { LINKS } from "~/lib/links";
import { swissAttribution } from "~/lib/market";
import { getImportStatus } from "~/server/queries/registry";
import { TRPCReactProvider } from "~/trpc/client";

/*
 * The institutional pages of the Swiss market, in its three languages (`/ch`, `/ch-fr`,
 * `/ch-it`: the impressum, the privacy notice, the terms, the accessibility statement and the
 * data page), written for Swiss law: the Impressum gives the identity and contact address
 * article 3(1)(s) of the Federal Act against Unfair Competition (UWG) asks of a provider of
 * online services; the privacy notice follows the revised Federal Act on Data Protection (DSG,
 * in force since 1 September 2023) and its ordinance (DSV), with a section on the GDPR, which
 * also applies to the provider. They print the same `LEGAL_*` facts, with the same `{{…}}`
 * placeholders while one is unknown; the hosting provider appears among the processors of the
 * privacy page, never with a location.
 */

const actionLink = `${linkStyles()} inline-flex min-h-11 items-center text-body font-semibold`;

/** The Federal Data Protection and Information Commissioner (EDÖB, PFPDT, IFPDT). */
const FDPIC = "https://www.edoeb.admin.ch";

/** The terms of use of opendata.swiss, in a page language. */
const openDataTerms = (language: ChLanguage) => `https://opendata.swiss/${language}/terms-of-use`;

type ChHref =
	| "/mentions-legales"
	| "/confidentialite"
	| "/conditions"
	| "/accessibilite"
	| "/donnees";

/** The three languages of the Swiss pages. */
type ChLanguage = "de" | "fr" | "it";

/** The language of a Swiss locale (`de-CH` → `de`, `fr-CH` → `fr`, `it-CH` → `it`). */
function chLanguage(locale: Locale): ChLanguage {
	const language = locale.slice(0, 2);
	return language === "fr" || language === "it" ? language : "de";
}

/** The lists published in French only, whose attribution is French in every page language. */
const FRENCH_SOURCES: ReadonlySet<string> = new Set([
	"ch-ge-hopitaux",
	"ch-ge-ems",
	"ch-ge-pharmacies",
	"ch-ju-institutions",
]);

/**
 * The attribution of a Swiss source, word for word (`swissAttribution`: SITG's dated by the day
 * of the last Swiss import), with the language it is written in: the page's when its publisher
 * words it in that language, else the language of the list.
 */
function chAttribution(
	source: RegistrySource,
	language: ChLanguage,
	importedAt: string | null,
): { text: string; lang: string } | null {
	const text = swissAttribution(source.id, language, importedAt);
	if (!text) return null;
	const own = Boolean(source.attributions?.[language]);
	return { text, lang: own ? language : FRENCH_SOURCES.has(source.id) ? "fr" : "de" };
}

type LicenceKey = "termsBy" | "termsOpen" | "ccBy" | "sitg" | "swisstopo";

/** The licence a source is reused under, by its licence's text. */
function licenceKey(source: RegistrySource): LicenceKey {
	const url = source.licenceUrl ? new URL(source.licenceUrl) : null;
	const host = url?.hostname ?? "";
	if (host === "creativecommons.org") return "ccBy";
	if (host === "sitg.ge.ch") return "sitg";
	if (host === "www.swisstopo.admin.ch") return "swisstopo";
	if (url?.hash === "#terms_by") return "termsBy";
	return "termsOpen";
}

/** The shared frame: cover (with the draft mark until the legal review), booklet, trail. */
async function ChFrame({
	locale,
	href,
	title,
	lead,
	mark,
	note,
	children,
}: {
	locale: Locale;
	href: ChHref;
	title: string;
	lead: string;
	mark?: string;
	note?: string | null;
	children: React.ReactNode;
}) {
	return (
		<PublicPage locale={locale} href={href}>
			<InstitutionalCover title={title} lead={lead} mark={mark} note={note} />
			<BookletPage>
				<PageGraph locale={locale} href={href} name={title} trail={[{ label: title, href }]} />
				<Trail locale={locale} items={[{ label: title, href }]} />
				{children}
			</BookletPage>
		</PublicPage>
	);
}

/** A configured date in the locale's long form, or its placeholder. */
async function longDate(locale: Locale, fact: LegalValue): Promise<LegalValue> {
	if (fact.missing) return fact;
	const format = await getFormatter({ locale });
	return {
		value: format.dateTime(new Date(`${fact.value}T12:00:00Z`), { dateStyle: "long" }),
		missing: false,
	};
}

/** Every source with its publisher and its attribution, word for word. */
async function SourceAttributions({ locale }: { locale: Locale }) {
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const external = tSite("externalLink");
	const status = await getImportStatus("ch");
	const language = chLanguage(locale);
	return (
		<ul className="flex flex-col gap-3 border-t border-rule-soft pt-3">
			{switzerland.registries.map((source) => {
				const attribution = chAttribution(source, language, status?.importedAt ?? null);
				return (
					<li key={source.id} className="flex flex-col gap-1 text-body text-ink">
						<ExternalLink href={source.url} externalLabel={external}>
							{source.name}
						</ExternalLink>
						<span className="text-meta text-ink-muted">{source.publisher}</span>
						{attribution ? (
							<span
								data-attribution={source.id}
								className="text-meta text-ink"
								lang={attribution.lang}
							>
								{attribution.text}
							</span>
						) : null}
					</li>
				);
			})}
		</ul>
	);
}

/** Impressum: the provider's identity and contact address (UWG, article 3(1)(s)). */
export async function LegalNoticeCh({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "LegalNoticeCh" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const section = await proseSections(locale, "LegalNoticeCh");
	const facts = legalFacts(serverEnv);
	const vatId = publisherVatId(serverEnv);
	const tbc = tI("toBeCompleted");
	const shown = [
		facts.publisherName,
		facts.publisherLegalForm,
		facts.publisherAddress,
		facts.publisherPhone,
		facts.contactEmail,
		facts.publisherRegistration,
		facts.publicationDirector,
	];
	return (
		<ChFrame
			locale={locale}
			href="/mentions-legales"
			title={t("title")}
			lead={t("lead")}
			mark={LEGAL_TEXTS_REVIEWED ? undefined : tI("legalDraftMark")}
			note={shown.some((fact) => fact.missing) ? tI("placeholderNote") : null}
		>
			<ProseSection id="provider" content={section("provider")}>
				<FieldList>
					<LegalFactRow label={t("fields.name")} fact={facts.publisherName} emptyLabel={tbc} />
					<LegalFactRow
						label={t("fields.legalForm")}
						fact={facts.publisherLegalForm}
						emptyLabel={tbc}
					/>
					<LegalFactRow
						label={t("fields.address")}
						fact={facts.publisherAddress}
						emptyLabel={tbc}
					/>
					<LegalFactRow label={t("fields.phone")} fact={facts.publisherPhone} emptyLabel={tbc} />
					<LegalFactRow
						label={t("fields.email")}
						fact={facts.contactEmail}
						email
						emptyLabel={tbc}
					/>
					<LegalFactRow
						label={t("fields.registration")}
						fact={facts.publisherRegistration}
						emptyLabel={tbc}
					/>
					{vatId ? <FieldRow label={t("fields.vatId")} value={vatId} emptyLabel={tbc} /> : null}
				</FieldList>
			</ProseSection>
			<ProseSection id="service" content={section("service")} />
			<ProseSection id="editor" content={section("editor")}>
				<FieldList>
					<LegalFactRow
						label={t("fields.editor")}
						fact={facts.publicationDirector}
						emptyLabel={tbc}
					/>
				</FieldList>
			</ProseSection>
			<ProseSection id="content" content={section("liability")} />
			<ProseSection id="code-and-data" content={section("ip")}>
				<Link href="/donnees" className={actionLink}>
					{t("dataLink")}
				</Link>
			</ProseSection>
			{LEGAL_TEXTS_REVIEWED ? null : <ProseSection id="status" content={section("review")} />}
		</ChFrame>
	);
}

/**
 * Privacy notice under the revised Federal Act on Data Protection: the duty to inform (articles
 * 19 and 20, the data not being collected from the facilities), the principles and overriding
 * interests (articles 6 and 31), disclosure abroad (articles 16 and 17), the rights (articles 25,
 * 28 and 32) and objection (articles 30(2)(b) and 32(2)), the cookies of article 45c of the
 * Telecommunications Act, and the GDPR's articles 13, 14 and 21, which also bind the provider.
 */
export async function PrivacyCh({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "PrivacyCh" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const section = await proseSections(locale, "PrivacyCh");
	const facts = legalFacts(serverEnv);
	const tbc = tI("toBeCompleted");
	const effectiveDate = await longDate(locale, facts.effectiveDate);
	const shown = [
		facts.publisherName,
		facts.publisherAddress,
		facts.contactEmail,
		facts.dpoContact,
		facts.effectiveDate,
		facts.hostName,
		facts.smtpProvider,
	];
	return (
		<ChFrame
			locale={locale}
			href="/confidentialite"
			title={t("title")}
			lead={t("lead")}
			mark={LEGAL_TEXTS_REVIEWED ? undefined : tI("legalDraftMark")}
			note={shown.some((fact) => fact.missing) ? tI("placeholderNote") : null}
		>
			<ProseSection id="controller" content={section("controller")}>
				<FieldList>
					<LegalFactRow
						label={t("fields.controller")}
						fact={facts.publisherName}
						emptyLabel={tbc}
					/>
					<LegalFactRow
						label={t("fields.address")}
						fact={facts.publisherAddress}
						emptyLabel={tbc}
					/>
					<LegalFactRow
						label={t("fields.email")}
						fact={facts.contactEmail}
						email
						emptyLabel={tbc}
					/>
					<LegalFactRow label={t("fields.dpo")} fact={facts.dpoContact} emptyLabel={tbc} />
					<LegalFactRow label={t("fields.effectiveDate")} fact={effectiveDate} emptyLabel={tbc} />
				</FieldList>
			</ProseSection>
			<ProseSection id="law" content={section("law")} />
			<ProseSection id="directory" content={section("directory")} />
			<ProseSection id="people" content={section("people")} />
			<ProseSection id="sources" content={section("sources")}>
				<SourceAttributions locale={locale} />
			</ProseSection>
			<ProseSection id="grounds" content={section("grounds")} />
			<ProseSection id="information" content={section("information")} />
			<ProseSection id="objection" content={section("objection")}>
				<a href={`${getPathname({ href: "/donnees", locale })}#remove`} className={actionLink}>
					{t("objectLink")}
				</a>
			</ProseSection>
			<ProseSection id="accounts" content={section("accounts")} />
			<ProseSection id="requests" content={section("requests")} />
			<ProseSection id="technical" content={section("technical")} />
			<ProseSection id="recipients" content={section("recipients")}>
				<FieldList>
					<LegalFactRow
						label={t("fields.hostingProvider")}
						fact={facts.hostName}
						emptyLabel={tbc}
					/>
					<LegalFactRow label={t("fields.smtp")} fact={facts.smtpProvider} emptyLabel={tbc} />
				</FieldList>
			</ProseSection>
			<ProseSection id="abroad" content={section("abroad")} />
			<ProseSection id="automated" content={section("automated")} />
			<ProseSection id="rights" content={section("rights")}>
				<FieldList>
					<LegalFactRow
						label={t("fields.email")}
						fact={facts.contactEmail}
						email
						emptyLabel={tbc}
					/>
				</FieldList>
				<ExternalLink
					href={FDPIC}
					externalLabel={tSite("externalLink")}
					className="inline-flex min-h-11 items-center text-body font-semibold"
				>
					{t("authorityLink")}
				</ExternalLink>
			</ProseSection>
			<ProseSection id="gdpr" content={section("gdpr")} />
			<ProseSection id="changes" content={section("changes")} />
		</ChFrame>
	);
}

/** Terms of use: a directory of facilities only, no booking in Switzerland. */
export async function TermsCh({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "TermsCh" });
	const tData = await getTranslations({ locale, namespace: "DataCh" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const section = await proseSections(locale, "TermsCh");
	const facts = legalFacts(serverEnv);
	const tbc = tI("toBeCompleted");
	const effectiveDate = await longDate(locale, facts.effectiveDate);
	const shown = [facts.publisherName, facts.effectiveDate, facts.contactEmail];
	return (
		<ChFrame
			locale={locale}
			href="/conditions"
			title={t("title")}
			lead={t("lead")}
			mark={LEGAL_TEXTS_REVIEWED ? undefined : tI("legalDraftMark")}
			note={shown.some((fact) => fact.missing) ? tI("placeholderNote") : null}
		>
			<ProseSection id="service" content={section("service")}>
				<FieldList>
					<LegalFactRow label={t("fields.publisher")} fact={facts.publisherName} emptyLabel={tbc} />
					<LegalFactRow label={t("fields.effectiveDate")} fact={effectiveDate} emptyLabel={tbc} />
				</FieldList>
			</ProseSection>
			<ProseSection id="content" content={section("content")} />
			<ProseSection id="health" content={section("health")} />
			<ProseSection id="practices" content={section("practices")} />
			<ProseSection id="removal" content={section("removal")}>
				<Link href="/donnees" className={actionLink}>
					{tData("title")}
				</Link>
			</ProseSection>
			<ProseSection id="liability" content={section("liability")} />
			<ProseSection id="code-and-data" content={section("ip")} />
			<ProseSection id="law" content={section("law")}>
				<FieldList>
					<LegalFactRow
						label={t("fields.contact")}
						fact={facts.contactEmail}
						email
						emptyLabel={tbc}
					/>
				</FieldList>
			</ProseSection>
		</ChFrame>
	);
}

/**
 * Accessibility statement: voluntary (the Disability Discrimination Act, BehiG, binds the
 * Confederation's own services, not private websites), aiming at eCH-0059 and WCAG 2.2 AA.
 */
export async function AccessibilityCh({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "AccessibilityCh" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const format = await getFormatter({ locale });
	const section = await proseSections(locale, "AccessibilityCh");
	const facts = legalFacts(serverEnv);
	const tbc = tI("toBeCompleted");
	const statementDate = format.dateTime(new Date(`${ACCESSIBILITY_STATEMENT_DATE}T12:00:00Z`), {
		dateStyle: "long",
	});
	return (
		<ChFrame
			locale={locale}
			href="/accessibilite"
			title={t("title")}
			lead={t("lead")}
			mark={tI("auditMark")}
			note={facts.contactEmail.missing ? tI("placeholderNote") : null}
		>
			<ProseSection id="scope" content={section("scope")} />
			<ProseSection id="status" content={section("status")}>
				<FieldList>
					<FieldRow
						label={t("fields.date")}
						value={<time dateTime={ACCESSIBILITY_STATEMENT_DATE}>{statementDate}</time>}
						emptyLabel={tbc}
					/>
				</FieldList>
			</ProseSection>
			<ProseSection id="tests" content={section("tests")} />
			<ProseSection id="pending" content={section("pending")} />
			<ProseSection id="feedback" content={section("feedback")}>
				<FieldList>
					<LegalFactRow
						label={t("fields.contact")}
						fact={facts.contactEmail}
						email
						emptyLabel={tbc}
					/>
				</FieldList>
			</ProseSection>
		</ChFrame>
	);
}

const table = tableStyles();
/** A table cell printed as a stacked row on narrow screens. */
const stacked = "max-md:block max-md:px-0 max-md:py-1";
/** The column name above a stacked value (the header row is visually hidden there). */
const cellLabel = "caps block text-ink md:hidden";

/**
 * Data and sources: the FOPH's hospital figures, the cantons' lists and the places of the
 * Federal Statistical Office and swisstopo, with licence, attribution and rhythm; what each
 * canton's lists cover, what is not imported and why, the fields never read, and how a facility
 * is placed.
 */
export async function DataCh({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "DataCh" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const format = await getFormatter({ locale });
	const status = await getImportStatus("ch");
	const language = chLanguage(locale);
	const external = tSite("externalLink");
	const date = (value: string) =>
		format.dateTime(new Date(`${value}T00:00:00Z`), { dateStyle: "long", timeZone: "UTC" });
	type Row = {
		key: string;
		name: string;
		publisher: string;
		href: string;
		licence: string;
		licenceHref: string;
		attribution: { text: string; lang: string } | null;
	};
	const rows: Row[] = [
		...switzerland.registries.map((source) => ({
			key: source.id,
			name: source.name,
			publisher: source.publisher,
			href: source.url,
			licence: t(`sources.licences.${licenceKey(source)}`),
			licenceHref: source.licenceUrl ?? openDataTerms(language),
			attribution: chAttribution(source, language, status?.importedAt ?? null),
		})),
		{
			key: "map",
			name: t("sources.items.map.name"),
			publisher: t("sources.items.map.publisher"),
			href: LINKS.openStreetMap,
			licence: t("sources.licences.odbl"),
			licenceHref: LINKS.odbl,
			attribution: null,
		},
	];
	const item = (key: string, field: "use" | "frequency") =>
		t(`sources.items.${key as "ch-bag-kzp"}.${field}`);
	const raw = t.raw as (key: string) => unknown;

	return (
		<ChFrame locale={locale} href="/donnees" title={t("title")} lead={t("lead")}>
			<ProseSection
				id="updates"
				content={{ heading: t("status.heading"), body: [t("status.body")] }}
			>
				<FieldList>
					<FieldRow
						label={t("status.importedAt")}
						value={
							status ? <time dateTime={status.importedAt}>{date(status.importedAt)}</time> : null
						}
						emptyLabel={t("status.notImportedValue")}
					/>
					<FieldRow
						label={t("status.checkedAt")}
						value={
							status ? <time dateTime={status.checkedAt}>{date(status.checkedAt)}</time> : null
						}
						emptyLabel={t("status.notImportedValue")}
					/>
				</FieldList>
				{status ? null : <p className="text-body text-ink-muted">{t("status.notImported")}</p>}
			</ProseSection>

			<section
				aria-labelledby="sources-heading"
				className="flex min-w-0 flex-col gap-5 border-t border-ink pt-6"
			>
				<div className="flex max-w-[65ch] flex-col gap-2">
					<h2 id="sources-heading" className="type-title text-ink">
						{t("sources.heading")}
					</h2>
					<p className="text-body text-ink">{t("sources.body")}</p>
				</div>
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
									{t("sources.columns.frequency")}
								</th>
							</tr>
						</thead>
						<tbody className="max-md:block">
							{rows.map((row) => (
								<tr key={row.key} className={table.row({ className: "max-md:block max-md:py-3" })}>
									<th
										scope="row"
										className={table.cell({ className: `text-left font-normal ${stacked}` })}
									>
										<ExternalLink href={row.href} externalLabel={external}>
											{row.name}
										</ExternalLink>
										<span className="block text-meta text-ink-muted">{row.publisher}</span>
									</th>
									<td className={table.cell({ className: stacked })}>
										<span className={cellLabel}>{t("sources.columns.use")}</span>
										{item(row.key, "use")}
									</td>
									<td className={table.cell({ className: stacked })}>
										<span className={cellLabel}>{t("sources.columns.licence")}</span>
										<ExternalLink href={row.licenceHref} externalLabel={external}>
											{row.licence}
										</ExternalLink>
										{row.attribution ? (
											<span
												data-attribution={row.key}
												className="mt-1 block text-meta text-ink-muted"
												lang={row.attribution.lang}
											>
												{row.attribution.text}
											</span>
										) : null}
									</td>
									<td className={table.cell({ className: stacked })}>
										<span className={cellLabel}>{t("sources.columns.frequency")}</span>
										{item(row.key, "frequency")}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<div className="flex max-w-[65ch] flex-col gap-2">
					<h3 className="type-subtitle text-ink">{t("sources.conditionsHeading")}</h3>
					<p className="text-body text-ink">{t("sources.conditions")}</p>
					<ExternalLink href={openDataTerms(language)} externalLabel={external}>
						{t("sources.termsText")}
					</ExternalLink>
				</div>
			</section>

			<ProseSection
				id="coverage"
				content={{
					heading: t("coverage.heading"),
					body: raw("coverage.body") as string[],
					list: raw("coverage.cantons") as string[],
				}}
			>
				<div className="flex flex-col gap-2">
					<h3 className="type-subtitle text-ink">{t("coverage.kindsLabel")}</h3>
					<ul className="flex max-w-[65ch] list-disc flex-col gap-1 pl-6 text-body text-ink">
						{CH_DEFAULT_PROFESSIONS.map((profession) => (
							<li key={profession}>{t(`coverage.kinds.${profession as "CH_PHARMACY"}`)}</li>
						))}
					</ul>
				</div>
			</ProseSection>

			<ProseSection
				id="not-imported"
				content={{
					heading: t("excluded.heading"),
					body: raw("excluded.body") as string[],
					list: raw("excluded.list") as string[],
				}}
			/>

			<ProseSection
				id="fields-not-read"
				content={{
					heading: t("unread.heading"),
					body: raw("unread.body") as string[],
					list: raw("unread.list") as string[],
				}}
			/>

			<ProseSection
				id="locations"
				content={{ heading: t("locations.heading"), body: raw("locations.body") as string[] }}
			/>

			<ProseSection
				id="identifiers"
				content={{
					heading: t("identifiers.heading"),
					body: raw("identifiers.body") as string[],
					list: raw("identifiers.list") as string[],
				}}
			/>

			<ProseSection
				id="correct"
				content={{
					heading: t("correct.heading"),
					body: raw("correct.body") as string[],
					list: raw("correct.list") as string[],
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
				id="remove"
				content={
					{
						heading: t("remove.heading"),
						body: raw("remove.body") as string[],
					} satisfies ProseContent
				}
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
		</ChFrame>
	);
}
