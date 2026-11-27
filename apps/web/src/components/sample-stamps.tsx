import { Stamp, StampFoot, type StampInk } from "@apercura/ui";
import { getTranslations } from "next-intl/server";
import type { Locale } from "~/i18n/routing";
import { homeSamples, type SampleStatus } from "~/lib/home-samples";
import { getTaxonomyLabels } from "~/lib/labels";

/** The stamp's ink in each state: outlined while unclaimed, solid once verified, hatched while checked. */
const INK: Readonly<Record<SampleStatus, StampInk>> = {
	unclaimed: "outlined",
	verified: "solid",
	claimed: "hatched",
};

/**
 * The home's sample stamps, one under the other: how every page of the market appears (a
 * practitioner, a practice or a facility, as its directory lists them), in each state of a page
 * (unclaimed, verified, claim being checked). Fictitious and labelled so; phones show the first
 * one only.
 */
export async function SampleStamps({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "Practitioner" });
	const labels = await getTaxonomyLabels(locale);
	return (
		<div className="flex flex-col gap-3">
			<p id="sample-stamps" className="type-caption text-ink-muted">
				{t("specimen")}
			</p>
			<ul aria-labelledby="sample-stamps" className="flex flex-col gap-4">
				{homeSamples(locale).map((sample, index) => (
					<li key={sample.identifier} className={index > 0 ? "max-lg:hidden" : undefined}>
						<Stamp ink={INK[sample.status]}>
							<div className="flex flex-col gap-0.5 px-4 pt-3 pb-3">
								<p className="font-display text-lead leading-tight font-semibold tracking-[-0.01em]">
									{sample.name}
								</p>
								<p className="text-meta">{labels.occupation(sample.listing, sample.gender)}</p>
								<p className="text-meta">{sample.address}</p>
							</div>
							<StampFoot>
								<span>
									<span className="me-1.5">{t("rpps")}</span>
									<span>{sample.identifier}</span>
								</span>
								<span>{t(`status.${sample.status}`)}</span>
							</StampFoot>
						</Stamp>
					</li>
				))}
			</ul>
		</div>
	);
}
