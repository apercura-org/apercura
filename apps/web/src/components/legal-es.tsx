import { spain } from "@apercura/core/country";
import { ES_DEFAULT_PROFESSIONS } from "@apercura/core/taxonomy";
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
import { spanishAttribution } from "~/lib/market";
import { getImportStatus } from "~/server/queries/registry";
import { TRPCReactProvider } from "~/trpc/client";

/*
 * The institutional pages of the Spanish market (`/es/aviso-legal`, `/es/privacidad`,
 * `/es/condiciones`, `/es/accesibilidad`, `/es/datos`), written for Spanish law: the French texts
 * cite the LCEN, the CNIL and the RGAA, none of which applies there. They print the same `LEGAL_*`
 * facts, with the same `{{…}}` placeholders while one is unknown. The legal notice names the
 * operator's identification as article 10 of the LSSI (Ley 34/2002) asks; the hosting provider
 * appears among the processors of the privacy page.
 */

const actionLink = `${linkStyles()} inline-flex min-h-11 items-center text-body font-semibold`;

/** The Spanish supervisory authority (Agencia Española de Protección de Datos), checked 2026-11-26. */
const AEPD = "https://www.aepd.es/";

/** The Ministry of Health's legal notice: reuse with the source and the date of the last update. */
const SANIDAD_LEGAL_NOTICE = "https://www.sanidad.gob.es/avisoLegal/home.htm";

/** The IGN's licence of its data (CC BY 4.0, Orden FOM/2807/2015). */
const IGN_LICENCE = "https://www.ign.es/resources/licencia/Condiciones_licenciaUso_IGN.pdf";

type EsHref =
	| "/mentions-legales"
	| "/confidentialite"
	| "/conditions"
	| "/accessibilite"
	| "/donnees";

/** The shared frame: cover (with the draft mark until the legal review), booklet, trail. */
async function EsFrame({
	locale,
	href,
	title,
	lead,
	mark,
	note,
	children,
}: {
	locale: Locale;
	href: EsHref;
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

/**
 * Every source with its publisher and its attribution, word for word: REGCESS dated by the last
 * Spanish import, as the Ministry of Health's legal notice asks.
 */
async function SourceAttributions({ locale }: { locale: Locale }) {
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const external = tSite("externalLink");
	const status = await getImportStatus("es");
	return (
		<ul className="flex flex-col gap-3 border-t border-rule-soft pt-3">
			{spain.registries.map((source) => (
				<li key={source.id} className="flex flex-col gap-1 text-body text-ink">
					<ExternalLink href={source.url} externalLabel={external}>
						{source.name}
					</ExternalLink>
					<span className="text-meta text-ink-muted">{source.publisher}</span>
					<span data-attribution={source.id} className="text-meta text-ink" lang="es">
						{spanishAttribution(source.id, status?.importedAt ?? null)}
					</span>
				</li>
			))}
		</ul>
	);
}

/** Legal notice: the operator's identification (LSSI, Ley 34/2002, article 10). */
export async function LegalNoticeEs({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "LegalNoticeEs" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const section = await proseSections(locale, "LegalNoticeEs");
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
		<EsFrame
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
		</EsFrame>
	);
}

/**
 * Privacy notice: GDPR articles 13 and 14 (with the LOPDGDD's article 19(3) on sole traders),
 * the legitimate interests assessment and article 21.
 */
export async function PrivacyEs({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "PrivacyEs" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const section = await proseSections(locale, "PrivacyEs");
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
		<EsFrame
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
			<ProseSection id="directory" content={section("directory")} />
			<ProseSection id="people" content={section("people")} />
			<ProseSection id="sources" content={section("sources")}>
				<SourceAttributions locale={locale} />
			</ProseSection>
			<ProseSection id="legitimate-interests" content={section("balancing")} />
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
			<ProseSection id="transfers" content={section("transfers")} />
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
					href={AEPD}
					externalLabel={tSite("externalLink")}
					className="inline-flex min-h-11 items-center text-body font-semibold"
				>
					{t("authorityLink")}
				</ExternalLink>
			</ProseSection>
			<ProseSection id="changes" content={section("changes")} />
		</EsFrame>
	);
}

/** Terms of use: a directory only, no booking in Spain. */
export async function TermsEs({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "TermsEs" });
	const tData = await getTranslations({ locale, namespace: "DataEs" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const section = await proseSections(locale, "TermsEs");
	const facts = legalFacts(serverEnv);
	const tbc = tI("toBeCompleted");
	const effectiveDate = await longDate(locale, facts.effectiveDate);
	const shown = [facts.publisherName, facts.effectiveDate, facts.contactEmail];
	return (
		<EsFrame
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
		</EsFrame>
	);
}

/** Accessibility statement: the WCAG 2.2 AA target, voluntary (RD 1112/2018 binds public bodies). */
export async function AccessibilityEs({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "AccessibilityEs" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const format = await getFormatter({ locale });
	const section = await proseSections(locale, "AccessibilityEs");
	const facts = legalFacts(serverEnv);
	const tbc = tI("toBeCompleted");
	const statementDate = format.dateTime(new Date(`${ACCESSIBILITY_STATEMENT_DATE}T12:00:00Z`), {
		dateStyle: "long",
	});
	return (
		<EsFrame
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
		</EsFrame>
	);
}

const table = tableStyles();
/** A table cell printed as a stacked row on narrow screens. */
const stacked = "max-md:block max-md:px-0 max-md:py-1";
/** The column name above a stacked value (the header row is visually hidden there). */
const cellLabel = "caps block text-ink md:hidden";

/** Data and sources: both Spanish sources with their conditions, attribution and rhythm. */
export async function DataEs({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "DataEs" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const format = await getFormatter({ locale });
	const status = await getImportStatus("es");
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
		attribution: string | null;
	};
	const rows: Row[] = [
		...spain.registries.map((source) => ({
			key: source.id,
			name: source.name,
			publisher: source.publisher,
			href: source.url,
			licence: source.id === "es-regcess" ? t("sources.reuse") : t("sources.ccBy"),
			licenceHref: source.licenceUrl ?? LINKS.ccBy4,
			attribution: spanishAttribution(source.id, status?.importedAt ?? null) || null,
		})),
		{
			key: "map",
			name: t("sources.items.map.name"),
			publisher: t("sources.items.map.publisher"),
			href: LINKS.openStreetMap,
			licence: t("sources.odbl"),
			licenceHref: LINKS.odbl,
			attribution: null,
		},
	];
	const item = (key: string, field: "use" | "frequency") =>
		t(`sources.items.${key as "es-regcess"}.${field}`);
	const raw = t.raw as (key: string) => unknown;

	return (
		<EsFrame locale={locale} href="/donnees" title={t("title")} lead={t("lead")}>
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
												lang="es"
											>
												{row.attribution}
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
					<ExternalLink href={SANIDAD_LEGAL_NOTICE} externalLabel={external}>
						{t("sources.legalNotice")}
					</ExternalLink>
					<ExternalLink href={IGN_LICENCE} externalLabel={external}>
						{t("sources.ignLicence")}
					</ExternalLink>
				</div>
			</section>

			<ProseSection
				id="coverage"
				content={{ heading: t("coverage.heading"), body: raw("coverage.body") as string[] }}
			>
				<div className="flex flex-col gap-2">
					<h3 className="type-subtitle text-ink">{t("coverage.kindsLabel")}</h3>
					<ul className="flex max-w-[65ch] list-disc flex-col gap-1 pl-6 text-body text-ink">
						{ES_DEFAULT_PROFESSIONS.map((profession) => (
							<li key={profession}>{t(`coverage.kinds.${profession as "ES_HOSPITAL"}`)}</li>
						))}
					</ul>
				</div>
			</ProseSection>

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
		</EsFrame>
	);
}
