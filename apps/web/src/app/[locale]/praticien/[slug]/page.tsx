import { parsePractitionerSegment, practitionerRoute } from "@apercura/core";
import { hasBillingSectors, professionFor } from "@apercura/core/taxonomy";
import {
	ActionBlock,
	buttonStyles,
	FieldList,
	FieldRow,
	linkStyles,
	MapView,
	PractitionerHeader,
	ProvenanceNote,
	SiteCard,
} from "@apercura/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookingLauncher } from "~/components/booking/booking-launcher";
import { BookletPage } from "~/components/booklet-page";
import { BOOKING_PANEL_MESSAGES, ClientIsland } from "~/components/client-island";
import { JsonLd } from "~/components/json-ld";
import { FeesSection, PracticalSection, PresentationSection } from "~/components/owner-sections";
import { PublicPage } from "~/components/public-page";
import { Trail, type TrailItem, trailEntries } from "~/components/trail";
import { clientEnv } from "~/env";
import { getPathname, Link, permanentRedirect } from "~/i18n/navigation";
import { type Locale, routing } from "~/i18n/routing";
import { genderOf, getTaxonomyLabels, inSentence } from "~/lib/labels";
import { getMapStrings } from "~/lib/map-strings";
import { ownerContentOf } from "~/lib/owner-content";
import { actionPlan, label, type SiteView, siteViews } from "~/lib/practitioner-view";
import {
	CONTENT_LANGUAGES,
	DESCRIPTION_MAX,
	fitText,
	ogImageOf,
	pageMetadata,
	pickTitle,
	shortPlaceName,
} from "~/lib/seo";
import { absoluteUrl, siteOrigin } from "~/lib/site-url";
import { slotParts, slotTime } from "~/lib/slot-format";
import { breadcrumbNode, graph, ids, practitionerNodes, webPageNode } from "~/lib/structured-data";
import { databaseAvailable } from "~/server/db";
import { practitionerOgImageOf } from "~/server/og/practitioner-image";
import {
	getPractitionerPage,
	type PractitionerPage as PractitionerPageData,
	samplePractitionerSlugs,
} from "~/server/queries/practitioner";
import { photoUrl } from "~/server/storage";

/** The first request of a page waits for the complete page, never a shell. */
export const ensureStatic = "navigation";
/**
 * The response status (404, 308) is decided from the URL before anything
 * renders, so the page blocks on its params by design instead of streaming a
 * shell: a late notFound() inside Suspense would answer 200.
 */
export const instant = false;

/** Never a valid RPPS (bad Luhn check): answers 404 without touching the database. */
const BUILD_WITHOUT_DATABASE = "exemple-10000000008";

export async function generateStaticParams() {
	const slugs = (await databaseAvailable())
		? await samplePractitionerSlugs(5)
		: [BUILD_WITHOUT_DATABASE];
	return (slugs.length > 0 ? slugs : [BUILD_WITHOUT_DATABASE]).map((slug) => ({ slug }));
}

type Props = PageProps<"/[locale]/praticien/[slug]">;

const ameliUrl = "https://annuairesante.ameli.fr/";

/**
 * Resolves the page before anything renders: Luhn check (no database access
 * for a malformed number), read model lookup, then 404 or 308 to the
 * canonical slug. Called first by both the metadata and the page.
 */
async function resolve(params: Props["params"]) {
	const { locale: requested, slug } = await params;
	const locale: Locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
	const segment = parsePractitionerSegment(slug);
	if (!segment) notFound();
	const page = await getPractitionerPage(segment.rpps);
	const decision = practitionerRoute(
		slug,
		page && {
			slug: page.slug,
			indexable: page.indexable,
			activities: page.payload.activities.map((activity) => ({
				practiceKind: activity.practiceKind,
				hasSite: activity.site !== null,
			})),
		},
	);
	if (decision.kind === "not_found" || !page) notFound();
	if (decision.kind === "redirect") {
		permanentRedirect({
			href: { pathname: "/praticien/[slug]", params: { slug: decision.to } },
			locale,
		});
	}
	return { locale, page };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { locale, page } = await resolve(params);
	const t = await getTranslations({ locale, namespace: "PractitionerPage" });
	const labels = await getTaxonomyLabels(locale);
	const { payload } = page;
	if (payload.withheld) {
		return { title: t("withheld.metaTitle"), robots: { index: false, follow: false } };
	}
	const gender = genderOf(payload.civilityCode);
	const name = labels.personName(payload);
	const occupation = inSentence(
		labels.listing(payload.listingSlug, gender) ??
			labels.profession(payload.listingSlug ?? "", gender) ??
			"",
		locale,
	);
	const place = page.commune ? shortPlaceName(page.commune.name) : null;
	const href = { pathname: "/praticien/[slug]", params: { slug: page.slug } } as const;
	// The description only mentions online booking when the agenda is open.
	const bookable = page.booking.open;
	const values = {
		name,
		occupation,
		place: place ?? "",
		fees: hasBillingSectors(payload.professionCode) ? "sector" : "other",
	};
	const descriptionOf = (withPlace: boolean) =>
		bookable
			? t(withPlace ? "metaDescriptionBookablePlace" : "metaDescriptionBookable", values)
			: t(withPlace ? "metaDescriptionPlace" : "metaDescription", values);
	return pageMetadata({
		locale,
		href,
		title: pickTitle([
			...(place ? [t("metaTitlePlace", values)] : []),
			t("metaTitle", values),
			t("metaTitleName", values),
		]),
		description: fitText(
			place ? [descriptionOf(true), descriptionOf(false)] : [descriptionOf(false)],
			DESCRIPTION_MAX,
		),
		indexable: page.indexable,
		image: ogImageOf(payload.professionCode),
		// The practitioner's own card first; the profession's image as the fallback.
		ownImage: (await practitionerOgImageOf(payload.nationalId, page.slug)) ?? undefined,
		type: "profile",
	});
}

export default async function PractitionerPage({ params }: Props) {
	const { locale, page } = await resolve(params);
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "PractitionerPage" });
	const tP = await getTranslations({ locale, namespace: "Practitioner" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const labels = await getTaxonomyLabels(locale);

	const { payload } = page;
	if (payload.withheld) return <WithheldPage locale={locale} slug={page.slug} />;
	const gender = genderOf(payload.civilityCode);
	const name = labels.personName(payload);
	const content = ownerContentOf(payload, photoUrl);
	const professionSlug = payload.listingSlug ?? "";
	const professionLabel =
		labels.profession(professionFor(payload.professionCode)?.slug ?? "", gender) ??
		t("unknownProfession");
	const listingLabel = labels.listing(payload.listingSlug, gender) ?? professionLabel;
	const specialty =
		payload.listingSlug && labels.profession(professionSlug, gender) === null ? listingLabel : null;
	// The owner may hide the practice's phone from the page.
	const sites = siteViews(payload).map((site) =>
		content.showPhone ? site : { ...site, phone: null },
	);
	const plan = actionPlan(sites);
	const empty = tP("notProvided");
	const claimed = payload.claimStatus === "claimed";
	const status = claimed ? "verified" : "unclaimed";
	const href = { pathname: "/praticien/[slug]", params: { slug: page.slug } } as const;
	const url = absoluteUrl(href, locale);
	const otherQualifications = payload.qualifications
		.filter((item) => item.source === "savoir_faire" && item.typeCode !== "S" && item.label)
		.map((item) => item.label as string);

	const trail: TrailItem[] = [];
	if (payload.listingSlug && page.listings.france) {
		trail.push({
			label: listingLabel,
			href: { pathname: "/[specialite]", params: { specialite: payload.listingSlug } },
		});
	}
	if (payload.listingSlug && page.department && page.listings.department) {
		trail.push({
			label: page.department.name,
			href: {
				pathname: "/[specialite]/[dept]/[[...rest]]",
				params: { specialite: payload.listingSlug, dept: page.department.slug, rest: undefined },
			},
		});
	}
	if (
		payload.listingSlug &&
		page.department &&
		page.commune &&
		page.listings.commune &&
		page.commune.code !== "75056"
	) {
		trail.push({
			label: page.commune.name,
			href: {
				pathname: "/[specialite]/[dept]/[[...rest]]",
				params: {
					specialite: payload.listingSlug,
					dept: page.department.slug,
					rest: [page.commune.slug],
				},
			},
		});
	}
	trail.push({ label: name, href });

	const establishmentUrl = (slug: string) =>
		absoluteUrl({ pathname: "/etablissement/[slug]", params: { slug } }, locale);

	return (
		<PublicPage locale={locale} href={href}>
			<JsonLd
				data={graph([
					webPageNode({
						url,
						origin: siteOrigin(),
						name,
						language: CONTENT_LANGUAGES[locale],
						hasBreadcrumb: true,
						mainEntity: ids.practitioner(url),
						dateModified: page.updatedAt,
					}),
					breadcrumbNode(url, await trailEntries(locale, trail)),
					...practitionerNodes({
						url,
						professionCode: payload.professionCode,
						rpps: payload.nationalId,
						name,
						givenName: payload.firstName,
						familyName: payload.lastName,
						honorificPrefix: labels.title(payload.titleCode),
						occupation: listingLabel,
						listingSlug: payload.listingSlug,
						languages: content.languages,
						photoUrl: content.photoUrl,
						website: content.website,
						places: sites.map((site) => ({
							siteId: site.site.id,
							practiceKind: site.practiceKind,
							// As printed on the place's card: a LocalBusiness needs a name.
							name: site.name ?? labels.practiceKind(site.practiceKind),
							addressLine: label(site.site.addressLine),
							addressComplement: label(site.site.addressComplement),
							postcode: site.site.postcode,
							placeName: site.site.placeName,
							coordinates: site.coordinates,
							phone: site.phone?.e164 ?? null,
							establishmentUrl: site.establishment
								? establishmentUrl(site.establishment.slug)
								: null,
						})),
						bookingUrl: page.booking.open ? `${url}?rdv=1` : null,
					}),
				])}
			/>
			<BookletPage
				runningHead={tSite("runningHead")}
				folio={tSite("folioRpps", { rpps: payload.nationalId })}
			>
				<div className="flex flex-col gap-6">
					<Trail locale={locale} items={trail} />
					<PractitionerHeader
						name={name}
						profession={listingLabel}
						rpps={payload.nationalId}
						rppsLabel={tP("rpps")}
						status={status}
						statusLabel={tP(`status.${status}`)}
						statusNote={tP(`statusNote.${status}`)}
						headline={content.headline}
						photo={
							content.photoUrl ? { src: content.photoUrl, alt: t("photoAlt", { name }) } : null
						}
					/>
				</div>

				<div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12">
					<div className="order-2 flex flex-col gap-14 lg:order-1">
						<PresentationSection bio={content.bio} headingId="presentation-heading" />
						<section aria-labelledby="profession-heading" className="flex flex-col gap-4">
							<h2 id="profession-heading" className={sectionHeading}>
								{t("professionHeading")}
							</h2>
							<FieldList>
								<FieldRow
									label={tP("fields.profession")}
									value={professionLabel}
									emptyLabel={empty}
								/>
								<FieldRow label={tP("fields.specialty")} value={specialty} emptyLabel={empty} />
								<FieldRow
									label={t("otherQualifications")}
									value={
										otherQualifications.length > 0 ? (
											<span lang="fr">{otherQualifications.join(", ")}</span>
										) : null
									}
									emptyLabel={empty}
								/>
								<FieldRow label={tP("fields.hours")} emptyLabel={empty} />
							</FieldList>
						</section>

						<section aria-labelledby="sites-heading" className="flex flex-col gap-6">
							<h2 id="sites-heading" className={sectionHeading}>
								{tP("sitesHeading")}
							</h2>
							{sites.map((site, index) => (
								<SiteSection
									key={site.site.id}
									site={site}
									locale={locale}
									showMap={index === 0}
									labels={{
										kind: labels.practiceKind(site.practiceKind),
										mode: labels.mode(site.modeCode),
									}}
								/>
							))}
						</section>

						<PracticalSection
							content={content}
							headingId="practical-heading"
							emptyLabel={empty}
							externalLabel={tSite("externalLink")}
						/>

						<FeesSection
							content={content}
							headingId="fees-heading"
							emptyLabel={empty}
							externalLabel={tSite("externalLink")}
							sectors={hasBillingSectors(payload.professionCode)}
							provenance={
								<ProvenanceNote
									locale={locale}
									sourceLabel={tP("source.label")}
									source={
										content.billing.source === "owner" ? t("fees.sourceOwner") : t("fees.source")
									}
									updatedLabel={tP("source.updated")}
									updatedAt={page.updatedAt}
								/>
							}
						/>
					</div>
					<aside aria-label={t("asideLabel")} className="order-1 flex flex-col gap-6 lg:order-2">
						<Action
							plan={plan}
							locale={locale}
							booking={page.booking}
							practitionerId={page.practitionerId}
							practitionerName={name}
						/>
						<section
							aria-labelledby="claim-heading"
							className="flex flex-col gap-2 border-t border-ink pt-4"
						>
							<h2 id="claim-heading" className="type-subtitle text-ink">
								{claimed ? t("claim.claimedHeading") : t("claim.heading")}
							</h2>
							<p className="text-body text-ink">
								{claimed ? t("claim.claimedBody") : t("claim.body")}
							</p>
							{claimed ? null : (
								<Link
									href={{ pathname: "/pro/revendiquer", query: { rpps: payload.nationalId } }}
									className={`${linkStyles()} inline-flex min-h-11 items-center text-body font-semibold`}
								>
									{t("claim.link")}
								</Link>
							)}
						</section>
						<section
							aria-labelledby="report-heading"
							className="flex flex-col gap-2 border-t border-rule-soft pt-4"
						>
							<h2 id="report-heading" className="type-subtitle text-ink">
								{t("report.heading")}
							</h2>
							<p className="text-body text-ink">{t("report.body")}</p>
							<Link
								href={{ pathname: "/praticien/[slug]/signaler", params: { slug: page.slug } }}
								className={`${linkStyles()} inline-flex min-h-11 items-center text-body font-semibold`}
							>
								{t("report.link")}
							</Link>
							{claimed ? null : (
								<Link
									href={{ pathname: "/praticien/[slug]/retrait", params: { slug: page.slug } }}
									className={`${linkStyles({ tone: "muted" })} inline-flex min-h-11 items-center text-meta`}
								>
									{t("report.removalLink")}
								</Link>
							)}
						</section>
					</aside>
				</div>

				{page.neighbours.length > 0 && page.commune ? (
					<section aria-labelledby="ring-heading" className="flex flex-col gap-4">
						<h2 id="ring-heading" className={sectionHeading}>
							{t("ring.heading", {
								occupation: inSentence(listingLabel, locale),
								place: page.commune.name,
							})}
						</h2>
						<ul className="grid border-t border-ink sm:grid-cols-2 lg:grid-cols-3">
							{page.neighbours.map((neighbour) => (
								<li key={neighbour.id} className="border-b border-rule-soft">
									<Link
										href={{ pathname: "/praticien/[slug]", params: { slug: neighbour.slug } }}
										className={`${linkStyles()} flex min-h-14 items-center py-2 text-body`}
									>
										{labels.personName(neighbour)}
									</Link>
								</li>
							))}
						</ul>
					</section>
				) : null}

				<ProvenanceNote
					locale={locale}
					sourceLabel={tP("source.label")}
					source={tP("source.name")}
					updatedLabel={tP("source.updated")}
					updatedAt={page.updatedAt}
				/>
			</BookletPage>
		</PublicPage>
	);
}

const sectionHeading = "type-title text-ink";

async function SiteSection({
	site,
	locale,
	showMap,
	labels,
}: {
	site: SiteView;
	locale: Locale;
	showMap: boolean;
	labels: { kind: string | null; mode: string | null };
}) {
	const t = await getTranslations({ locale, namespace: "PractitionerPage" });
	const tP = await getTranslations({ locale, namespace: "Practitioner" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const mapStrings = showMap ? await getMapStrings(locale) : undefined;
	const empty = tP("notProvided");
	const name = site.name ?? labels.kind ?? t("unnamedPlace");
	return (
		<div className="flex flex-col gap-4">
			<SiteCard
				name={name}
				address={site.addressLines}
				coordinates={site.coordinates ?? undefined}
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
						label={t("practiceType")}
						value={[labels.kind, labels.mode].filter(Boolean).join(" · ")}
						emptyLabel={empty}
					/>
					<FieldRow
						label={tP("fields.phone")}
						value={
							site.phone ? (
								<a href={`tel:${site.phone.e164}`} className={`${linkStyles()} tabular`}>
									{site.phone.switchboard
										? t("switchboard", { phone: site.phone.display })
										: site.phone.display}
								</a>
							) : null
						}
						emptyLabel={empty}
					/>
					{site.establishment ? (
						<FieldRow
							label={t("establishment")}
							value={
								<Link
									href={{
										pathname: "/etablissement/[slug]",
										params: { slug: site.establishment.slug },
									}}
									className={linkStyles()}
								>
									{site.establishment.name}
								</Link>
							}
							emptyLabel={empty}
						/>
					) : null}
				</FieldList>
			</SiteCard>
			{showMap && site.coordinates ? (
				<MapView
					className="h-64 sm:h-72"
					center={site.coordinates}
					styleUrl={clientEnv.NEXT_PUBLIC_MAP_STYLE_URL}
					label={tP("mapLabel", { place: name })}
					markerLabel={tP("mapPin", { place: name })}
					strings={mapStrings}
					fallback={
						<p className="bg-paper/90 p-2 text-meta text-ink">{site.addressLines.join(", ")}</p>
					}
				/>
			) : null}
		</div>
	);
}

async function Action({
	plan,
	locale,
	booking,
	practitionerId,
	practitionerName,
}: {
	plan: ReturnType<typeof actionPlan>;
	locale: Locale;
	booking: PractitionerPageData["booking"];
	practitionerId: number;
	practitionerName: string;
}) {
	const t = await getTranslations({ locale, namespace: "PractitionerPage" });
	const tP = await getTranslations({ locale, namespace: "Practitioner" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const title = tP("action.title");
	if (booking.open) {
		// Online booking is open: the stamp opens the panel in place; the phone stays as a second way.
		const phone = plan?.kind === "call" ? plan.phone : null;
		const callHint = phone ? t("action.orCall", { phone: phone.display }) : undefined;
		const next =
			booking.nextFreeAt && booking.timeZone
				? slotParts(Date.parse(booking.nextFreeAt), booking.timeZone, locale)
				: null;
		return (
			<ActionBlock
				kind="book"
				title={title}
				statement={next ? t("action.bookStatement") : t("action.bookNoSlot")}
				nextSlot={
					next
						? { label: t("action.nextSlot"), value: `${next.dateNoYear}, ${slotTime(next)}` }
						: null
				}
				actionLabel={t("action.bookLabel")}
				href="?rdv=1"
				action={
					// The panel's messages ride with the launcher; the panel itself loads on demand.
					<ClientIsland locale={locale} namespaces={BOOKING_PANEL_MESSAGES}>
						<BookingLauncher
							practitionerId={practitionerId}
							practitionerName={practitionerName}
							label={t("action.bookLabel")}
							callHint={callHint}
							className={buttonStyles({
								intent: "stamp",
								size: "lg",
								className: "self-stretch sm:self-start",
							})}
						/>
					</ClientIsland>
				}
				secondary={
					phone ? (
						<a href={`tel:${phone.e164}`} className={`${linkStyles()} tabular`}>
							{callHint}
						</a>
					) : null
				}
			/>
		);
	}
	if (!plan) return null;
	switch (plan.kind) {
		case "call":
			return (
				<ActionBlock
					kind="call"
					title={title}
					statement={t("action.callNotYetOpen")}
					actionLabel={tP("action.call.label", { phone: plan.phone.display })}
					phone={plan.phone.e164}
				/>
			);
		case "establishment":
			return (
				<ActionBlock
					kind="establishment"
					title={title}
					statement={tP("action.establishment.statement", {
						establishment: plan.establishment.name,
					})}
					actionLabel={t("action.establishmentLink")}
					href={getPathname({
						href: { pathname: "/etablissement/[slug]", params: { slug: plan.establishment.slug } },
						locale,
					})}
				/>
			);
		case "locum":
			return (
				<ActionBlock
					kind="locum"
					title={title}
					statement={tP("action.locum.statement")}
					hint={tP("action.locum.hint")}
				/>
			);
		case "no_phone":
			return (
				<ActionBlock
					kind="notice"
					title={title}
					statement={t("action.noPhone")}
					hint={t.rich("action.noPhoneHint", {
						link: (chunks) => (
							<a href={ameliUrl} className={linkStyles({ tone: "muted" })}>
								{chunks}
								<span className="sr-only"> ({tSite("externalLink")})</span>
							</a>
						),
					})}
				/>
			);
	}
}

/**
 * A page withheld while a removal request is checked (GDPR art. 21): nothing
 * about the person is shown, the page is not indexed and has left listings,
 * searches and sitemaps.
 */
async function WithheldPage({ locale, slug }: { locale: Locale; slug: string }) {
	const t = await getTranslations({ locale, namespace: "PractitionerPage" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	return (
		<PublicPage locale={locale} href={{ pathname: "/praticien/[slug]", params: { slug } }}>
			<BookletPage runningHead={tSite("runningHead")}>
				<div className="flex max-w-[65ch] flex-col gap-4">
					<h1 className="type-headline text-ink">{t("withheld.title")}</h1>
					<p className="text-lead text-ink">{t("withheld.body")}</p>
					<p className="text-body text-ink">
						<Link href="/donnees" className={linkStyles()}>
							{t("withheld.dataLink")}
						</Link>
					</p>
				</div>
			</BookletPage>
		</PublicPage>
	);
}
