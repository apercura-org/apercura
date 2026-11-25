import { AT_STATES, austria } from "@apercura/core/country";
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
 * The institutional pages of the Austrian market (`/at/impressum`, `/at/datenschutz`,
 * `/at/nutzungsbedingungen`, `/at/barrierefreiheit`, `/at/daten`), written for Austrian law:
 * the French texts cite the LCEN, the CNIL and the RGAA, which do not apply there. They print
 * the same `LEGAL_*` facts as France's, with the same `{{…}}` placeholders while one is unknown.
 */

/** The Länder whose open data feeds the directory (Wien, Steiermark, Salzburg). */
export const AT_COVERED_STATES = ["9", "6", "5"] as const;

const actionLink = `${linkStyles()} inline-flex min-h-11 items-center text-body font-semibold`;

/** The shared frame: cover (with the draft mark until the legal review), booklet, trail. */
async function AtFrame({
	locale,
	href,
	title,
	lead,
	mark,
	note,
	children,
}: {
	locale: Locale;
	href: "/mentions-legales" | "/confidentialite" | "/conditions" | "/accessibilite" | "/donnees";
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

/** Every source with its licence and its attribution, word for word (CC BY 4.0, section 3 (a)). */
async function SourceAttributions({ locale }: { locale: Locale }) {
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const external = tSite("externalLink");
	return (
		<ul className="flex flex-col gap-3 border-t border-rule-soft pt-3">
			{austria.registries.map((source) => (
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

/** Impressum: ECG § 5 information and MedienG § 25 disclosure. */
export async function ImpressumAt({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "ImpressumAt" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const section = await proseSections(locale, "ImpressumAt");
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
		<AtFrame
			locale={locale}
			href="/mentions-legales"
			title={t("title")}
			lead={t("lead")}
			mark={LEGAL_TEXTS_REVIEWED ? undefined : tI("legalDraftMark")}
			note={shown.some((fact) => fact.missing) ? tI("placeholderNote") : null}
		>
			<ProseSection id="medieninhaber" content={section("provider")}>
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
			<ProseSection id="unternehmensgegenstand" content={section("purpose")} />
			<ProseSection id="herausgeber" content={section("publisher")}>
				<FieldList>
					<LegalFactRow
						label={t("fields.publisher")}
						fact={facts.publicationDirector}
						emptyLabel={tbc}
					/>
				</FieldList>
			</ProseSection>
			<ProseSection id="grundlegende-richtung" content={section("line")} />
			<ProseSection id="hosting" content={section("hosting")}>
				<FieldList>
					<LegalFactRow label={t("fields.hostName")} fact={facts.hostName} emptyLabel={tbc} />
					<LegalFactRow label={t("fields.hostAddress")} fact={facts.hostAddress} emptyLabel={tbc} />
					<LegalFactRow label={t("fields.hostPhone")} fact={facts.hostPhone} emptyLabel={tbc} />
				</FieldList>
			</ProseSection>
			<ProseSection id="inhalte" content={section("liability")} />
			<ProseSection id="code-und-daten" content={section("ip")}>
				<Link href="/donnees" className={actionLink}>
					{t("dataLink")}
				</Link>
			</ProseSection>
			{LEGAL_TEXTS_REVIEWED ? null : <ProseSection id="stand" content={section("review")} />}
		</AtFrame>
	);
}

/** Datenschutzerklärung: GDPR art. 13 and 14, the balancing of interests and art. 21. */
export async function PrivacyAt({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "PrivacyAt" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const format = await getFormatter({ locale });
	const section = await proseSections(locale, "PrivacyAt");
	const facts = legalFacts(serverEnv);
	const tbc = tI("toBeCompleted");
	const effectiveDate: LegalValue = facts.effectiveDate.missing
		? facts.effectiveDate
		: {
				value: format.dateTime(new Date(`${facts.effectiveDate.value}T12:00:00Z`), {
					dateStyle: "long",
				}),
				missing: false,
			};
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
		<AtFrame
			locale={locale}
			href="/confidentialite"
			title={t("title")}
			lead={t("lead")}
			mark={LEGAL_TEXTS_REVIEWED ? undefined : tI("legalDraftMark")}
			note={shown.some((fact) => fact.missing) ? tI("placeholderNote") : null}
		>
			<ProseSection id="verantwortlicher" content={section("controller")}>
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
			<ProseSection id="verzeichnis" content={section("directory")} />
			<ProseSection id="quellen" content={section("sources")}>
				<SourceAttributions locale={locale} />
			</ProseSection>
			<ProseSection id="abwaegung" content={section("balancing")} />
			<ProseSection id="widerspruch" content={section("objection")}>
				<a href={`${getPathname({ href: "/donnees", locale })}#entfernen`} className={actionLink}>
					{t("objectLink")}
				</a>
			</ProseSection>
			<ProseSection id="konten" content={section("accounts")} />
			<ProseSection id="anliegen" content={section("requests")} />
			<ProseSection id="technik" content={section("technical")} />
			<ProseSection id="empfaenger" content={section("recipients")}>
				<FieldList>
					<LegalFactRow
						label={t("fields.hostingProvider")}
						fact={facts.hostName}
						emptyLabel={tbc}
					/>
					<LegalFactRow label={t("fields.smtp")} fact={facts.smtpProvider} emptyLabel={tbc} />
				</FieldList>
			</ProseSection>
			<ProseSection id="uebermittlung" content={section("transfers")} />
			<ProseSection id="rechte" content={section("rights")}>
				<FieldList>
					<LegalFactRow
						label={t("fields.email")}
						fact={facts.contactEmail}
						email
						emptyLabel={tbc}
					/>
				</FieldList>
				<ExternalLink
					href={LINKS.dsbComplaint}
					externalLabel={tSite("externalLink")}
					className="inline-flex min-h-11 items-center text-body font-semibold"
				>
					{t("dsbLink")}
				</ExternalLink>
			</ProseSection>
			<ProseSection id="aenderungen" content={section("changes")} />
		</AtFrame>
	);
}

/** Nutzungsbedingungen: a directory only, no booking in Austria. */
export async function TermsAt({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "TermsAt" });
	const tData = await getTranslations({ locale, namespace: "DataAt" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const format = await getFormatter({ locale });
	const section = await proseSections(locale, "TermsAt");
	const facts = legalFacts(serverEnv);
	const tbc = tI("toBeCompleted");
	const effectiveDate: LegalValue = facts.effectiveDate.missing
		? facts.effectiveDate
		: {
				value: format.dateTime(new Date(`${facts.effectiveDate.value}T12:00:00Z`), {
					dateStyle: "long",
				}),
				missing: false,
			};
	const shown = [facts.publisherName, facts.effectiveDate, facts.contactEmail];
	return (
		<AtFrame
			locale={locale}
			href="/conditions"
			title={t("title")}
			lead={t("lead")}
			mark={LEGAL_TEXTS_REVIEWED ? undefined : tI("legalDraftMark")}
			note={shown.some((fact) => fact.missing) ? tI("placeholderNote") : null}
		>
			<ProseSection id="dienst" content={section("service")}>
				<FieldList>
					<LegalFactRow label={t("fields.publisher")} fact={facts.publisherName} emptyLabel={tbc} />
					<LegalFactRow label={t("fields.effectiveDate")} fact={effectiveDate} emptyLabel={tbc} />
				</FieldList>
			</ProseSection>
			<ProseSection id="inhalt" content={section("content")} />
			<ProseSection id="gesundheit" content={section("health")} />
			<ProseSection id="aerztinnen-und-aerzte" content={section("practitioners")} />
			<ProseSection id="entfernung" content={section("removal")}>
				<Link href="/donnees" className={actionLink}>
					{tData("title")}
				</Link>
			</ProseSection>
			<ProseSection id="haftung" content={section("liability")} />
			<ProseSection id="code-und-daten" content={section("ip")} />
			<ProseSection id="recht" content={section("law")}>
				<FieldList>
					<LegalFactRow
						label={t("fields.contact")}
						fact={facts.contactEmail}
						email
						emptyLabel={tbc}
					/>
				</FieldList>
			</ProseSection>
		</AtFrame>
	);
}

/** Barrierefreiheit: an honest statement, without the French RGAA framework. */
export async function AccessibilityAt({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "AccessibilityAt" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const format = await getFormatter({ locale });
	const section = await proseSections(locale, "AccessibilityAt");
	const facts = legalFacts(serverEnv);
	const tbc = tI("toBeCompleted");
	const statementDate = format.dateTime(new Date(`${ACCESSIBILITY_STATEMENT_DATE}T12:00:00Z`), {
		dateStyle: "long",
	});
	return (
		<AtFrame
			locale={locale}
			href="/accessibilite"
			title={t("title")}
			lead={t("lead")}
			mark={tI("auditMark")}
			note={facts.contactEmail.missing ? tI("placeholderNote") : null}
		>
			<ProseSection id="geltungsbereich" content={section("scope")} />
			<ProseSection id="stand" content={section("status")}>
				<FieldList>
					<FieldRow
						label={t("fields.date")}
						value={<time dateTime={ACCESSIBILITY_STATEMENT_DATE}>{statementDate}</time>}
						emptyLabel={tbc}
					/>
				</FieldList>
			</ProseSection>
			<ProseSection id="geprueft" content={section("tests")} />
			<ProseSection id="ausstehend" content={section("pending")} />
			<ProseSection id="melden" content={section("feedback")}>
				<FieldList>
					<LegalFactRow
						label={t("fields.contact")}
						fact={facts.contactEmail}
						email
						emptyLabel={tbc}
					/>
				</FieldList>
			</ProseSection>
		</AtFrame>
	);
}

const table = tableStyles();
/** A table cell printed as a stacked row on narrow screens. */
const stacked = "max-md:block max-md:px-0 max-md:py-1";
/** The column name above a stacked value (the header row is visually hidden there). */
const cellLabel = "caps block text-ink md:hidden";

/** Daten und Quellen: every Austrian source with its licence, attribution and rhythm. */
export async function DataAt({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "DataAt" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const format = await getFormatter({ locale });
	const status = await getImportStatus("at");
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
		...austria.registries.map((source) => ({
			key: source.id,
			name: source.name,
			publisher: source.publisher,
			href: source.url,
			licence: "CC BY 4.0",
			licenceHref: source.licenceUrl ?? LINKS.ccBy4,
			attribution: source.attribution ?? null,
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
		t(`sources.items.${key as "at-wien"}.${field}`);
	const coverage = (t.raw as (key: string) => unknown)("coverage.body") as string[];
	const covered = new Set<string>(AT_COVERED_STATES);

	return (
		<AtFrame locale={locale} href="/donnees" title={t("title")} lead={t("lead")}>
			<ProseSection
				id="aktualisierung"
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
			</section>

			<ProseSection id="bundeslaender" content={{ heading: t("coverage.heading"), body: coverage }}>
				<FieldList>
					{Object.entries(AT_STATES)
						.sort(([, a], [, b]) => a.localeCompare(b, "de"))
						.map(([code, name]) => (
							<FieldRow
								key={code}
								label={name}
								value={covered.has(code) ? t("coverage.covered") : t("coverage.claimedOnly")}
								emptyLabel=""
							/>
						))}
				</FieldList>
			</ProseSection>

			<ProseSection
				id="berichtigen"
				content={{
					heading: t("correct.heading"),
					body: (t.raw as (key: string) => unknown)("correct.body") as string[],
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
				id="entfernen"
				content={
					{
						heading: t("remove.heading"),
						body: (t.raw as (key: string) => unknown)("remove.body") as string[],
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
		</AtFrame>
	);
}
