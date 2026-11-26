import { FieldList, FieldRow } from "@apercura/ui";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { BookletPage } from "~/components/booklet-page";
import {
	InstitutionalCover,
	LegalFactRow,
	LegalFactValue,
	ProseSection,
} from "~/components/institutional";
import { TermsAt } from "~/components/legal-at";
import { TermsCz } from "~/components/legal-cz";
import { TermsGb } from "~/components/legal-gb";
import { PageGraph } from "~/components/page-graph";
import { PublicPage } from "~/components/public-page";
import { Trail } from "~/components/trail";
import { serverEnv } from "~/env";
import { marketOf } from "~/i18n/locales";
import { localeOf, marketInstitutionalMetadata, proseSections } from "~/lib/institutional";
import {
	LEGAL_REVIEW_PLACEHOLDERS,
	LEGAL_TEXTS_REVIEWED,
	type LegalValue,
	legalFacts,
} from "~/lib/legal";

export const ensureStatic = "navigation";

const HREF = "/conditions" as const;

export function generateMetadata({ params }: PageProps<"/[locale]/conditions">) {
	return marketInstitutionalMetadata(
		params,
		{ FR: "TermsPage", AT: "TermsAt", GB: "TermsGb", CZ: "TermsCz" },
		HREF,
	);
}

/**
 * Terms of use, for patients and practitioners. Draft until the legal review: the publisher
 * and dates come from `LEGAL_*`, and the regulatory conventionnement notice (order of
 * 30 May 2018, art. 5) stays a visible placeholder until the reviewed wording replaces it.
 */
export default async function TermsPage({ params }: PageProps<"/[locale]/conditions">) {
	const locale = await localeOf(params);
	setRequestLocale(locale);
	// Austria's, the UK's and Czechia's pages have texts of their own, written for their law.
	if (marketOf(locale) === "AT") return <TermsAt locale={locale} />;
	if (marketOf(locale) === "GB") return <TermsGb locale={locale} />;
	if (marketOf(locale) === "CZ") return <TermsCz locale={locale} />;
	const t = await getTranslations({ locale, namespace: "TermsPage" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const format = await getFormatter({ locale });
	const section = await proseSections(locale, "TermsPage");
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
				<ProseSection id="service" content={section("service")}>
					<FieldList>
						<LegalFactRow
							label={t("fields.publisher")}
							fact={facts.publisherName}
							emptyLabel={tbc}
						/>
						<LegalFactRow label={t("fields.effectiveDate")} fact={effectiveDate} emptyLabel={tbc} />
						<LegalFactRow
							label={t("fields.contact")}
							fact={facts.contactEmail}
							email
							emptyLabel={tbc}
						/>
					</FieldList>
				</ProseSection>
				<ProseSection id="contenu" content={section("content")} />
				<ProseSection id="honoraires" content={section("fees")}>
					<FieldList>
						<FieldRow
							label={t("fields.conventionnementWording")}
							value={
								<LegalFactValue
									fact={{ value: LEGAL_REVIEW_PLACEHOLDERS.conventionnementWording, missing: true }}
								/>
							}
							emptyLabel={tbc}
						/>
					</FieldList>
				</ProseSection>
				<ProseSection id="rendez-vous" content={section("booking")} />
				<ProseSection id="avis-medical" content={section("health")} />
				<ProseSection id="professionnels" content={section("practitioners")} />
				<ProseSection id="retrait" content={section("removal")} />
				<ProseSection id="responsabilite" content={section("liability")} />
				<ProseSection id="code-et-donnees" content={section("ip")} />
				<ProseSection id="droit-applicable" content={section("law")}>
					<FieldList>
						<FieldRow label={t("fields.law")} value={t("fields.lawValue")} emptyLabel={tbc} />
					</FieldList>
				</ProseSection>
			</BookletPage>
		</PublicPage>
	);
}
