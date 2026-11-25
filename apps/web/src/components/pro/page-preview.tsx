"use client";

import { FieldList, FieldRow, PractitionerHeader, SiteCard } from "@apercura/ui";
import { useTranslations } from "next-intl";
import {
	FeesSection,
	PracticalSection,
	PresentationSection,
	sectionHeading,
} from "~/components/owner-sections";
import type { OwnerContent } from "~/lib/owner-content";
import { addressLines, formatPhone } from "~/lib/practitioner-view";

export type PreviewSite = {
	activityId: number;
	name: string | null;
	addressLine: string | null;
	postcode: string | null;
	placeName: string | null;
	phone: string | null;
	hidden: boolean;
};

export type PreviewIdentity = {
	name: string;
	profession: string;
	rpps: string;
};

/**
 * The editor's live preview: the public page's own booklet components fed
 * with the unsaved draft. Hidden fields and places are left out exactly as
 * the read model leaves them out.
 */
export function PagePreview({
	identity,
	content,
	hiddenFields,
	sites,
	sectors = true,
}: {
	identity: PreviewIdentity;
	content: OwnerContent;
	hiddenFields: readonly string[];
	sites: PreviewSite[];
	/** The profession's fees come in sectors (physicians). */
	sectors?: boolean;
}) {
	const t = useTranslations("Editor.preview");
	const tP = useTranslations("Practitioner");
	const tPage = useTranslations("PractitionerPage");
	const tSite = useTranslations("Site");
	const hidden = (field: string) => hiddenFields.includes(field);
	const shown: OwnerContent = {
		...content,
		photoUrl: hidden("photo") ? null : content.photoUrl,
		headline: hidden("headline") ? null : content.headline,
		bio: hidden("bio") ? null : content.bio,
		languages: hidden("languages") ? [] : content.languages,
		accessibility: hidden("accessibility") ? null : content.accessibility,
		website: hidden("website") ? null : content.website,
	};
	const empty = tP("notProvided");
	const visibleSites = sites.filter((site) => !site.hidden);
	return (
		<div className="flex flex-col gap-10 text-ink" data-testid="page-preview">
			<PractitionerHeader
				headingLevel={3}
				name={identity.name}
				profession={identity.profession}
				rpps={identity.rpps}
				rppsLabel={tP("rpps")}
				status="verified"
				statusLabel={tP("status.verified")}
				statusNote={tP("statusNote.verified")}
				headline={shown.headline}
				photo={
					shown.photoUrl
						? { src: shown.photoUrl, alt: tPage("photoAlt", { name: identity.name }) }
						: null
				}
			/>
			<PresentationSection bio={shown.bio} headingId="preview-presentation" />
			<section aria-labelledby="preview-sites" className="flex flex-col gap-6">
				<h2 id="preview-sites" className={sectionHeading}>
					{tP("sitesHeading")}
				</h2>
				{visibleSites.length === 0 ? (
					<p className="text-body text-ink-muted">{t("noSite")}</p>
				) : (
					visibleSites.map((site) => (
						<SiteCard
							key={site.activityId}
							name={site.name ?? t("unnamedPlace")}
							address={addressLines({
								addressLine: site.addressLine,
								addressComplement: null,
								postcode: site.postcode,
								placeName: site.placeName,
							})}
							directionsLabel={tP("directions")}
							providers={{
								openStreetMap: tP("providers.openStreetMap"),
								appleMaps: tP("providers.appleMaps"),
								googleMaps: tP("providers.googleMaps"),
							}}
							externalLabel={tSite("externalLink")}
						>
							<FieldList>
								<FieldRow
									label={tP("fields.phone")}
									value={
										content.showPhone && site.phone ? (
											<span className="tabular">{formatPhone(site.phone)}</span>
										) : null
									}
									emptyLabel={empty}
								/>
							</FieldList>
						</SiteCard>
					))
				)}
			</section>
			<PracticalSection
				content={shown}
				headingId="preview-practical"
				emptyLabel={empty}
				externalLabel={tSite("externalLink")}
			/>
			<FeesSection
				content={shown}
				headingId="preview-fees"
				emptyLabel={empty}
				externalLabel={tSite("externalLink")}
				sectors={sectors}
			/>
		</div>
	);
}
