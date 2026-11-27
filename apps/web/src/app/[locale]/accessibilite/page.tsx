import { FieldList, FieldRow } from "@apercura/ui";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { BookletPage } from "~/components/booklet-page";
import {
	ExternalLink,
	InstitutionalCover,
	LegalFactRow,
	ProseSection,
} from "~/components/institutional";
import { AccessibilityAt } from "~/components/legal-at";
import { AccessibilityCh } from "~/components/legal-ch";
import { AccessibilityCz } from "~/components/legal-cz";
import { AccessibilityDe } from "~/components/legal-de";
import { AccessibilityEe } from "~/components/legal-ee";
import { AccessibilityEs } from "~/components/legal-es";
import { AccessibilityFi } from "~/components/legal-fi";
import { AccessibilityGb } from "~/components/legal-gb";
import { AccessibilityIe } from "~/components/legal-ie";
import { AccessibilityIt } from "~/components/legal-it";
import { AccessibilityLt } from "~/components/legal-lt";
import { AccessibilityNo } from "~/components/legal-no";
import { AccessibilityPl } from "~/components/legal-pl";
import { PageGraph } from "~/components/page-graph";
import { PublicPage } from "~/components/public-page";
import { Trail } from "~/components/trail";
import { serverEnv } from "~/env";
import { marketOf } from "~/i18n/locales";
import { localeOf, marketInstitutionalMetadata, proseSections } from "~/lib/institutional";
import { ACCESSIBILITY_STATEMENT_DATE, legalFacts } from "~/lib/legal";
import { LINKS } from "~/lib/links";

export const ensureStatic = "navigation";

const HREF = "/accessibilite" as const;

export function generateMetadata({ params }: PageProps<"/[locale]/accessibilite">) {
	return marketInstitutionalMetadata(
		params,
		{
			FR: "AccessibilityPage",
			AT: "AccessibilityAt",
			GB: "AccessibilityGb",
			CZ: "AccessibilityCz",
			ES: "AccessibilityEs",
			IT: "AccessibilityIt",
			DE: "AccessibilityDe",
			CH: "AccessibilityCh",
			EE: "AccessibilityEe",
			PL: "AccessibilityPl",
			NO: "AccessibilityNo",
			IE: "AccessibilityIe",
			FI: "AccessibilityFi",
			LT: "AccessibilityLt",
		},
		HREF,
	);
}

/**
 * RGAA 4.1 accessibility statement, interim: partially conforming on the strength of a
 * self-assessment and automated tests (docs/accessibility/rgaa-self-assessment.md), the manual
 * audit in progress. To be completed with the audit's rate and non-conforming content.
 */
export default async function AccessibilityPage({ params }: PageProps<"/[locale]/accessibilite">) {
	const locale = await localeOf(params);
	setRequestLocale(locale);
	// Austria's, the UK's, Czechia's, Spain's, Italy's, Germany's, Switzerland's, Estonia's, Poland's, Norway's, Finland's and Lithuania's pages
	// have texts of their own, written for their law.
	if (marketOf(locale) === "AT") return <AccessibilityAt locale={locale} />;
	if (marketOf(locale) === "GB") return <AccessibilityGb locale={locale} />;
	if (marketOf(locale) === "CZ") return <AccessibilityCz locale={locale} />;
	if (marketOf(locale) === "PL") return <AccessibilityPl locale={locale} />;
	if (marketOf(locale) === "FI") return <AccessibilityFi locale={locale} />;
	if (marketOf(locale) === "ES") return <AccessibilityEs locale={locale} />;
	if (marketOf(locale) === "IT") return <AccessibilityIt locale={locale} />;
	if (marketOf(locale) === "DE") return <AccessibilityDe locale={locale} />;
	if (marketOf(locale) === "CH") return <AccessibilityCh locale={locale} />;
	if (marketOf(locale) === "EE") return <AccessibilityEe locale={locale} />;
	if (marketOf(locale) === "NO") return <AccessibilityNo locale={locale} />;
	if (marketOf(locale) === "IE") return <AccessibilityIe locale={locale} />;
	if (marketOf(locale) === "LT") return <AccessibilityLt locale={locale} />;
	const t = await getTranslations({ locale, namespace: "AccessibilityPage" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const format = await getFormatter({ locale });
	const section = await proseSections(locale, "AccessibilityPage");
	const tbc = tI("toBeCompleted");
	const facts = legalFacts(serverEnv);
	const statementDate = format.dateTime(new Date(`${ACCESSIBILITY_STATEMENT_DATE}T12:00:00Z`), {
		dateStyle: "long",
	});

	return (
		<PublicPage locale={locale} href={HREF}>
			<InstitutionalCover
				title={t("title")}
				lead={t("lead")}
				mark={tI("auditMark")}
				note={facts.contactEmail.missing ? tI("placeholderNote") : null}
			/>
			<BookletPage>
				<PageGraph
					locale={locale}
					href={HREF}
					name={t("title")}
					trail={[{ label: t("title"), href: HREF }]}
				/>
				<Trail locale={locale} items={[{ label: t("title"), href: HREF }]} />
				<ProseSection id="engagement" content={section("commitment")} />
				<ProseSection id="conformite" content={section("status")}>
					<FieldList>
						<FieldRow
							label={t("fields.framework")}
							value={t("fields.frameworkValue")}
							emptyLabel={tbc}
						/>
						<FieldRow label={t("fields.status")} value={t("fields.statusValue")} emptyLabel={tbc} />
						<FieldRow label={t("fields.rate")} value={t("fields.rateValue")} emptyLabel={tbc} />
						<FieldRow
							label={t("fields.date")}
							value={<time dateTime={ACCESSIBILITY_STATEMENT_DATE}>{statementDate}</time>}
							emptyLabel={tbc}
						/>
					</FieldList>
				</ProseSection>
				<ProseSection id="tests" content={section("tests")} />
				<ProseSection id="a-verifier" content={section("pending")} />
				<ProseSection id="technologies" content={section("technologies")} />
				<ProseSection id="signaler" content={section("feedback")}>
					<FieldList>
						<LegalFactRow
							label={t("fields.contact")}
							fact={facts.contactEmail}
							email
							emptyLabel={tbc}
						/>
					</FieldList>
				</ProseSection>
				<ProseSection id="recours" content={section("recourse")}>
					<ExternalLink
						href={LINKS.defenseurForm}
						externalLabel={tSite("externalLink")}
						className="inline-flex min-h-11 items-center text-body font-semibold"
					>
						{t("defenseurLink")}
					</ExternalLink>
				</ProseSection>
			</BookletPage>
		</PublicPage>
	);
}
