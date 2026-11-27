import { FieldList, FieldRow, PractitionerHeader, ProvenanceNote } from "@apercura/ui";
import { getTranslations } from "next-intl/server";
import { marketOf } from "~/i18n/locales";
import type { Locale } from "~/i18n/routing";
import { SPECIMEN_UPDATED_AT, specimenOf } from "~/lib/home-samples";
import { getTaxonomyLabels } from "~/lib/labels";
import { marketBooks } from "~/lib/market";
import { getHomeSources } from "~/server/queries/home";

/**
 * The specimen page: an unclaimed page of the market exactly as its sources fill it (a
 * practitioner in France, a doctor in Austria, a practice in the UK, a facility in Germany…),
 * its stamp outlined, honest empty fields and the source line, labelled as fictitious. Online
 * booking is a field only where the market books; elsewhere the page's website is.
 */
export async function SpecimenPage({
	locale,
	headingLevel = 3,
}: {
	locale: Locale;
	headingLevel?: 2 | 3;
}) {
	const t = await getTranslations({ locale, namespace: "Practitioner" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const tProfile = await getTranslations({ locale, namespace: "Profile" });
	const labels = await getTaxonomyLabels(locale);
	const specimen = specimenOf(locale);
	const sources = await getHomeSources(marketOf(locale));
	const empty = t("notProvided");
	return (
		<article
			aria-label={`${specimen.name}, ${t("specimen")}`}
			className="rule-t flex flex-col gap-6 pt-3"
		>
			<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<span className="type-caption text-ink-muted">{t("specimen")}</span>
				<span className="type-caption tabular text-ink-muted" aria-hidden="true">
					{tSite("folioRpps", { rpps: specimen.identifier })}
				</span>
			</div>
			<div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
				<PractitionerHeader
					headingLevel={headingLevel}
					name={specimen.name}
					profession={labels.occupation(specimen.listing, specimen.gender) ?? ""}
					address={specimen.address}
					rpps={specimen.identifier}
					rppsLabel={t("rpps")}
					status="unclaimed"
					statusLabel={t("status.unclaimed")}
					statusNote={t("statusNote.unclaimed")}
				/>
				<div className="flex flex-col">
					<FieldList>
						<FieldRow label={t("fields.address")} value={specimen.address} emptyLabel={empty} />
						<FieldRow label={t("fields.phone")} emptyLabel={empty} />
						<FieldRow label={t("fields.hours")} emptyLabel={empty} />
						{marketBooks(locale) ? (
							<FieldRow label={t("fields.booking")} emptyLabel={empty} />
						) : (
							<FieldRow label={tProfile("fields.website")} emptyLabel={empty} />
						)}
					</FieldList>
					<ProvenanceNote
						locale={locale}
						sourceLabel={t("source.label")}
						source={sources || t("source.name")}
						updatedLabel={t("source.updated")}
						updatedAt={SPECIMEN_UPDATED_AT}
					/>
				</div>
			</div>
		</article>
	);
}
