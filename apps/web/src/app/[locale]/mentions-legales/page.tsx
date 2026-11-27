import { FieldList, FieldRow, linkStyles } from "@apercura/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookletPage } from "~/components/booklet-page";
import { InstitutionalCover, LegalFactRow, ProseSection } from "~/components/institutional";
import { ImpressumAt } from "~/components/legal-at";
import { LegalNoticeCh } from "~/components/legal-ch";
import { LegalNoticeCz } from "~/components/legal-cz";
import { ImpressumDe } from "~/components/legal-de";
import { LegalNoticeEe } from "~/components/legal-ee";
import { LegalNoticeEs } from "~/components/legal-es";
import { LegalNoticeGb } from "~/components/legal-gb";
import { LegalNoticeIt } from "~/components/legal-it";
import { LegalNoticePl } from "~/components/legal-pl";
import { PageGraph } from "~/components/page-graph";
import { PublicPage } from "~/components/public-page";
import { Trail } from "~/components/trail";
import { serverEnv } from "~/env";
import { marketOf } from "~/i18n/locales";
import { Link } from "~/i18n/navigation";
import { localeOf, marketInstitutionalMetadata, proseSections } from "~/lib/institutional";
import { LEGAL_TEXTS_REVIEWED, legalFacts } from "~/lib/legal";

export const ensureStatic = "navigation";

const HREF = "/mentions-legales" as const;

export function generateMetadata({ params }: PageProps<"/[locale]/mentions-legales">) {
	return marketInstitutionalMetadata(
		params,
		{
			FR: "LegalPage",
			AT: "ImpressumAt",
			GB: "LegalNoticeGb",
			CZ: "LegalNoticeCz",
			ES: "LegalNoticeEs",
			IT: "LegalNoticeIt",
			DE: "ImpressumDe",
			CH: "LegalNoticeCh",
			EE: "LegalNoticeEe",
			PL: "LegalNoticePl",
		},
		HREF,
	);
}

/**
 * LCEN legal notice (art. 6 III): publisher, publication director, host. The legal entity does
 * not exist yet: its facts come from the `LEGAL_*` configuration and print as `{{…}}`
 * placeholders until then (production refuses to start without them).
 */
export default async function LegalPage({ params }: PageProps<"/[locale]/mentions-legales">) {
	const locale = await localeOf(params);
	setRequestLocale(locale);
	// Austria's, the UK's, Czechia's, Spain's, Italy's, Germany's, Switzerland's and Poland's, Switzerland's and Estonia's pages
	// have texts of their own, written for their law.
	if (marketOf(locale) === "AT") return <ImpressumAt locale={locale} />;
	if (marketOf(locale) === "GB") return <LegalNoticeGb locale={locale} />;
	if (marketOf(locale) === "CZ") return <LegalNoticeCz locale={locale} />;
	if (marketOf(locale) === "PL") return <LegalNoticePl locale={locale} />;
	if (marketOf(locale) === "ES") return <LegalNoticeEs locale={locale} />;
	if (marketOf(locale) === "IT") return <LegalNoticeIt locale={locale} />;
	if (marketOf(locale) === "DE") return <ImpressumDe locale={locale} />;
	if (marketOf(locale) === "CH") return <LegalNoticeCh locale={locale} />;
	if (marketOf(locale) === "EE") return <LegalNoticeEe locale={locale} />;
	const t = await getTranslations({ locale, namespace: "LegalPage" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const section = await proseSections(locale, "LegalPage");
	const facts = legalFacts(serverEnv);
	const tbc = tI("toBeCompleted");
	// Hosting by an HDS-certified host is only stated where it is true (see lib/pillars.ts).
	const hdsHost = serverEnv.PUBLIC_HDS_HOST?.trim();
	const anyMissing = Object.values(facts).some((fact) => fact.missing);

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
				<ProseSection id="editeur" content={section("publisher")}>
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
					</FieldList>
				</ProseSection>
				<ProseSection id="direction" content={section("director")}>
					<FieldList>
						<LegalFactRow
							label={t("fields.director")}
							fact={facts.publicationDirector}
							emptyLabel={tbc}
						/>
					</FieldList>
				</ProseSection>
				<ProseSection id="hebergeur" content={section("hosting")}>
					<FieldList>
						<LegalFactRow label={t("fields.hostName")} fact={facts.hostName} emptyLabel={tbc} />
						<LegalFactRow
							label={t("fields.hostAddress")}
							fact={facts.hostAddress}
							emptyLabel={tbc}
						/>
						<LegalFactRow label={t("fields.hostPhone")} fact={facts.hostPhone} emptyLabel={tbc} />
						{hdsHost ? (
							<FieldRow
								label={t("fields.healthData")}
								value={t("hdsHosted", { host: hdsHost })}
								emptyLabel={tbc}
							/>
						) : null}
					</FieldList>
				</ProseSection>
				<ProseSection id="code-et-donnees" content={section("ip")}>
					<Link
						href="/donnees"
						className={`${linkStyles()} inline-flex min-h-11 items-center text-body font-semibold`}
					>
						{t("dataLink")}
					</Link>
				</ProseSection>
				{LEGAL_TEXTS_REVIEWED ? null : <ProseSection id="statut" content={section("review")} />}
			</BookletPage>
		</PublicPage>
	);
}
