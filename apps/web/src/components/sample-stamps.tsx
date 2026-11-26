import { Stamp, StampFoot, type StampInk } from "@apercura/ui";
import { getTranslations } from "next-intl/server";
import type { Locale } from "~/i18n/routing";
import { getTaxonomyLabels } from "~/lib/labels";
import { SPECIMEN } from "./specimen-page";

/**
 * Three fictitious practitioners, one per state of a page: the RPPS numbers are Luhn-valid but
 * synthetic, the names and addresses say plainly that they are examples.
 */
const SAMPLES = [
	{
		name: SPECIMEN.name,
		listing: "medecin-generaliste",
		gender: "other",
		address: SPECIMEN.address,
		rpps: SPECIMEN.rpps,
		status: "unclaimed",
		ink: "outlined",
	},
	{
		name: "Dr Exemple Bernard",
		listing: "chirurgien-dentiste",
		gender: "other",
		address: "3 place de l’Exemple, 33000 Bordeaux",
		rpps: "10000000017",
		status: "verified",
		ink: "solid",
	},
	{
		name: "Exemple Durand",
		listing: "infirmier",
		gender: "female",
		address: "8 avenue de l’Exemple, 59000 Lille",
		rpps: "10000000025",
		status: "claimed",
		ink: "hatched",
	},
] as const satisfies readonly {
	name: string;
	listing: string;
	gender: "female" | "other";
	address: string;
	rpps: string;
	status: "unclaimed" | "claimed" | "verified";
	ink: StampInk;
}[];

/**
 * The home's sample stamps, one under the other with a hairline between them: how every
 * practitioner appears, in each state of their page (unclaimed, verified, claim being checked).
 * Labelled as fictitious; phones show the first one only.
 */
export async function SampleStamps({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "Practitioner" });
	const labels = await getTaxonomyLabels(locale);
	return (
		<div className="flex flex-col gap-3">
			<p id="sample-stamps" className="type-caption text-ink-muted">
				{t("specimen")}
			</p>
			<ul aria-labelledby="sample-stamps" className="flex flex-col border-t border-rule-soft">
				{SAMPLES.map((sample, index) => (
					<li
						key={sample.rpps}
						className={`border-b border-rule-soft py-4 ${index > 0 ? "max-lg:hidden" : ""}`}
					>
						<Stamp ink={sample.ink}>
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
									<span>{sample.rpps}</span>
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
