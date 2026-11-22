import { FieldList, FieldRow, linkStyles } from "@apercura/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookletPage } from "~/components/booklet-page";
import { ExternalLink, InstitutionalCover, ProseSection } from "~/components/institutional";
import { PageGraph } from "~/components/page-graph";
import { PublicPage } from "~/components/public-page";
import { Trail } from "~/components/trail";
import { serverEnv } from "~/env";
import { getPathname } from "~/i18n/navigation";
import { institutionalMetadata, localeOf, proseSections } from "~/lib/institutional";
import { LINKS } from "~/lib/links";

export const ensureStatic = "navigation";

const HREF = "/confidentialite" as const;

export function generateMetadata({ params }: PageProps<"/[locale]/confidentialite">) {
	return institutionalMetadata(params, "PrivacyPage", HREF);
}

export default async function PrivacyPage({ params }: PageProps<"/[locale]/confidentialite">) {
	const locale = await localeOf(params);
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "PrivacyPage" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const section = await proseSections(locale, "PrivacyPage");
	const tbc = tI("toBeCompleted");
	// Hosting by an HDS-certified host is only stated where it is true (see lib/pillars.ts).
	const hdsHost = serverEnv.PUBLIC_HDS_HOST?.trim();
	const link = `${linkStyles()} inline-flex min-h-11 items-center text-body font-semibold`;

	return (
		<PublicPage locale={locale} href={HREF}>
			<InstitutionalCover title={t("title")} lead={t("lead")} mark={tI("draftMark")} />
			<BookletPage runningHead={tSite("runningHead")}>
				<PageGraph
					locale={locale}
					href={HREF}
					name={t("title")}
					trail={[{ label: t("title"), href: HREF }]}
				/>
				<Trail locale={locale} items={[{ label: t("title"), href: HREF }]} />
				<ProseSection id="responsable" content={section("roles")}>
					<FieldList>
						<FieldRow label={t("fields.controller")} emptyLabel={tbc} />
						<FieldRow label={t("fields.dpo")} emptyLabel={tbc} />
						<FieldRow
							label={t("fields.hosting")}
							value={hdsHost ? t("hostedBy", { host: hdsHost }) : null}
							emptyLabel={tbc}
						/>
					</FieldList>
				</ProseSection>
				<ProseSection id="professionnels" content={section("practitioners")}>
					<a href={`${getPathname({ href: "/donnees", locale })}#retrait`} className={link}>
						{t("objectLink")}
					</a>
				</ProseSection>
				<ProseSection id="patients" content={section("patients")} />
				<ProseSection id="cookies" content={section("cookies")} />
				<ProseSection id="droits" content={section("rights")}>
					<FieldList>
						<FieldRow label={t("fields.contact")} emptyLabel={tbc} />
					</FieldList>
					<ExternalLink
						href={LINKS.cnilComplaint}
						externalLabel={tSite("externalLink")}
						className="inline-flex min-h-11 items-center text-body font-semibold"
					>
						{t("cnilLink")}
					</ExternalLink>
				</ProseSection>
			</BookletPage>
		</PublicPage>
	);
}
