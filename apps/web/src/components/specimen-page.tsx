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
 * The specimen page: an unclaimed page exactly as the register fills it, its stamp outlined,
 * honest empty fields and the source line, labelled as fictitious.
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
			className="rule-double-t flex flex-col gap-6 pt-3"
		>
			<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<span className="type-caption text-ink-muted">{t("specimen")}</span>
				<span className="type-caption tabular text-ink-muted" aria-hidden="true">
					{tSite("folioRpps", { rpps: SPECIMEN.rpps })}
				</span>
			</div>
			<div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
				<PractitionerHeader
					headingLevel={headingLevel}
					name={SPECIMEN.name}
					profession={t("professions.gp")}
					address={SPECIMEN.address}
					rpps={SPECIMEN.rpps}
					rppsLabel={t("rpps")}
					status="unclaimed"
					statusLabel={t("status.unclaimed")}
					statusNote={t("statusNote.unclaimed")}
				/>
				<div className="flex flex-col">
					<FieldList>
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
			</div>
		</article>
	);
}
