import { FieldList, FieldRow } from "@apercura/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookletPage } from "~/components/booklet-page";
import { InstitutionalCover, ProseSection } from "~/components/institutional";
import { PublicPage } from "~/components/public-page";
import { Trail } from "~/components/trail";
import { institutionalMetadata, localeOf, proseSections } from "~/lib/institutional";

export const ensureStatic = "navigation";

const HREF = "/conditions" as const;

export function generateMetadata({ params }: PageProps<"/[locale]/conditions">) {
	return institutionalMetadata(params, "TermsPage", HREF);
}

export default async function TermsPage({ params }: PageProps<"/[locale]/conditions">) {
	const locale = await localeOf(params);
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "TermsPage" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const section = await proseSections(locale, "TermsPage");
	const tbc = tI("toBeCompleted");

	return (
		<PublicPage locale={locale} href={HREF}>
			<InstitutionalCover title={t("title")} lead={t("lead")} mark={tI("draftMark")} />
			<BookletPage runningHead={tSite("runningHead")}>
				<Trail locale={locale} items={[{ label: t("title"), href: HREF }]} />
				<ProseSection id="service" content={section("service")}>
					<FieldList>
						<FieldRow label={t("fields.effectiveDate")} emptyLabel={tbc} />
						<FieldRow label={t("fields.law")} emptyLabel={tbc} />
						<FieldRow label={t("fields.contact")} emptyLabel={tbc} />
					</FieldList>
				</ProseSection>
				<ProseSection id="contenu" content={section("content")} />
				<ProseSection id="avis-medical" content={section("health")} />
				<ProseSection id="professionnels" content={section("practitioners")} />
				<ProseSection id="code-et-donnees" content={section("ip")} />
			</BookletPage>
		</PublicPage>
	);
}
