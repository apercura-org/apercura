import { FieldList, FieldRow } from "@apercura/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookletPage } from "~/components/booklet-page";
import { ExternalLink, InstitutionalCover, ProseSection } from "~/components/institutional";
import { PageGraph } from "~/components/page-graph";
import { PublicPage } from "~/components/public-page";
import { Trail } from "~/components/trail";
import { institutionalMetadata, localeOf, proseSections } from "~/lib/institutional";
import { LINKS } from "~/lib/links";

export const ensureStatic = "navigation";

const HREF = "/accessibilite" as const;

export function generateMetadata({ params }: PageProps<"/[locale]/accessibilite">) {
	return institutionalMetadata(params, "AccessibilityPage", HREF);
}

/** Draft RGAA 4.1 accessibility statement: no audit has been run yet. */
export default async function AccessibilityPage({ params }: PageProps<"/[locale]/accessibilite">) {
	const locale = await localeOf(params);
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "AccessibilityPage" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const section = await proseSections(locale, "AccessibilityPage");
	const tbc = tI("toBeCompleted");

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
				<ProseSection id="engagement" content={section("commitment")} />
				<ProseSection id="conformite" content={section("status")}>
					<FieldList>
						<FieldRow
							label={t("fields.framework")}
							value={t("fields.frameworkValue")}
							emptyLabel={tbc}
						/>
						<FieldRow label={t("fields.status")} value={t("fields.statusValue")} emptyLabel={tbc} />
						<FieldRow label={t("fields.date")} emptyLabel={tbc} />
					</FieldList>
				</ProseSection>
				<ProseSection id="tests" content={section("tests")} />
				<ProseSection id="technologies" content={section("technologies")} />
				<ProseSection id="signaler" content={section("feedback")}>
					<FieldList>
						<FieldRow label={t("fields.contact")} emptyLabel={tbc} />
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
