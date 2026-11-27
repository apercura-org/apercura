import { countryAdapter } from "@apercura/core/country";
import {
	AT_DENTIST,
	AT_DOCTOR,
	CH_DEFAULT_PROFESSIONS,
	CY_DEFAULT_PROFESSIONS,
	CZ_DEFAULT_PROFESSIONS,
	DE_DEFAULT_PROFESSIONS,
	EE_DEFAULT_PROFESSIONS,
	ES_DEFAULT_PROFESSIONS,
	FI_DEFAULT_PROFESSIONS,
	GB_DENTAL_PRACTICE,
	GB_GP_PRACTICE,
	GB_PHARMACY,
	IE_DEFAULT_PROFESSIONS,
	IT_DEFAULT_PROFESSIONS,
	LT_DEFAULT_PROFESSIONS,
	LV_DEFAULT_PROFESSIONS,
	NO_DEFAULT_PROFESSIONS,
	PL_DEFAULT_PROFESSIONS,
	SE_DEFAULT_PROFESSIONS,
	SI_DEFAULT_PROFESSIONS,
} from "@apercura/core/taxonomy";
import { FieldList, FieldRow, linkStyles, ProvenanceNote } from "@apercura/ui";
import { getTranslations } from "next-intl/server";
import { CountLinks } from "~/components/listing";
import { type MarketCountry, marketOf } from "~/i18n/locales";
import { Link } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { type FigureRow, homePlaces, listingRows } from "~/lib/home";
import { getTaxonomyLabels } from "~/lib/labels";
import { getHomeSources } from "~/server/queries/home";
import { getDirectoryIndex, getMarketOverview } from "~/server/queries/hubs";
import { getImportStatus, getRegistryFigures } from "~/server/queries/registry";
import { getSwissCoverageTexts } from "~/server/queries/swiss-coverage";

/*
 * The sections of the home that read the directory, the same for every market: its listings
 * and places, then its sources and figures. Each leaves itself out while it has nothing to show
 * (before the first import), so no heading stands over an empty block.
 */

/**
 * The directory: the market's largest listings by kind (France's specialties, the UK's types of
 * practice, Germany's kinds of facility) and its places, each a hub (France's départements and
 * Germany's Kreise with the most pages, Austria's Bundesländer, the UK's regions and nations,
 * Czechia's districts, Spain's provinces, Italy's regions, Switzerland's cantons), then the
 * directory page that lists every place.
 */
export async function HomeDirectory({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "HomePage" });
	const tDirectory = await getTranslations({ locale, namespace: "Directory" });
	const labels = await getTaxonomyLabels(locale);
	const country = marketOf(locale);
	const [overview, index] = await Promise.all([
		getMarketOverview(country),
		getDirectoryIndex(country),
	]);
	const places = homePlaces(country, index.regions);
	return (
		<>
			{overview.listings.length > 0 ? (
				<section aria-labelledby="listings-heading" className="flex flex-col gap-4">
					<h2 id="listings-heading" className="type-title text-ink">
						{t("market.listingsHeading")}
					</h2>
					<CountLinks
						locale={locale}
						items={overview.listings.map((listing) => ({
							key: listing.listingSlug,
							label: labels.listing(listing.listingSlug) ?? listing.listingSlug,
							href: { pathname: "/[specialite]", params: { specialite: listing.listingSlug } },
							count: listing.practitionerCount,
						}))}
					/>
				</section>
			) : null}
			{places.length > 0 ? (
				<section aria-labelledby="places-heading" className="flex flex-col gap-4">
					<h2 id="places-heading" className="type-title text-ink">
						{t("market.placesHeading")}
					</h2>
					<CountLinks
						locale={locale}
						items={places.map((place) => ({
							key: place.key,
							label: place.label,
							href: { pathname: "/annuaire/[dept]", params: { dept: place.slug } },
							count: place.count,
						}))}
					/>
					<p className="text-body text-ink">
						<Link href="/annuaire" className={linkStyles()}>
							{tDirectory("title")}
						</Link>
					</p>
				</section>
			) : null}
		</>
	);
}

/** The profession codes a market counts, a row per listing (Austria: doctors and dentists). */
const COUNTED: Readonly<Record<Exclude<MarketCountry, "FR" | "AT">, readonly string[]>> = {
	GB: [GB_GP_PRACTICE, GB_DENTAL_PRACTICE, GB_PHARMACY],
	CZ: CZ_DEFAULT_PROFESSIONS,
	ES: ES_DEFAULT_PROFESSIONS,
	IT: IT_DEFAULT_PROFESSIONS,
	DE: DE_DEFAULT_PROFESSIONS,
	CH: CH_DEFAULT_PROFESSIONS,
	EE: EE_DEFAULT_PROFESSIONS,
	PL: PL_DEFAULT_PROFESSIONS,
	NO: NO_DEFAULT_PROFESSIONS,
	IE: IE_DEFAULT_PROFESSIONS,
	FI: FI_DEFAULT_PROFESSIONS,
	LT: LT_DEFAULT_PROFESSIONS,
	SI: SI_DEFAULT_PROFESSIONS,
	CY: CY_DEFAULT_PROFESSIONS,
	LV: LV_DEFAULT_PROFESSIONS,
	SE: SE_DEFAULT_PROFESSIONS,
};

type Figures = {
	rows: { key: string; label: string; count: number }[];
	sources: string;
	/** Date (YYYY-MM-DD) of the last import, else of the latest page change. */
	updatedAt: string | null;
};

/**
 * A market's figures, live from the directory: pages by kind and the sources they come from.
 * France counts its register's professions and those with a public address (`getRegistryFigures`);
 * every other market its pages by listing. Null while nothing is counted.
 */
async function getFigures(locale: Locale): Promise<Figures | null> {
	const t = await getTranslations({ locale, namespace: "HomePage" });
	const country = marketOf(locale);
	if (country === "FR") {
		const figures = await getRegistryFigures();
		if (!figures) return null;
		return {
			rows: [
				...figures.professions.map((profession) => ({
					key: profession.key,
					label: t(`registry.${profession.key}`),
					count: profession.count,
				})),
				{ key: "withAddress", label: t("registry.withAddress"), count: figures.withAddress },
			],
			sources: t("registry.sourceName"),
			updatedAt: figures.importedAt,
		};
	}
	const labels = await getTaxonomyLabels(locale);
	const [overview, status, sources] = await Promise.all([
		getMarketOverview(country),
		getImportStatus(country.toLowerCase() as Lowercase<typeof country>),
		getHomeSources(country),
	]);
	const adapter = countryAdapter(country);
	const kinds: FigureRow[] =
		country === "AT"
			? [
					{ key: AT_DOCTOR, label: t("registry.doctors"), codes: [AT_DOCTOR] },
					{ key: AT_DENTIST, label: t("registry.dentists"), codes: [AT_DENTIST] },
				]
			: listingRows(
					COUNTED[country],
					(code) => adapter.taxonomy.listingSlugFor(code, null),
					(slug) => labels.listing(slug),
				);
	const rows = kinds.map((kind) => ({
		key: kind.key,
		label: kind.label,
		count: overview.professions
			.filter((row) => kind.codes.includes(row.professionCode))
			.reduce((sum, row) => sum + row.practitionerCount, 0),
	}));
	if (rows.every((row) => row.count === 0)) return null;
	return { rows, sources: sources ?? "", updatedAt: status?.importedAt ?? overview.updatedAt };
}

/**
 * Sources and figures: where the pages come from and how many there are by kind, dated with
 * the last import. Switzerland first says which cantons its lists cover, live from the directory.
 */
export async function HomeSources({ locale }: { locale: Locale }) {
	const figures = await getFigures(locale);
	if (!figures) return null;
	const t = await getTranslations({ locale, namespace: "HomePage" });
	const swiss = marketOf(locale) === "CH" ? await getSwissCoverageTexts(locale) : null;
	return (
		<section
			aria-labelledby="registry-heading"
			className="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-12"
		>
			<div className="flex flex-col gap-3">
				<h2 id="registry-heading" className="type-title text-ink">
					{t("registry.heading")}
				</h2>
				<p className="max-w-[60ch] text-body text-ink">
					{swiss ? [...swiss.summary, t("registry.intro")].join(" ") : t("registry.intro")}
				</p>
			</div>
			<div className="flex flex-col gap-3">
				<FieldList>
					{figures.rows.map((row) => (
						<FieldRow
							key={row.key}
							label={row.label}
							emptyLabel=""
							value={<span className="tabular">{t("registry.count", { count: row.count })}</span>}
						/>
					))}
				</FieldList>
				{figures.updatedAt && figures.sources ? (
					<ProvenanceNote
						locale={locale}
						sourceLabel={t("registry.sourceLabel")}
						source={figures.sources}
						updatedLabel={t("registry.updatedLabel")}
						updatedAt={figures.updatedAt}
					/>
				) : null}
			</div>
		</section>
	);
}
