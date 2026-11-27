import { malta } from "@apercura/core/country";
import { MT_DEFAULT_PROFESSIONS } from "@apercura/core/taxonomy";
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
 * The institutional pages of the Maltese market (`/mt/legal-notice`, `/mt/privacy`, `/mt/terms`,
 * `/mt/accessibility`, `/mt/data`), written for Maltese law: the information of the Electronic
 * Commerce Act (Cap. 426, article 8C), the GDPR with the Data Protection Act (Cap. 586) and the
 * Information and Data Protection Commissioner, a voluntary accessibility statement, and a data
 * page that names every source with its CC BY 4.0 credit, the rules on advertising and what is
 * left out. They print the same `LEGAL_*` facts, with the same `{{…}}` placeholders while one is
 * unknown, and stay marked as drafts until the legal review (`LEGAL_TEXTS_REVIEWED`).
 */

/** The Information and Data Protection Commissioner's page for lodging a complaint. */
const IDPC_COMPLAINT = "https://idpc.org.mt/file-a-complaint/";

/** The register's record on the European data portal, harvested from data.gov.mt (its licence). */
const REGISTER_RECORD = "https://data.europa.eu/data/datasets/0dfe65b7-626f-49ef-ab09-6a6ab8a4db72";

const actionLink = `${linkStyles()} inline-flex min-h-11 items-center text-body font-semibold`;

type MtHref =
	| "/mentions-legales"
	| "/confidentialite"
	| "/conditions"
	| "/accessibilite"
	| "/donnees";

/** The shared frame: cover (with the draft mark until the legal review), booklet, trail. */
async function MtFrame({
	locale,
	href,
	title,
	lead,
	mark,
	note,
	children,
}: {
	locale: Locale;
	href: MtHref;
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
			{malta.registries.map((source) => (
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
 * Legal notice: the information of the Electronic Commerce Act (Cap. 426), article 8C(1) (name,
 * geographic address, contact details with an e-mail address, register and number, VAT number
 * when registered), and the country of origin whose law governs the service (France, article 8A).
 */
export async function LegalNoticeMt({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "LegalNoticeMt" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const section = await proseSections(locale, "LegalNoticeMt");
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
		<MtFrame
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
		</MtFrame>
	);
}

/**
 * Privacy notice: GDPR articles 13 and 14 (the article 14 information on pharmacy pages whose
 * trading name may name a person), the legitimate interests assessment, article 21 and the Data
 * Protection Act (Cap. 586); a complaint to the IDPC or to the CNIL, the lead authority.
 */
export async function PrivacyMt({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "PrivacyMt" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const section = await proseSections(locale, "PrivacyMt");
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
		<MtFrame
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
					href={IDPC_COMPLAINT}
					externalLabel={tSite("externalLink")}
					className="inline-flex min-h-11 items-center text-body font-semibold"
				>
					{t("idpcLink")}
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
		</MtFrame>
	);
}

/**
 * Terms of use: a directory only, no booking in Malta; French law, with the mandatory
 * protections and the courts of a Maltese consumer kept.
 */
export async function TermsMt({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "TermsMt" });
	const tData = await getTranslations({ locale, namespace: "DataMt" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const section = await proseSections(locale, "TermsMt");
	const facts = legalFacts(serverEnv);
	const tbc = tI("toBeCompleted");
	const effectiveDate = await longDate(locale, facts.effectiveDate);
	const shown = [facts.publisherName, facts.effectiveDate, facts.contactEmail];
	return (
		<MtFrame
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
		</MtFrame>
	);
}

/**
 * Accessibility statement, voluntary: S.L. 418.03 binds public sector bodies and S.L. 627.03 the
 * products and services it lists; the WCAG 2.2 AA target.
 */
export async function AccessibilityMt({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "AccessibilityMt" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const format = await getFormatter({ locale });
	const section = await proseSections(locale, "AccessibilityMt");
	const facts = legalFacts(serverEnv);
	const tbc = tI("toBeCompleted");
	const statementDate = format.dateTime(new Date(`${ACCESSIBILITY_STATEMENT_DATE}T12:00:00Z`), {
		dateStyle: "long",
	});
	return (
		<MtFrame
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
		</MtFrame>
	);
}

const table = tableStyles();
/** A table cell printed as a stacked row on narrow screens. */
const stacked = "max-md:block max-md:px-0 max-md:py-1";
/** The column name above a stacked value (the header row is visually hidden there). */
const cellLabel = "caps block text-ink md:hidden";

/**
 * Data and sources: the Medicines Authority's register of licensed pharmacies and the places of
 * the Planning Authority, the NSO and the Address Registrar, with their CC BY 4.0 credit and
 * rhythm; the licence and the rules on advertising, what is covered, what is not imported and
 * why, the fields never read, how a pharmacy is placed, its identifier.
 */
export async function DataMt({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "DataMt" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const format = await getFormatter({ locale });
	const status = await getImportStatus("mt");
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
		...malta.registries.map((source) => ({
			key: source.id,
			name: source.name,
			publisher: source.publisher,
			href: source.url,
			licence: t("sources.licences.ccBy"),
			licenceHref: source.licenceUrl ?? "https://creativecommons.org/licenses/by/4.0/",
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
		t(`sources.items.${key as "mt-pharmacies"}.${field}`);
	const raw = t.raw as (key: string) => unknown;

	return (
		<MtFrame locale={locale} href="/donnees" title={t("title")} lead={t("lead")}>
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
					<ExternalLink href={REGISTER_RECORD} externalLabel={external}>
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
						{MT_DEFAULT_PROFESSIONS.map((profession) => (
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
		</MtFrame>
	);
}
