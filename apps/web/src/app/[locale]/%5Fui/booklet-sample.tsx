import {
	ActionBlock,
	FieldList,
	FieldRow,
	MapView,
	PractitionerHeader,
	ProvenanceNote,
	SiteCard,
} from "@apercura/ui";
import { getTranslations } from "next-intl/server";
import { clientEnv } from "~/env";
import type { Locale } from "~/i18n/routing";
import { getMapStrings } from "~/lib/map-strings";
import { SAMPLE_DETAILS, SAMPLE_PRACTITIONERS, SAMPLE_SITE, SAMPLE_UPDATED_AT } from "./fixtures";
import { SlotDemo } from "./slot-demo";

/**
 * A practitioner's booklet page composed only of domain components, in its
 * unclaimed (registry facts, call the practice) and verified (completed, bookable) variants.
 */
export async function BookletSample({
	locale,
	variant,
}: {
	locale: Locale;
	variant: "unclaimed" | "verified";
}) {
	const t = await getTranslations({ locale, namespace: "Practitioner" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const mapStrings = await getMapStrings(locale);
	const practitioner = SAMPLE_PRACTITIONERS[0];
	if (!practitioner) {
		return null;
	}
	const verified = variant === "verified";
	const empty = t("notProvided");
	const providers = {
		openStreetMap: t("providers.openStreetMap"),
		appleMaps: t("providers.appleMaps"),
		googleMaps: t("providers.googleMaps"),
	};

	return (
		<article
			className="rounded-panel border border-rule-soft bg-paper"
			aria-label={`${practitioner.name}, ${t(`status.${variant}`)}`}
		>
			<div
				className="flex items-baseline justify-between gap-4 border-b border-rule-soft px-5 py-2 sm:px-8"
				aria-hidden="true"
			>
				<span className="type-caption text-ink">{tSite("runningHead")}</span>
				<span className="type-caption tabular text-ink">
					{tSite("folioRpps", { rpps: practitioner.rpps })}
				</span>
			</div>
			<div className="flex flex-col gap-8 p-5 sm:p-8">
				<PractitionerHeader
					headingLevel={3}
					name={practitioner.name}
					profession={t("professions.gp")}
					rpps={practitioner.rpps}
					rppsLabel={t("rpps")}
					status={variant}
					statusLabel={t(`status.${variant}`)}
					statusNote={t(`statusNote.${variant}`)}
				/>
				<div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
					<div className="flex flex-col gap-8">
						<FieldList>
							<FieldRow
								label={t("fields.profession")}
								value={t("professions.gp")}
								emptyLabel={empty}
							/>
							<FieldRow
								label={t("fields.phone")}
								value={verified ? SAMPLE_SITE.phoneDisplay : null}
								emptyLabel={empty}
							/>
							<FieldRow
								label={t("fields.hours")}
								value={verified ? SAMPLE_DETAILS.hours : null}
								emptyLabel={empty}
							/>
							<FieldRow
								label={t("fields.languages")}
								value={verified ? SAMPLE_DETAILS.languages : null}
								emptyLabel={empty}
							/>
							<FieldRow
								label={t("fields.convention")}
								value={verified ? SAMPLE_DETAILS.convention : null}
								emptyLabel={empty}
							/>
						</FieldList>
						<SiteCard
							name={SAMPLE_SITE.name}
							address={[...SAMPLE_SITE.address]}
							coordinates={SAMPLE_SITE.coordinates}
							directionsLabel={t("directions")}
							providers={providers}
							externalLabel={tSite("externalLink")}
						/>
						{verified ? (
							<MapView
								className="h-72"
								center={SAMPLE_SITE.coordinates}
								styleUrl={clientEnv.NEXT_PUBLIC_MAP_STYLE_URL}
								label={t("mapLabel", { place: SAMPLE_SITE.name })}
								markerLabel={t("mapPin", { place: SAMPLE_SITE.name })}
								strings={mapStrings}
								fallback={
									<p className="bg-paper/90 p-2 text-meta text-ink">
										{SAMPLE_SITE.address.join(", ")}
									</p>
								}
							/>
						) : null}
					</div>
					<div className="flex flex-col gap-6">
						{verified ? (
							<ActionBlock
								headingLevel={4}
								kind="book"
								title={t("action.title")}
								statement={t("action.book.statement")}
								actionLabel={t("action.book.label")}
								href="#booking"
							/>
						) : (
							<ActionBlock
								headingLevel={4}
								kind="call"
								title={t("action.title")}
								statement={t("action.call.statement")}
								actionLabel={t("action.call.label", { phone: SAMPLE_SITE.phoneDisplay })}
								phone={SAMPLE_SITE.phone}
							/>
						)}
					</div>
				</div>
				{verified ? (
					<section className="flex flex-col gap-3">
						<h4 className="type-subtitle text-ink">{t("slots.heading")}</h4>
						<SlotDemo />
					</section>
				) : null}
				<ProvenanceNote
					locale={locale}
					sourceLabel={t("source.label")}
					source={t("source.name")}
					updatedLabel={t("source.updated")}
					updatedAt={SAMPLE_UPDATED_AT}
				/>
			</div>
		</article>
	);
}
