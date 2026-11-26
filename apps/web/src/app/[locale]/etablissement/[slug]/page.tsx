import { formatPhoneFr, parseEstablishmentSegment } from "@apercura/core";
import {
	ActionBlock,
	FieldList,
	FieldRow,
	linkStyles,
	MapView,
	ProvenanceNote,
	SiteCard,
	Stamp,
	StampFoot,
} from "@apercura/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookletPage } from "~/components/booklet-page";
import { JsonLd } from "~/components/json-ld";
import { ListingSection } from "~/components/listing";
import { PublicPage } from "~/components/public-page";
import { Trail, type TrailItem, trailEntries } from "~/components/trail";
import { clientEnv } from "~/env";
import { marketOf } from "~/i18n/locales";
import { Link, permanentRedirect } from "~/i18n/navigation";
import { type Locale, routing } from "~/i18n/routing";
import { getTaxonomyLabels } from "~/lib/labels";
import { getMapStrings } from "~/lib/map-strings";
import { addressLines } from "~/lib/practitioner-view";
import {
	CONTENT_LANGUAGES,
	DESCRIPTION_MAX,
	fitText,
	pageMetadata,
	pickTitle,
	shortPlaceName,
} from "~/lib/seo";
import { absoluteUrl, siteOrigin } from "~/lib/site-url";
import { breadcrumbNode, establishmentNode, graph, ids, webPageNode } from "~/lib/structured-data";
import { databaseAvailable } from "~/server/db";
import { getEstablishment, sampleEstablishmentSlugs } from "~/server/queries/establishment";

export const ensureStatic = "navigation";
/**
 * The response status (404, 308) is decided from the URL before anything
 * renders, so the page blocks on its params by design instead of streaming a
 * shell: a late notFound() inside Suspense would answer 200.
 */
export const instant = false;

export async function generateStaticParams() {
	const slugs = (await databaseAvailable()) ? await sampleEstablishmentSlugs(5) : [];
	// Not a FINESS number: answers 404 without touching the database.
	return (slugs.length > 0 ? slugs : ["exemple"]).map((slug) => ({ slug }));
}

type Props = PageProps<"/[locale]/etablissement/[slug]">;

async function resolve(params: Props["params"]) {
	const { locale: requested, slug } = await params;
	const locale: Locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
	// Establishment pages are FINESS establishments: France only (none under /at).
	const segment = marketOf(locale) === "FR" ? parseEstablishmentSegment(slug) : null;
	if (!segment) notFound();
	const result = await getEstablishment(slug, segment.finess);
	if (result.kind === "not_found") notFound();
	if (result.kind === "moved") {
		permanentRedirect({
			href: { pathname: "/etablissement/[slug]", params: { slug: result.slug } },
			locale,
		});
	}
	const page = result.page;
	return {
		locale,
		page,
		indexable: page.practitioners.some((practitioner) => practitioner.indexable),
		href: { pathname: "/etablissement/[slug]", params: { slug: page.slug } } as const,
	};
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { locale, page, indexable, href } = await resolve(params);
	const t = await getTranslations({ locale, namespace: "Establishment" });
	const place = page.commune ? shortPlaceName(page.commune.name) : null;
	return pageMetadata({
		locale,
		href,
		title: pickTitle([
			...(place ? [t("metaTitlePlace", { name: page.name, place })] : []),
			t("metaTitle", { name: page.name }),
		]),
		description: fitText(
			[t("metaDescription", { name: page.name, count: page.practitioners.length })],
			DESCRIPTION_MAX,
		),
		indexable,
	});
}

export default async function EstablishmentPage({ params }: Props) {
	const { locale, page, href } = await resolve(params);
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "Establishment" });
	const tP = await getTranslations({ locale, namespace: "Practitioner" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const labels = await getTaxonomyLabels(locale);
	const mapStrings = await getMapStrings(locale);
	const empty = tP("notProvided");
	const lines = addressLines(page);
	// Where the facts come from and when they were imported, printed under them.
	const provenance = (
		<ProvenanceNote
			locale={locale}
			sourceLabel={tP("source.label")}
			source={t("source")}
			updatedLabel={tP("source.updated")}
			updatedAt={page.updatedAt}
		/>
	);
	const precise = page.geoPrecision === "address" || page.geoPrecision === "street";
	const coordinates =
		precise && page.latitude !== null && page.longitude !== null
			? { lat: Number(page.latitude), lon: Number(page.longitude) }
			: null;
	const phone = page.phone ? { e164: page.phone, display: formatPhoneFr(page.phone) } : null;

	const trail: TrailItem[] = [{ label: t("directory"), href: "/annuaire" }];
	if (page.department) {
		trail.push({
			label: page.department.name,
			href: { pathname: "/annuaire/[dept]", params: { dept: page.department.slug } },
		});
		if (page.commune && page.commune.code !== "75056") {
			trail.push({
				label: page.commune.name,
				href: {
					pathname: "/annuaire/[dept]/[commune]",
					params: { dept: page.department.slug, commune: page.commune.slug },
				},
			});
		}
	}
	trail.push({ label: page.name, href });
	const url = absoluteUrl(href, locale);

	// Group the practitioners by listing, in a stable order.
	const groups = new Map<string, typeof page.practitioners>();
	for (const practitioner of page.practitioners) {
		const key = practitioner.listingSlug ?? "";
		groups.set(key, [...(groups.get(key) ?? []), practitioner]);
	}
	const sortedGroups = [...groups.entries()]
		.map(([slug, items]) => ({ slug, label: labels.listing(slug) ?? t("otherProfessions"), items }))
		.sort((a, b) => a.label.localeCompare(b.label, locale));

	return (
		<PublicPage locale={locale} href={href}>
			<JsonLd
				data={graph([
					webPageNode({
						url,
						origin: siteOrigin(),
						name: page.name,
						language: CONTENT_LANGUAGES[locale],
						hasBreadcrumb: true,
						mainEntity: ids.establishment(url),
						dateModified: page.updatedAt,
					}),
					breadcrumbNode(url, await trailEntries(locale, trail)),
					establishmentNode({
						url,
						kind: page.kind,
						name: page.name,
						finess: page.finessEt,
						addressLine: page.addressLine,
						addressComplement: page.addressComplement,
						postcode: page.postcode,
						placeName: page.placeName,
						coordinates,
						phone: page.phone,
					}),
				])}
			/>
			<BookletPage>
				<div className="flex flex-col gap-6">
					<Trail locale={locale} items={trail} />
					{/* The establishment's identity as its stamp: name, kind, address, FINESS number. */}
					<header className="rule-double-b flex flex-col gap-4 pb-6">
						<Stamp ink="outlined" className="w-full min-w-0 sm:w-fit sm:min-w-[22rem]">
							<div className="flex flex-col gap-1 px-4 pt-3 pb-3.5 sm:px-5 sm:pt-4">
								<h1 className="type-headline">{page.name}</h1>
								{labels.practiceKind(page.kind) ? (
									<p className="text-lead">{labels.practiceKind(page.kind)}</p>
								) : null}
								<p className="text-meta">{lines.join(", ")}</p>
							</div>
							<StampFoot>
								<span>
									<span className="me-1.5">{t("finess")}</span>
									<span>{page.finessEt}</span>
								</span>
							</StampFoot>
						</Stamp>
						<p className="max-w-[65ch] text-lead text-ink">
							{t("lead", {
								count: page.practitioners.length,
								kind: labels.practiceKind(page.kind) ?? "",
							})}
						</p>
					</header>
				</div>

				<div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12">
					<div className="order-2 flex flex-col gap-6 lg:order-1">
						<SiteCard
							headingLevel={2}
							name={t("addressHeading")}
							address={lines}
							coordinates={coordinates ?? undefined}
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
									label={t("finess")}
									value={<span className="tabular">{page.finessEt}</span>}
									emptyLabel={empty}
								/>
								<FieldRow
									label={tP("fields.phone")}
									value={
										phone ? (
											<a href={`tel:${phone.e164}`} className={`${linkStyles()} tabular`}>
												{phone.display}
											</a>
										) : null
									}
									emptyLabel={empty}
								/>
							</FieldList>
							{provenance}
						</SiteCard>
						{coordinates ? (
							<MapView
								className="h-64 sm:h-72"
								center={coordinates}
								styleUrl={clientEnv.NEXT_PUBLIC_MAP_STYLE_URL}
								label={tP("mapLabel", { place: page.name })}
								markerLabel={tP("mapPin", { place: page.name })}
								strings={mapStrings}
								fallback={<p className="bg-paper/90 p-2 text-meta text-ink">{lines.join(", ")}</p>}
							/>
						) : null}
					</div>
					<div className="order-1 lg:order-2">
						{phone ? (
							<ActionBlock
								kind="call"
								title={tP("action.title")}
								statement={t("action.call")}
								actionLabel={tP("action.call.label", { phone: phone.display })}
								phone={phone.e164}
							/>
						) : (
							<ActionBlock
								kind="notice"
								title={tP("action.title")}
								statement={t("action.noPhone")}
								hint={t("action.noPhoneHint")}
							/>
						)}
					</div>
				</div>

				<ListingSection
					id="practitioners-heading"
					title={t("practitionersHeading", { count: page.practitioners.length })}
					intro={t("practitionersIntro")}
				>
					<div className="flex flex-col gap-8">
						{sortedGroups.map((group) => (
							<div key={group.slug} className="flex flex-col gap-2">
								<h3 className="type-subtitle text-ink">{group.label}</h3>
								<ul className="grid border-t border-rule-soft sm:grid-cols-2 sm:gap-x-8 lg:grid-cols-3">
									{group.items.map((practitioner) => (
										<li key={practitioner.id} className="border-b border-rule-soft">
											<Link
												href={{
													pathname: "/praticien/[slug]",
													params: { slug: practitioner.slug },
												}}
												className={`${linkStyles()} flex min-h-12 items-center py-2 text-body`}
											>
												{labels.personName(practitioner)}
											</Link>
										</li>
									))}
								</ul>
							</div>
						))}
					</div>
				</ListingSection>

				<div className="rule-double-t">{provenance}</div>
			</BookletPage>
		</PublicPage>
	);
}
