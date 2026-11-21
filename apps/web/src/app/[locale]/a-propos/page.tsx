import { FieldList, FieldRow, linkStyles } from "@apercura/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookletPage } from "~/components/booklet-page";
import { InstitutionalCover, ProseSection } from "~/components/institutional";
import { PublicPage } from "~/components/public-page";
import { Trail } from "~/components/trail";
import { Link } from "~/i18n/navigation";
import { institutionalMetadata, localeOf, proseSections } from "~/lib/institutional";

export const ensureStatic = "navigation";

const HREF = "/a-propos" as const;

export function generateMetadata({ params }: PageProps<"/[locale]/a-propos">) {
	return institutionalMetadata(params, "AboutPage", HREF);
}

export default async function AboutPage({ params }: PageProps<"/[locale]/a-propos">) {
	const locale = await localeOf(params);
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "AboutPage" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const section = await proseSections(locale, "AboutPage");
	const link = `${linkStyles()} inline-flex min-h-11 items-center text-body font-semibold`;

	return (
		<PublicPage locale={locale} href={HREF}>
			<InstitutionalCover title={t("title")} lead={t("lead")} />
			<BookletPage runningHead={tSite("runningHead")}>
				<Trail locale={locale} items={[{ label: t("title"), href: HREF }]} />
				<ProseSection id="ce-que-fait-apercura" content={section("what")} />
				<ProseSection id="principes" content={section("principles")} />
				<ProseSection id="sources" content={section("how")}>
					<Link href="/donnees" className={link}>
						{t("links.data")}
					</Link>
				</ProseSection>
				<ProseSection id="qui" content={section("who")}>
					<FieldList>
						<FieldRow label={t("fields.publisher")} emptyLabel={tI("toBeCompleted")} />
						<FieldRow label={t("fields.contact")} emptyLabel={tI("toBeCompleted")} />
					</FieldList>
					<Link href="/open-source" className={link}>
						{t("links.openSource")}
					</Link>
				</ProseSection>
			</BookletPage>
		</PublicPage>
	);
}
