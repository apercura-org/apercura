import { listingHasBillingSectors } from "@apercura/core/taxonomy";
import { FieldList, FieldRow, linkStyles, ProvenanceNote, tableStyles } from "@apercura/ui";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { type Href, Link } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { genderOf, getTaxonomyLabels } from "~/lib/labels";
import type { ListedPractitioner } from "~/server/queries/landing";
import type { LandingPayload } from "~/server/queries/types";

/*
 * Building blocks of the listing pages (specialty x place) and the place hubs,
 * set as booklet sections: a title rule, ruled tables and field rows.
 */

export const sectionHeading = "type-title text-ink";

const table = tableStyles();

/** The page title block: a headline and a factual lead. */
export function ListingTitle({ title, lead }: { title: string; lead: ReactNode }) {
	return (
		<div className="flex max-w-[65ch] flex-col gap-3 border-b border-ink pb-5">
			<h1 className="type-headline text-ink">{title}</h1>
			<p className="text-lead text-ink">{lead}</p>
		</div>
	);
}

/** A titled section of a listing page. */
export function ListingSection({
	id,
	title,
	intro,
	children,
}: {
	id: string;
	title: string;
	intro?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section aria-labelledby={id} className="flex flex-col gap-4">
			<h2 id={id} className={sectionHeading}>
				{title}
			</h2>
			{intro ? <p className="max-w-[65ch] text-body text-ink">{intro}</p> : null}
			{children}
		</section>
	);
}

/**
 * The computed facts of a listing: agreement sectors (or, for professions
 * without sectors, contracted or not) and Carte Vitale from the Assurance
 * Maladie directory, online booking, and where the figures come from.
 */
export async function ListingFacts({
	locale,
	listingSlug,
	payload,
	updatedAt,
}: {
	locale: Locale;
	listingSlug: string;
	payload: LandingPayload;
	updatedAt: string;
}) {
	const t = await getTranslations({ locale, namespace: "Listing" });
	const tP = await getTranslations({ locale, namespace: "Practitioner" });
	const labels = await getTaxonomyLabels(locale);
	const bySector = listingHasBillingSectors(listingSlug);
	const sectors = ["1", "2", "3", "0"]
		.map((code) => ({ code, count: payload.billingSectors[code] ?? 0 }))
		.filter((sector) => sector.count > 0);
	const unknownSector = payload.billingSectors.unknown ?? 0;
	const count = (value: number) => <span className="tabular">{t("count", { count: value })}</span>;
	return (
		<ListingSection
			id="facts-heading"
			title={t("facts.heading")}
			intro={bySector ? t("facts.intro") : t("facts.introAgreement")}
		>
			<FieldList>
				{sectors.map((sector) => (
					<FieldRow
						key={sector.code}
						label={labels.billingSector(sector.code, bySector) ?? sector.code}
						value={count(sector.count)}
						emptyLabel=""
					/>
				))}
				<FieldRow
					label={bySector ? t("facts.sectorUnknown") : t("facts.agreementUnknown")}
					value={count(unknownSector)}
					emptyLabel=""
				/>
				{payload.carteVitale ? (
					<>
						<FieldRow
							label={t("facts.carteVitaleYes")}
							value={count(payload.carteVitale.yes)}
							emptyLabel=""
						/>
						<FieldRow
							label={t("facts.carteVitaleNo")}
							value={count(payload.carteVitale.no)}
							emptyLabel=""
						/>
					</>
				) : null}
				<FieldRow
					label={tP("fields.booking")}
					value={
						payload.onlineBookingCount > 0
							? count(payload.onlineBookingCount)
							: t("facts.bookingNotOpen")
					}
					emptyLabel=""
				/>
			</FieldList>
			<ProvenanceNote
				locale={locale}
				sourceLabel={tP("source.label")}
				source={t("facts.sources")}
				updatedLabel={tP("source.updated")}
				updatedAt={updatedAt}
			/>
		</ListingSection>
	);
}

/** Practitioners of a listing as a ruled table, one row each. */
export async function PractitionerTable({
	locale,
	listingSlug,
	caption,
	rows,
}: {
	locale: Locale;
	listingSlug: string;
	caption: string;
	rows: ListedPractitioner[];
}) {
	const t = await getTranslations({ locale, namespace: "Listing" });
	const tFees = await getTranslations({ locale, namespace: "PractitionerPage" });
	const tP = await getTranslations({ locale, namespace: "Practitioner" });
	const labels = await getTaxonomyLabels(locale);
	const bySector = listingHasBillingSectors(listingSlug);
	const notProvided = tP("notProvided");
	const carteVitale = (value: boolean | null) =>
		value === true ? tFees("fees.accepted") : value === false ? tFees("fees.notAccepted") : null;
	/** An empty cell: a printed dash, and the words for screen readers. */
	const emptyCell = (
		<span className="text-ink-muted">
			<span aria-hidden="true">—</span>
			<span className="sr-only">{notProvided}</span>
		</span>
	);
	return (
		<table className={table.table()}>
			<caption className="sr-only">{caption}</caption>
			<thead className={table.head()}>
				<tr>
					<th scope="col" className={table.column()}>
						{t("columns.practitioner")}
					</th>
					<th scope="col" className={table.column({ className: "hidden md:table-cell" })}>
						{bySector ? t("columns.sector") : t("columns.agreement")}
					</th>
					<th scope="col" className={table.column({ className: "hidden md:table-cell" })}>
						{t("columns.carteVitale")}
					</th>
				</tr>
			</thead>
			<tbody>
				{rows.map((row) => {
					const sector = labels.billingSector(row.billingSector, bySector);
					const address = [row.addressLine, [row.postcode, row.placeName].filter(Boolean).join(" ")]
						.filter(Boolean)
						.join(", ");
					return (
						<tr key={row.id} className={table.row()}>
							<td className={table.cell()}>
								<Link
									href={{ pathname: "/praticien/[slug]", params: { slug: row.slug } }}
									className={`${linkStyles()} type-subtitle`}
								>
									{labels.personName(row)}
								</Link>
								<p className="mt-1 text-meta text-ink">
									{labels.listing(row.listingSlug, genderOf(row.civilityCode))}
									{row.practiceKind ? ` · ${labels.practiceKind(row.practiceKind) ?? ""}` : ""}
								</p>
								{address ? <p className="text-meta text-ink-muted">{address}</p> : null}
								<p className="text-meta text-ink-muted md:hidden">
									{t(bySector ? "rowFacts" : "rowFactsAgreement", {
										sector: sector ?? notProvided,
										carteVitale: carteVitale(row.carteVitale) ?? notProvided,
									})}
								</p>
							</td>
							<td className={table.cell({ className: "hidden text-meta md:table-cell" })}>
								{sector ?? emptyCell}
							</td>
							<td className={table.cell({ className: "hidden text-meta md:table-cell" })}>
								{carteVitale(row.carteVitale) ?? emptyCell}
							</td>
						</tr>
					);
				})}
			</tbody>
		</table>
	);
}

/** Previous / next links between the pages of a listing. */
export async function Pagination({
	locale,
	page,
	pages,
	hrefOf,
}: {
	locale: Locale;
	page: number;
	pages: number;
	hrefOf: (page: number) => Href;
}) {
	if (pages <= 1) return null;
	const t = await getTranslations({ locale, namespace: "Listing" });
	const link = `${linkStyles()} inline-flex min-h-11 items-center text-body font-semibold`;
	return (
		<nav
			aria-label={t("pagination.label")}
			className="flex flex-wrap items-center justify-between gap-4 border-t border-ink pt-3"
		>
			{page > 1 ? (
				<Link href={hrefOf(page - 1)} className={link} rel="prev">
					{t("pagination.previous")}
				</Link>
			) : (
				<span />
			)}
			<p className="caps tabular text-ink" aria-current="page">
				{t("pagination.status", { page, pages })}
			</p>
			{page < pages ? (
				<Link href={hrefOf(page + 1)} className={link} rel="next">
					{t("pagination.next")}
				</Link>
			) : (
				<span />
			)}
		</nav>
	);
}

/** Links to places with their counts, in ruled columns. */
export async function CountLinks({
	locale,
	items,
}: {
	locale: Locale;
	items: { key: string | number; label: string; href: Href; count: number }[];
}) {
	const t = await getTranslations({ locale, namespace: "Listing" });
	return (
		<ul className="grid border-t border-ink sm:grid-cols-2 lg:grid-cols-3 sm:gap-x-8">
			{items.map((item) => (
				<li
					key={item.key}
					className="flex min-h-12 items-baseline justify-between gap-3 border-b border-rule-soft py-2"
				>
					<Link href={item.href} className={`${linkStyles()} text-body`}>
						{item.label}
					</Link>
					<span className="shrink-0 text-meta tabular text-ink-muted">
						{t("count", { count: item.count })}
					</span>
				</li>
			))}
		</ul>
	);
}
