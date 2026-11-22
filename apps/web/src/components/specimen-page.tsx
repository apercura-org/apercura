import { FieldList, FieldRow, PractitionerHeader, ProvenanceNote } from "@apercura/ui";
import { getTranslations } from "next-intl/server";
import type { Locale } from "~/i18n/routing";

/**
 * Fictitious practitioner printed as the specimen of an unclaimed page. The RPPS is
 * Luhn-valid but synthetic; the name and address say plainly that they are examples.
 */
export const SPECIMEN = {
	name: "Dr Exemple Martin",
	rpps: "10000000009",
	address: "12 rue de l’Exemple, 69000 Lyon",
	updatedAt: "2026-11-19",
} as const;

/**
 * The specimen booklet page: an unclaimed page exactly as the register fills it,
 * with its seal, honest empty fields and provenance, labelled as fictitious.
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
	const empty = t("notProvided");
	return (
		<article
			aria-label={`${SPECIMEN.name}, ${t("specimen")}`}
			className="border border-dashed border-field-edge bg-paper"
		>
			<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule-soft px-5 py-2 sm:px-8">
				<span className="caps text-ink">{t("specimen")}</span>
				<span className="caps tabular text-ink" aria-hidden="true">
					{tSite("folioRpps", { rpps: SPECIMEN.rpps })}
				</span>
			</div>
			<div className="flex flex-col gap-6 p-5 sm:p-8">
				<PractitionerHeader
					headingLevel={headingLevel}
					name={SPECIMEN.name}
					profession={t("professions.gp")}
					rpps={SPECIMEN.rpps}
					rppsLabel={t("rpps")}
					status="unclaimed"
					statusLabel={t("status.unclaimed")}
					statusNote={t("statusNote.unclaimed")}
				/>
				<FieldList className="border-t-0">
					<FieldRow label={t("fields.address")} value={SPECIMEN.address} emptyLabel={empty} />
					<FieldRow label={t("fields.phone")} emptyLabel={empty} />
					<FieldRow label={t("fields.hours")} emptyLabel={empty} />
					<FieldRow label={t("fields.booking")} emptyLabel={empty} />
				</FieldList>
				<ProvenanceNote
					locale={locale}
					sourceLabel={t("source.label")}
					source={t("source.name")}
					updatedLabel={t("source.updated")}
					updatedAt={SPECIMEN.updatedAt}
				/>
			</div>
		</article>
	);
}
