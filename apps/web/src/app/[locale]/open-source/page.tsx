import { buttonStyles, FieldList, FieldRow, linkStyles } from "@apercura/ui";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookletPage } from "~/components/booklet-page";
import { ExternalLink, InstitutionalCover, ProseSection } from "~/components/institutional";
import { PageGraph } from "~/components/page-graph";
import { PublicPage } from "~/components/public-page";
import { Trail } from "~/components/trail";
import { Link } from "~/i18n/navigation";
import { institutionalMetadata, localeOf, proseSections } from "~/lib/institutional";
import { LINKS } from "~/lib/links";

export const ensureStatic = "navigation";

const HREF = "/open-source" as const;

export function generateMetadata({ params }: PageProps<"/[locale]/open-source">) {
	return institutionalMetadata(params, "OpenSourcePage", HREF);
}

export default async function OpenSourcePage({ params }: PageProps<"/[locale]/open-source">) {
	const locale = await localeOf(params);
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "OpenSourcePage" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const section = await proseSections(locale, "OpenSourcePage");
	const external = tSite("externalLink");

	return (
		<PublicPage locale={locale} href={HREF}>
			<InstitutionalCover title={t("title")} lead={t("lead")} />
			<BookletPage>
				<PageGraph
					locale={locale}
					href={HREF}
					name={t("title")}
					trail={[{ label: t("title"), href: HREF }]}
				/>
				<Trail locale={locale} items={[{ label: t("title"), href: HREF }]} />
				<ProseSection id="licence" content={section("licence")}>
					<FieldList>
						<FieldRow
							label={t("facts.licence")}
							value={
								<ExternalLink href={LINKS.agplText} externalLabel={external}>
									{t("facts.licenceValue")}
								</ExternalLink>
							}
							emptyLabel=""
						/>
						<FieldRow
							label={t("facts.repository")}
							value={
								<ExternalLink href={LINKS.repository} externalLabel={external}>
									github.com/apercura-org/apercura
								</ExternalLink>
							}
							emptyLabel=""
						/>
						<FieldRow
							label={t("facts.data")}
							value={
								<Link href="/donnees" className={linkStyles()}>
									{t("dataValue")}
								</Link>
							}
							emptyLabel=""
						/>
					</FieldList>
				</ProseSection>
				<ProseSection id="possible" content={section("can")} />
				<ProseSection id="auto-hebergement" content={section("selfHost")} />
				<section
					aria-labelledby="repository-heading"
					className="rule-t flex flex-col gap-4 border-b border-rule-soft pt-6 pb-7 sm:flex-row sm:items-center sm:justify-between"
				>
					<div className="flex flex-col gap-1">
						<h2 id="repository-heading" className="type-subtitle">
							{t("cta.heading")}
						</h2>
						<p className="text-body text-ink-muted">{t("cta.body")}</p>
					</div>
					<a
						href={LINKS.repository}
						rel="noopener noreferrer"
						className={buttonStyles({ intent: "ink", size: "lg" })}
					>
						{t("cta.link")}
						<span className="sr-only"> ({external})</span>
					</a>
				</section>
			</BookletPage>
		</PublicPage>
	);
}
