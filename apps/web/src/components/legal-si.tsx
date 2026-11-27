import { type RegistrySource, SI_LIST_IDS, slovenia } from "@apercura/core/country";
import { SI_PROFESSIONS } from "@apercura/core/taxonomy";
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
import { getImportStatus, type ImportStatus } from "~/server/queries/registry";
import { TRPCReactProvider } from "~/trpc/client";

/*
 * The institutional pages of the Slovenian market (`/si/pravno-obvestilo`,
 * `/si/varstvo-osebnih-podatkov`, `/si/pogoji-uporabe`, `/si/dostopnost`, `/si/podatki`), written
 * for Slovenian law: the French texts cite the LCEN, the CNIL and the RGAA, none of which applies
 * there. The legal notice gives the general information of article 5 of the Electronic Commerce
 * Market Act (ZEPT); the privacy notice carries, as Austria's does, the legitimate-interest
 * assessment, the article 14 notice and the article 21 objection a directory of named doctors
 * needs. They print the same `LEGAL_*` facts, with the same `{{…}}` placeholders while one is
 * unknown; the hosting provider appears among the processors of the privacy page, never with a
 * location.
 */

const actionLink = `${linkStyles()} inline-flex min-h-11 items-center text-body font-semibold`;

/** The Information Commissioner's page for filing a complaint (vložitev prijave), checked 2026-11-27. */
const IP_COMPLAINT =
	"https://www.ip-rs.si/varstvo-osebnih-podatkov/pravice-posameznika/vlo%C5%BEitev-prijave";

/**
 * GURS's terms of its public data (CC BY 4.0: credit the authority, the kind of data and the date
 * of its state), checked 2026-11-27.
 */
const GURS_TERMS = "https://www.e-prostor.gov.si/dostopi/javni-dostop/?acitem=1821-1822";

/** The GURS register of spatial units, whose credit carries the date of the data's state. */
const PLACES_SOURCE_ID = "si-rpe";

/** The key of the one credit line the three ZZZS lists share. */
const ZZZS_CREDIT = "si-zzzs";

type SiHref =
	| "/mentions-legales"
	| "/confidentialite"
	| "/conditions"
	| "/accessibilite"
	| "/donnees";

/** The shared frame: cover (with the draft mark until the legal review), booklet, trail. */
async function SiFrame({
	locale,
	href,
	title,
	lead,
	mark,
	note,
	children,
}: {
	locale: Locale;
	href: SiHref;
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
 * The date (`YYYY-MM-DD`) of the data of some Slovenian sources: the newest publication date the
 * last Slovenian import recorded for their files (keyed by registry id), else the day of that
 * import (the ZZZS lists are published daily); null before any import.
 */
function sourcesDate(status: ImportStatus | null, ids: readonly string[]): string | null {
	if (!status) return null;
	const dates = ids.map((id) => status.files[id]).filter((date): date is string => Boolean(date));
	return dates.sort().at(-1) ?? status.importedAt;
}

const isListSource = (source: RegistrySource) =>
	(SI_LIST_IDS as readonly string[]).includes(source.id);

type Credit = {
	key: string;
	name: string;
	publisher: string;
	href: string;
	licenceHref: string;
	attribution: string;
	/** The date of the data, printed after the attribution (`YYYY-MM-DD`). */
	date: string | null;
};

/**
 * Every distinct credit of the Slovenian sources, once each: the three ZZZS lists share the
 * insurer's line, dated by the list's data, and GURS's register keeps its own, whose date of
 * state GURS asks to be part of the line.
 */
function slovenianCredits(status: ImportStatus | null): Credit[] {
	const lists = slovenia.registries.filter(isListSource);
	const places = slovenia.registries.filter((source) => source.id === PLACES_SOURCE_ID);
	const first = lists[0];
	const credits: Credit[] = [];
	if (first) {
		credits.push({
			key: ZZZS_CREDIT,
			name: "Poimenski seznami zdravnikov, ki so lahko osebni zdravniki",
			publisher: first.publisher,
			href: first.url,
			licenceHref: first.licenceUrl ?? LINKS.ccBy4,
			attribution: first.attribution ?? "",
			date: sourcesDate(status, SI_LIST_IDS),
		});
	}
	for (const source of places) {
		credits.push({
			key: source.id,
			name: source.name,
			publisher: source.publisher,
			href: source.url,
			licenceHref: source.licenceUrl ?? LINKS.ccBy4,
			attribution: source.attribution ?? "",
			date: status ? (status.files[source.id] ?? null) : null,
		});
	}
	return credits;
}

/** Every source with its publisher and its attribution, word for word (CC BY 4.0), dated. */
async function SourceAttributions({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "PrivacySi" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const format = await getFormatter({ locale });
	const status = await getImportStatus("si");
	const external = tSite("externalLink");
	const date = (value: string) =>
		format.dateTime(new Date(`${value}T00:00:00Z`), { dateStyle: "long", timeZone: "UTC" });
	return (
		<ul className="flex flex-col gap-3 border-t border-rule-soft pt-3">
			{slovenianCredits(status).map((credit) => (
				<li key={credit.key} className="flex flex-col gap-1 text-body text-ink">
					<ExternalLink href={credit.href} externalLabel={external}>
						{credit.name}
					</ExternalLink>
					<span className="text-meta text-ink-muted">{credit.publisher}</span>
					<span data-attribution={credit.key} className="text-meta text-ink" lang="sl">
						{credit.attribution}
					</span>
					{credit.date ? (
						<span className="text-meta text-ink-muted">
							{t("stateOf", { date: date(credit.date) })}
						</span>
					) : null}
				</li>
			))}
		</ul>
	);
}

/** Legal notice: the general information of a service provider (ZEPT, article 5). */
export async function LegalNoticeSi({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "LegalNoticeSi" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const section = await proseSections(locale, "LegalNoticeSi");
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
		<SiFrame
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
		</SiFrame>
	);
}

/**
 * Privacy notice: GDPR articles 13 and 14, the legitimate interests assessment of a directory of
 * named doctors, article 21 and the ZVOP-2.
 */
export async function PrivacySi({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "PrivacySi" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const section = await proseSections(locale, "PrivacySi");
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
		<SiFrame
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
					href={IP_COMPLAINT}
					externalLabel={tSite("externalLink")}
					className="inline-flex min-h-11 items-center text-body font-semibold"
				>
					{t("authorityLink")}
				</ExternalLink>
			</ProseSection>
			<ProseSection id="changes" content={section("changes")} />
		</SiFrame>
	);
}

/** Terms of use: a directory only, no booking in Slovenia. */
export async function TermsSi({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "TermsSi" });
	const tData = await getTranslations({ locale, namespace: "DataSi" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const section = await proseSections(locale, "TermsSi");
	const facts = legalFacts(serverEnv);
	const tbc = tI("toBeCompleted");
	const effectiveDate = await longDate(locale, facts.effectiveDate);
	const shown = [facts.publisherName, facts.effectiveDate, facts.contactEmail];
	return (
		<SiFrame
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
			<ProseSection id="doctors" content={section("practitioners")} />
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
		</SiFrame>
	);
}

/** Accessibility statement: the WCAG 2.2 AA target, voluntary (the ZDSMA binds public bodies). */
export async function AccessibilitySi({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "AccessibilitySi" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const format = await getFormatter({ locale });
	const section = await proseSections(locale, "AccessibilitySi");
	const facts = legalFacts(serverEnv);
	const tbc = tI("toBeCompleted");
	const statementDate = format.dateTime(new Date(`${ACCESSIBILITY_STATEMENT_DATE}T12:00:00Z`), {
		dateStyle: "long",
	});
	return (
		<SiFrame
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
		</SiFrame>
	);
}

const table = tableStyles();
/** A table cell printed as a stacked row on narrow screens. */
const stacked = "max-md:block max-md:px-0 max-md:py-1";
/** The column name above a stacked value (the header row is visually hidden there). */
const cellLabel = "caps block text-ink md:hidden";

/** The kinds of doctor listed, in the taxonomy's order. */
const LISTED_KINDS = Object.keys(SI_PROFESSIONS);

/**
 * Data and sources: the ZZZS lists and the GURS register with their licence, attribution and
 * rhythm, what a page shows and never keeps, the new-patients flag, and how to correct or remove
 * a page.
 */
export async function DataSi({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "DataSi" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const format = await getFormatter({ locale });
	const status = await getImportStatus("si");
	const external = tSite("externalLink");
	const date = (value: string) =>
		format.dateTime(new Date(`${value}T00:00:00Z`), { dateStyle: "long", timeZone: "UTC" });
	const credits = slovenianCredits(status);
	const creditOf = (source: RegistrySource) =>
		credits.find((credit) => credit.key === (isListSource(source) ? ZZZS_CREDIT : source.id));
	const listsDate = sourcesDate(status, SI_LIST_IDS);
	type Row = {
		key: string;
		name: string;
		publisher: string;
		href: string;
		licence: string;
		licenceHref: string;
		attribution: string | null;
		date: string | null;
	};
	const rows: Row[] = [
		...slovenia.registries.map((source) => {
			const credit = creditOf(source);
			return {
				key: source.id,
				name: source.name,
				publisher: source.publisher,
				href: source.url,
				licence: t("sources.ccBy"),
				licenceHref: source.licenceUrl ?? LINKS.ccBy4,
				attribution: credit?.attribution ?? source.attribution ?? null,
				date: credit?.date ?? null,
			};
		}),
		{
			key: "map",
			name: t("sources.items.map.name"),
			publisher: t("sources.items.map.publisher"),
			href: LINKS.openStreetMap,
			licence: t("sources.odbl"),
			licenceHref: LINKS.odbl,
			attribution: null,
			date: null,
		},
	];
	const item = (key: string, field: "use" | "frequency") =>
		t(`sources.items.${key as "si-zzzs-sa"}.${field}`);
	const raw = t.raw as (key: string) => unknown;

	return (
		<SiFrame locale={locale} href="/donnees" title={t("title")} lead={t("lead")}>
			<ProseSection
				id="updates"
				content={{ heading: t("status.heading"), body: [t("status.body")] }}
			>
				<FieldList>
					<FieldRow
						label={t("status.listDate")}
						value={listsDate ? <time dateTime={listsDate}>{date(listsDate)}</time> : null}
						emptyLabel={t("status.notImportedValue")}
					/>
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
											<span lang={row.key === "map" ? undefined : "sl"}>{row.name}</span>
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
												lang="sl"
											>
												{row.attribution}
											</span>
										) : null}
										{row.date ? (
											<span className="mt-1 block text-meta text-ink-muted">
												{t("sources.stateOf", { date: date(row.date) })}
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
					<ExternalLink href={GURS_TERMS} externalLabel={external}>
						{t("sources.gursTerms")}
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
						{LISTED_KINDS.map((profession) => (
							<li key={profession}>{t(`coverage.kinds.${profession as "SI_FAMILY_DOCTOR"}`)}</li>
						))}
					</ul>
				</div>
			</ProseSection>

			<ProseSection
				id="pages"
				content={{
					heading: t("pages.heading"),
					body: raw("pages.body") as string[],
					list: raw("pages.list") as string[],
				}}
			/>

			<ProseSection
				id="new-patients"
				content={{ heading: t("acceptance.heading"), body: raw("acceptance.body") as string[] }}
			/>

			<ProseSection
				id="chamber"
				content={{ heading: t("chamber.heading"), body: raw("chamber.body") as string[] }}
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
		</SiFrame>
	);
}
