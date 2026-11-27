import { FieldList, FieldRow, linkStyles } from "@apercura/ui";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { BookletPage } from "~/components/booklet-page";
import {
	ExternalLink,
	InstitutionalCover,
	LegalFactRow,
	ProseSection,
} from "~/components/institutional";
import { PrivacyAt } from "~/components/legal-at";
import { PrivacyCh } from "~/components/legal-ch";
import { PrivacyCz } from "~/components/legal-cz";
import { PrivacyDe } from "~/components/legal-de";
import { PrivacyEe } from "~/components/legal-ee";
import { PrivacyEs } from "~/components/legal-es";
import { PrivacyGb } from "~/components/legal-gb";
import { PrivacyIt } from "~/components/legal-it";
import { PageGraph } from "~/components/page-graph";
import { PublicPage } from "~/components/public-page";
import { Trail } from "~/components/trail";
import { serverEnv } from "~/env";
import { marketOf } from "~/i18n/locales";
import { getPathname } from "~/i18n/navigation";
import { localeOf, marketInstitutionalMetadata, proseSections } from "~/lib/institutional";
import { LEGAL_TEXTS_REVIEWED, type LegalValue, legalFacts, transfersSection } from "~/lib/legal";
import { LINKS } from "~/lib/links";

export const ensureStatic = "navigation";

const HREF = "/confidentialite" as const;

export function generateMetadata({ params }: PageProps<"/[locale]/confidentialite">) {
	return marketInstitutionalMetadata(
		params,
		{
			FR: "PrivacyPage",
			AT: "PrivacyAt",
			GB: "PrivacyGb",
			CZ: "PrivacyCz",
			ES: "PrivacyEs",
			IT: "PrivacyIt",
			DE: "PrivacyDe",
			CH: "PrivacyCh",
			EE: "PrivacyEe",
		},
		HREF,
	);
}

/**
 * Privacy policy (GDPR art. 13 and 14): controller and DPO, each processing with its data,
 * purpose, legal basis and retention, recipients and processors, transfers, cookies, rights and
 * the objection process. Draft until the legal review; the facts come from `LEGAL_*`.
 */
export default async function PrivacyPage({ params }: PageProps<"/[locale]/confidentialite">) {
	const locale = await localeOf(params);
	setRequestLocale(locale);
	// Austria's, the UK's, Czechia's, Spain's, Italy's, Germany's, Switzerland's and Estonia's pages
	// have texts of their own, written for their law.
	if (marketOf(locale) === "AT") return <PrivacyAt locale={locale} />;
	if (marketOf(locale) === "GB") return <PrivacyGb locale={locale} />;
	if (marketOf(locale) === "CZ") return <PrivacyCz locale={locale} />;
	if (marketOf(locale) === "ES") return <PrivacyEs locale={locale} />;
	if (marketOf(locale) === "IT") return <PrivacyIt locale={locale} />;
	if (marketOf(locale) === "DE") return <PrivacyDe locale={locale} />;
	if (marketOf(locale) === "CH") return <PrivacyCh locale={locale} />;
	if (marketOf(locale) === "EE") return <PrivacyEe locale={locale} />;
	const t = await getTranslations({ locale, namespace: "PrivacyPage" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const format = await getFormatter({ locale });
	const section = await proseSections(locale, "PrivacyPage");
	const tbc = tI("toBeCompleted");
	const facts = legalFacts(serverEnv);
	const anyMissing = Object.values(facts).some((fact) => fact.missing);
	const effectiveDate: LegalValue = facts.effectiveDate.missing
		? facts.effectiveDate
		: {
				value: format.dateTime(new Date(`${facts.effectiveDate.value}T12:00:00Z`), {
					dateStyle: "long",
				}),
				missing: false,
			};
	// Hosting by an HDS-certified host is only stated where it is true (see lib/pillars.ts).
	const hdsHost = serverEnv.PUBLIC_HDS_HOST?.trim();
	const link = `${linkStyles()} inline-flex min-h-11 items-center text-body font-semibold`;

	return (
		<PublicPage locale={locale} href={HREF}>
			<InstitutionalCover
				title={t("title")}
				lead={t("lead")}
				mark={LEGAL_TEXTS_REVIEWED ? undefined : tI("legalDraftMark")}
				note={anyMissing ? tI("placeholderNote") : null}
			/>
			<BookletPage>
				<PageGraph
					locale={locale}
					href={HREF}
					name={t("title")}
					trail={[{ label: t("title"), href: HREF }]}
				/>
				<Trail locale={locale} items={[{ label: t("title"), href: HREF }]} />
				<ProseSection id="responsable" content={section("roles")}>
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
						<LegalFactRow label={t("fields.dpo")} fact={facts.dpoContact} emptyLabel={tbc} />
						<LegalFactRow label={t("fields.effectiveDate")} fact={effectiveDate} emptyLabel={tbc} />
					</FieldList>
				</ProseSection>
				<ProseSection id="professionnels" content={section("practitioners")} />
				<ProseSection id="comptes" content={section("accounts")} />
				<ProseSection id="patients" content={section("patients")} />
				<ProseSection id="signalements" content={section("reports")} />
				<ProseSection id="securite" content={section("security")} />
				<ProseSection id="destinataires" content={section("recipients")}>
					<FieldList>
						<LegalFactRow
							label={t("fields.hostingProvider")}
							fact={facts.hostName}
							emptyLabel={tbc}
						/>
						<FieldRow
							label={t("fields.hosting")}
							value={hdsHost ? t("hostedBy", { host: hdsHost }) : null}
							emptyLabel={tbc}
						/>
						<LegalFactRow label={t("fields.smtp")} fact={facts.smtpProvider} emptyLabel={tbc} />
					</FieldList>
				</ProseSection>
				<ProseSection id="transferts" content={section(transfersSection(hdsHost))} />
				<ProseSection id="cookies" content={section("cookies")} />
				<ProseSection id="droits" content={section("rights")}>
					<FieldList>
						<LegalFactRow
							label={t("fields.contact")}
							fact={facts.contactEmail}
							email
							emptyLabel={tbc}
						/>
					</FieldList>
					<ExternalLink
						href={LINKS.cnilComplaint}
						externalLabel={tSite("externalLink")}
						className="inline-flex min-h-11 items-center text-body font-semibold"
					>
						{t("cnilLink")}
					</ExternalLink>
				</ProseSection>
				<ProseSection id="opposition" content={section("objection")}>
					<a href={`${getPathname({ href: "/donnees", locale })}#retrait`} className={link}>
						{t("objectLink")}
					</a>
				</ProseSection>
				<ProseSection id="mises-a-jour" content={section("changes")} />
			</BookletPage>
		</PublicPage>
	);
}
