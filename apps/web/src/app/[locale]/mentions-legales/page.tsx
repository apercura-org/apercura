import { FieldList, FieldRow, linkStyles } from "@apercura/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookletPage } from "~/components/booklet-page";
import { InstitutionalCover, ProseSection } from "~/components/institutional";
import { PublicPage } from "~/components/public-page";
import { Trail } from "~/components/trail";
import { serverEnv } from "~/env";
import { Link } from "~/i18n/navigation";
import { institutionalMetadata, localeOf, proseSections } from "~/lib/institutional";

export const ensureStatic = "navigation";

const HREF = "/mentions-legales" as const;

export function generateMetadata({ params }: PageProps<"/[locale]/mentions-legales">) {
	return institutionalMetadata(params, "LegalPage", HREF);
}

/** LCEN legal notice. The legal entity does not exist yet: its fields print empty. */
export default async function LegalPage({ params }: PageProps<"/[locale]/mentions-legales">) {
	const locale = await localeOf(params);
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "LegalPage" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const section = await proseSections(locale, "LegalPage");
	const tbc = tI("toBeCompleted");
	const host = serverEnv.PUBLIC_HDS_HOST?.trim() || null;

	return (
		<PublicPage locale={locale} href={HREF}>
			<InstitutionalCover title={t("title")} lead={t("lead")} mark={tI("draftMark")} />
			<BookletPage runningHead={tSite("runningHead")}>
				<Trail locale={locale} items={[{ label: t("title"), href: HREF }]} />
				<ProseSection id="editeur" content={section("publisher")}>
					<FieldList>
						<FieldRow label={t("fields.name")} emptyLabel={tbc} />
						<FieldRow label={t("fields.legalForm")} emptyLabel={tbc} />
						<FieldRow label={t("fields.address")} emptyLabel={tbc} />
						<FieldRow label={t("fields.registration")} emptyLabel={tbc} />
						<FieldRow label={t("fields.director")} emptyLabel={tbc} />
						<FieldRow label={t("fields.contact")} emptyLabel={tbc} />
					</FieldList>
				</ProseSection>
				<ProseSection id="hebergeur" content={section("hosting")}>
					<FieldList>
						<FieldRow label={t("fields.hostName")} value={host} emptyLabel={tbc} />
						<FieldRow label={t("fields.hostAddress")} emptyLabel={tbc} />
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
			</BookletPage>
		</PublicPage>
	);
}
