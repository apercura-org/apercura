import { IE_HSE_ATLAS_DATE, ireland } from "@apercura/core/country";
import { IE_DEFAULT_PROFESSIONS } from "@apercura/core/taxonomy";
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
import { getImportStatus } from "~/server/queries/registry";
import { TRPCReactProvider } from "~/trpc/client";

/*
 * The institutional pages of the Irish market (`/ie/legal-notice`, `/ie/privacy`, `/ie/terms`,
 * `/ie/accessibility`, `/ie/data`), written for Irish law, not the UK's: the information of
 * S.I. No. 68 of 2003 (regulation 7), the GDPR with the Data Protection Act 2018 and the Data
 * Protection Commission, a voluntary accessibility statement, and a data page that names every
 * register with its re-use conditions, the PSI's clause on advertising word for word, and the
 * date of each list (the HSE's are a March 2020 snapshot). They print the same `LEGAL_*` facts,
 * with the same `{{…}}` placeholders while one is unknown, and stay marked as drafts until the
 * legal review (`LEGAL_TEXTS_REVIEWED`).
 */

/** The Data Protection Commission's page for raising a concern (a complaint). */
const DPC_COMPLAINT =
	"https://www.dataprotection.ie/en/individuals/exercising-your-rights/raising-concern-commission";

/** The PSI's terms of use, whose re-use conditions HIQA's follow. */
const PSI_TERMS = "https://www.psi.ie/terms-use";

/** The licence of a source as the data page names it: the PSI's or HIQA's terms, else CC BY 4.0. */
function licenceKey(sourceId: string): "psi" | "hiqa" | "ccBy" {
	if (sourceId === "ie-psi") return "psi";
	if (sourceId === "ie-hiqa") return "hiqa";
	return "ccBy";
}

const actionLink = `${linkStyles()} inline-flex min-h-11 items-center text-body font-semibold`;

type IeHref =
	| "/mentions-legales"
	| "/confidentialite"
	| "/conditions"
	| "/accessibilite"
	| "/donnees";

/** The shared frame: cover (with the draft mark until the legal review), booklet, trail. */
async function IeFrame({
	locale,
	href,
	title,
	lead,
	mark,
	note,
	children,
}: {
	locale: Locale;
	href: IeHref;
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

/** Every source with its publisher and the attribution it asks for, word for word. */
async function SourceAttributions({ locale }: { locale: Locale }) {
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const external = tSite("externalLink");
	return (
		<ul className="flex flex-col gap-3 border-t border-rule-soft pt-3">
			{ireland.registries.map((source) => (
				<li key={source.id} className="flex flex-col gap-1 text-body text-ink">
					<ExternalLink href={source.url} externalLabel={external}>
						{source.name}
					</ExternalLink>
					<span className="text-meta text-ink-muted">{source.publisher}</span>
					<span data-attribution={source.id} className="text-meta text-ink">
						{source.attribution}
					</span>
				</li>
			))}
		</ul>
	);
}

/**
 * Legal notice: the information of S.I. No. 68 of 2003, regulation 7(1) (name, geographic
 * address, contact details with an e-mail address, register and number, VAT number when
 * registered), and the country of origin whose law governs the service (France).
 */
export async function LegalNoticeIe({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "LegalNoticeIe" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const section = await proseSections(locale, "LegalNoticeIe");
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
		facts.hostName,
		facts.hostAddress,
		facts.hostPhone,
	];
	return (
		<IeFrame
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
			<ProseSection id="origin" content={section("origin")} />
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
			<ProseSection id="hosting" content={section("hosting")}>
				<FieldList>
					<LegalFactRow label={t("fields.hostName")} fact={facts.hostName} emptyLabel={tbc} />
					<LegalFactRow label={t("fields.hostAddress")} fact={facts.hostAddress} emptyLabel={tbc} />
					<LegalFactRow label={t("fields.hostPhone")} fact={facts.hostPhone} emptyLabel={tbc} />
				</FieldList>
			</ProseSection>
			<ProseSection id="content" content={section("liability")} />
			<ProseSection id="code-and-data" content={section("ip")}>
				<Link href="/donnees" className={actionLink}>
					{t("dataLink")}
				</Link>
			</ProseSection>
			{LEGAL_TEXTS_REVIEWED ? null : <ProseSection id="status" content={section("review")} />}
		</IeFrame>
	);
}

/**
 * Privacy notice: GDPR articles 13 and 14 (the article 14 information on facility pages that may
 * name a person), the legitimate interests assessment, article 21 and the Data Protection Act
 * 2018; a complaint to the Data Protection Commission or to the CNIL, the lead authority.
 */
export async function PrivacyIe({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "PrivacyIe" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const section = await proseSections(locale, "PrivacyIe");
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
		<IeFrame
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
					href={DPC_COMPLAINT}
					externalLabel={tSite("externalLink")}
					className="inline-flex min-h-11 items-center text-body font-semibold"
				>
					{t("dpcLink")}
				</ExternalLink>
				<ExternalLink
					href={LINKS.cnilComplaint}
					externalLabel={tSite("externalLink")}
					className="inline-flex min-h-11 items-center text-body font-semibold"
				>
					{t("cnilLink")}
				</ExternalLink>
			</ProseSection>
			<ProseSection id="changes" content={section("changes")} />
		</IeFrame>
	);
}

/**
 * Terms of use: a directory only, no booking in Ireland; French law, with the mandatory
 * protections and the courts of an Irish consumer kept.
 */
export async function TermsIe({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "TermsIe" });
	const tData = await getTranslations({ locale, namespace: "DataIe" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const section = await proseSections(locale, "TermsIe");
	const facts = legalFacts(serverEnv);
	const tbc = tI("toBeCompleted");
	const effectiveDate = await longDate(locale, facts.effectiveDate);
	const shown = [facts.publisherName, facts.effectiveDate, facts.contactEmail];
	return (
		<IeFrame
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
			<ProseSection id="facilities" content={section("facilities")} />
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
		</IeFrame>
	);
}

/**
 * Accessibility statement, voluntary: S.I. No. 358 of 2020 binds public sector bodies and S.I.
 * No. 636 of 2023 the services it lists; the WCAG 2.2 AA target.
 */
export async function AccessibilityIe({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "AccessibilityIe" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const format = await getFormatter({ locale });
	const section = await proseSections(locale, "AccessibilityIe");
	const facts = legalFacts(serverEnv);
	const tbc = tI("toBeCompleted");
	const statementDate = format.dateTime(new Date(`${ACCESSIBILITY_STATEMENT_DATE}T12:00:00Z`), {
		dateStyle: "long",
	});
	return (
		<IeFrame
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
		</IeFrame>
	);
}

const table = tableStyles();
/** A table cell printed as a stacked row on narrow screens. */
const stacked = "max-md:block max-md:px-0 max-md:py-1";
/** The column name above a stacked value (the header row is visually hidden there). */
const cellLabel = "caps block text-ink md:hidden";

/** The file keys of the PSI's and HIQA's lists in the Irish import's `files` (their dates). */
const PSI_FILE = "psi";
const HIQA_FILE = "hiqa";

/**
 * Data and sources: the PSI's register of pharmacies, HIQA's register of nursing homes, the
 * HSE's Health Atlas layers and the places of Tailte Éireann and the CSO, with their terms,
 * attribution and rhythm; how old each list is (the PSI's "correct at" date, HIQA's export, the
 * HSE's March 2020), the re-use conditions with the PSI's clause on advertising, what is
 * covered, what is not imported and why, the fields never read, how a facility is placed.
 */
export async function DataIe({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "DataIe" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const format = await getFormatter({ locale });
	const status = await getImportStatus("ie");
	const external = tSite("externalLink");
	const date = (value: string) =>
		format.dateTime(new Date(`${value}T00:00:00Z`), { dateStyle: "long", timeZone: "UTC" });
	const atlasMonth = format.dateTime(new Date(`${IE_HSE_ATLAS_DATE}-01T12:00:00Z`), {
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	});
	const psiDate = status?.files[PSI_FILE] ?? null;
	const hiqaDate = status ? (status.files[HIQA_FILE] ?? status.importedAt) : null;
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
		...ireland.registries.map((source) => ({
			key: source.id,
			name: source.name,
			publisher: source.publisher,
			href: source.url,
			licence: t(`sources.licences.${licenceKey(source.id)}`),
			licenceHref: source.licenceUrl ?? PSI_TERMS,
			attribution: source.attribution ?? null,
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
		t(`sources.items.${key as "ie-psi"}.${field}`);
	const raw = t.raw as (key: string) => unknown;

	return (
		<IeFrame locale={locale} href="/donnees" title={t("title")} lead={t("lead")}>
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

			<ProseSection
				id="dates"
				content={{ heading: t("dates.heading"), body: raw("dates.body") as string[] }}
			>
				<FieldList>
					<FieldRow
						label={t("dates.psi")}
						value={
							psiDate ? (
								<time dateTime={psiDate}>{t("dates.psiValue", { date: date(psiDate) })}</time>
							) : null
						}
						emptyLabel={t("status.notImportedValue")}
					/>
					<FieldRow
						label={t("dates.hiqa")}
						value={
							hiqaDate ? (
								<time dateTime={hiqaDate}>{t("dates.hiqaValue", { date: date(hiqaDate) })}</time>
							) : null
						}
						emptyLabel={t("status.notImportedValue")}
					/>
					<FieldRow
						label={t("dates.hse")}
						value={
							<time dateTime={IE_HSE_ATLAS_DATE}>{t("dates.hseValue", { date: atlasMonth })}</time>
						}
						emptyLabel=""
					/>
				</FieldList>
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
				<div id="conditions" className="flex max-w-[65ch] flex-col gap-2">
					<h3 className="type-subtitle text-ink">{t("sources.conditionsHeading")}</h3>
					{(raw("sources.conditions") as string[]).map((paragraph) => (
						<p key={paragraph} className="text-body text-ink">
							{paragraph}
						</p>
					))}
					<ExternalLink href={PSI_TERMS} externalLabel={external}>
						{t("sources.termsText")}
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
						{IE_DEFAULT_PROFESSIONS.map((profession) => (
							<li key={profession}>{t(`coverage.kinds.${profession}`)}</li>
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
		</IeFrame>
	);
}
