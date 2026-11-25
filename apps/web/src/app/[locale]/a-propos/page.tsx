import { FieldList, linkStyles } from "@apercura/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookletPage } from "~/components/booklet-page";
import { InstitutionalCover, LegalFactRow, ProseSection } from "~/components/institutional";
import { PageGraph } from "~/components/page-graph";
import { PublicPage } from "~/components/public-page";
import { Trail } from "~/components/trail";
import { serverEnv } from "~/env";
import { Link } from "~/i18n/navigation";
import { institutionalMetadata, localeOf, proseSections } from "~/lib/institutional";
import { legalFacts } from "~/lib/legal";

export const ensureStatic = "navigation";

const HREF = "/a-propos" as const;

export function generateMetadata({ params }: PageProps<"/[locale]/a-propos">) {
	return institutionalMetadata(params, "AboutPage", HREF);
}

export default async function AboutPage({ params }: PageProps<"/[locale]/a-propos">) {
	const locale = await localeOf(params);
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "AboutPage" });
	const tI = await getTranslations({ locale, namespace: "Institutional" });
	const section = await proseSections(locale, "AboutPage");
	const facts = legalFacts(serverEnv);
	const tbc = tI("toBeCompleted");
	const link = `${linkStyles()} inline-flex min-h-11 items-center text-body font-semibold`;

	return (
		<PublicPage locale={locale} href={HREF}>
			<InstitutionalCover title={t("title")} lead={t("lead")} />
			<BookletPage>
				<PageGraph
					locale={locale}
					href={HREF}
					name={t("title")}
					trail={[{ label: t("title"), href: HREF }]}
					type="AboutPage"
				/>
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
						<LegalFactRow
							label={t("fields.publisher")}
							fact={facts.publisherName}
							emptyLabel={tbc}
						/>
						<LegalFactRow
							label={t("fields.contact")}
							fact={facts.contactEmail}
							email
							emptyLabel={tbc}
						/>
					</FieldList>
					<Link href="/open-source" className={link}>
						{t("links.openSource")}
					</Link>
				</ProseSection>
			</BookletPage>
		</PublicPage>
	);
}
