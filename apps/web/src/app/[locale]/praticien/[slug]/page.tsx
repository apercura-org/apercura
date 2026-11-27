import { practitionerRoute } from "@apercura/core";
import { IE_HSE_ATLAS_DATE } from "@apercura/core/country";
import {
	CZ_SPECIALIST,
	deKindSlugOf,
	ES_MEDICAL_PRACTICE,
	ES_OTHER_PRACTICE,
	eeKindSlugOf,
	esKindSlugOf,
	fiKindSlugOf,
	noKindSlugOf,
	PL_SPECIALIST,
} from "@apercura/core/taxonomy";
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
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { BookingLauncher } from "~/components/booking/booking-launcher";
import { BookletPage } from "~/components/booklet-page";
import { BOOKING_PANEL_MESSAGES, ClientIsland } from "~/components/client-island";
import { RelatedGuides } from "~/components/guides";
import { ExternalLink } from "~/components/institutional";
import { JsonLd } from "~/components/json-ld";
import { OwnerBlock } from "~/components/owner-block";
import { FeesSection, PracticalSection, PresentationSection } from "~/components/owner-sections";
import { PublicPage } from "~/components/public-page";
import { Trail, type TrailItem, trailEntries } from "~/components/trail";
import { clientEnv } from "~/env";
import { CATALOG_LANGUAGES, marketOf } from "~/i18n/locales";
import { getPathname, Link, permanentRedirect } from "~/i18n/navigation";
import { type Locale, routing } from "~/i18n/routing";
import { relatedGuides } from "~/lib/guides/catalog";
import { irishFacilityFacts } from "~/lib/irish-facility";
import { genderOf, getTaxonomyLabels, inSentence } from "~/lib/labels";
import { getMapStrings } from "~/lib/map-strings";
import {
	IE_HSE_SOURCES,
	italianSourceDate,
	openDataSourcesOf,
	professionFees,
	professionSlugOf,
	showsBillingFacts,
} from "~/lib/market";
import { listsPractices } from "~/lib/markets";
import { ownerContentOf } from "~/lib/owner-content";
import { isDepartmentCity } from "~/lib/places";
import { displayId, identityOf, parsePractitionerKey } from "~/lib/practitioner-key";
import {
	actionPlan,
	localityOf,
	marketLabel,
	type SiteView,
	siteViews,
} from "~/lib/practitioner-view";
import {
	CONTENT_LANGUAGES,
	DESCRIPTION_MAX,
	fitText,
	ogImageOf,
	pageMetadata,
	pickTitle,
	shortPlaceName,
	withoutBrand,
} from "~/lib/seo";
import { absoluteUrl, siteOrigin } from "~/lib/site-url";
import { slotParts, slotTime } from "~/lib/slot-format";
import { breadcrumbNode, graph, ids, practitionerNodes, webPageNode } from "~/lib/structured-data";
import { swissFacilityFacts } from "~/lib/swiss-facility";
import { databaseAvailable } from "~/server/db";
import { practitionerOgImageOf } from "~/server/og/practitioner-image";
import {
	getPractitionerPage,
	type PractitionerPage as PractitionerPageData,
	samplePractitionerSlugs,
} from "~/server/queries/practitioner";
import { getImportStatus } from "~/server/queries/registry";
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
	const segment = parsePractitionerKey(locale, slug);
	if (!segment) notFound();
	const page = await getPractitionerPage(identityOf(segment));
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
	// A page withheld while a removal request is checked (GDPR art. 21) answers like an unknown
	// one: a real 404 (noindex), so search engines drop it at once and nothing about the person
	// is shown, as its Open Graph image and the contact form already do.
	if (decision.kind === "not_found" || !page || page.payload.withheld) notFound();
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
	const gender = genderOf(payload.civilityCode);
	const name = labels.personName(payload);
	const occupation = inSentence(
		labels.occupation(payload.listingSlug, gender, payload.professionCode) ??
			labels.profession(payload.listingSlug ?? "", gender) ??
			"",
		locale,
	);
	// A London practice is listed in its borough, without a town: the borough names its place.
	const locality = page.commune ?? (listsPractices(payload.country) ? page.department : null);
	const place = locality ? shortPlaceName(locality.name) : null;
	const href = { pathname: "/praticien/[slug]", params: { slug: page.slug } } as const;
	// The description only mentions online booking when the agenda is open.
	const bookable = page.booking.open;
	const values = {
		name,
		occupation,
		place: place ?? "",
		fees: professionFees(locale, payload.professionCode) ? "sector" : "other",
	};
	const descriptionOf = (withPlace: boolean) =>
		bookable
			? t(withPlace ? "metaDescriptionBookablePlace" : "metaDescriptionBookable", values)
			: t(withPlace ? "metaDescriptionPlace" : "metaDescription", values);
	return pageMetadata({
		locale,
		href,
		// The commune tells namesakes apart: the brand goes before it does.
		title: pickTitle([
			...(place ? [t("metaTitlePlace", values), withoutBrand(t("metaTitlePlace", values))] : []),
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
		ownImage:
			(await practitionerOgImageOf(
				{
					country: marketOf(locale),
					idScheme: payload.idScheme,
					nationalId: payload.nationalId,
				},
				page.slug,
			)) ?? undefined,
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
	const gender = genderOf(payload.civilityCode);
	const name = labels.personName(payload);
	const content = ownerContentOf(payload, photoUrl);
	const professionSlug = payload.listingSlug ?? "";
	// A Spanish centre's, German facility's, Estonian provider's or Norwegian establishment's kind
	// has a singular label of its own ("Consultorio local", "Reha-Klinik", "Perearstikeskus",
	// "Legekontor").
	const professionLabel =
		labels.profession(
			esKindSlugOf(payload.professionCode) ??
				deKindSlugOf(payload.professionCode) ??
				eeKindSlugOf(payload.professionCode) ??
				noKindSlugOf(payload.professionCode) ??
				fiKindSlugOf(payload.professionCode) ??
				professionSlugOf(payload.professionCode),
			gender,
		) ?? t("unknownProfession");
	const listingLabel =
		labels.occupation(payload.listingSlug, gender, payload.professionCode) ?? professionLabel;
	const specialty =
		payload.listingSlug && labels.profession(professionSlug, gender) === null ? listingLabel : null;
	// The owner may hide the practice's phone from the page.
	const sites = siteViews(payload)
		.map((site) => (content.showPhone ? site : { ...site, phone: null }))
		// A practice's or facility's own address is the place of care: its card carries its name.
		.map((site, index) =>
			listsPractices(payload.country) && index === 0 && !site.name ? { ...site, name } : site,
		);
	const plan = actionPlan(sites);
	const empty = tP("notProvided");
	const claimed = payload.claimStatus === "claimed";
	// The stamp's ink: outlined while unclaimed, hatched while a claim is checked, solid once verified.
	const status = claimed ? "verified" : payload.claimStatus === "pending" ? "claimed" : "unclaimed";
	const href = { pathname: "/praticien/[slug]", params: { slug: page.slug } } as const;
	const url = absoluteUrl(href, locale);
	const austrian = payload.country === "AT";
	// Czechia lists facilities: no person, but a specialist's practice has its field and every
	// facility the fields of care the register gives it ("obory péče").
	const czech = payload.country === "CZ";
	// The UK lists practices: no specialty, no other qualification, no person.
	const practice = payload.country === "GB";
	// Italy lists places: a pharmacy's type when it is a branch or a dispensary, a hospital's type
	// and its areas of inpatient care with their beds, as the Ministry of Health names them.
	const italian = payload.country === "IT";
	const italianType = italian
		? (payload.qualifications.find(
				(item) => (item.source === "tipologia" || item.source === "tipo-struttura") && item.label,
			)?.label ?? null)
		: null;
	const italianBeds = italian
		? payload.qualifications
				.filter((item) => item.source === "disciplina" && item.label)
				.map((item) => item.label as string)
		: [];
	// France: the registry's other skills. Austria: the other specialties of the lists ("Fach").
	// Czechia: every field of care of the facility.
	const otherQualifications = payload.qualifications
		.filter((item) =>
			czech
				? item.source === "obor" && item.label
				: austrian
					? item.source === "fach" && item.code !== payload.primarySpecialtyCode && item.label
					: item.source === "savoir_faire" && item.typeCode !== "S" && item.label,
		)
		.map((item) => item.label as string);
	// A Czech specialist's field as the register names it (`kardiologie`), else its listing.
	const czechSpecialty =
		czech && payload.professionCode === CZ_SPECIALIST
			? (payload.qualifications.find(
					(item) => item.source === "obor" && item.code === payload.primarySpecialtyCode,
				)?.label ?? (payload.primarySpecialtyCode ? listingLabel : null))
			: null;
	// Spain lists centres: a practice has its specialty (the register's care unit it is listed
	// under), every centre the care units of its "oferta asistencial" and its ownership.
	const spanish = payload.country === "ES";
	const spanishUnits = spanish
		? payload.qualifications
				.filter((item) => item.source === "oferta" && item.label)
				.map((item) => item.label as string)
		: [];
	const spanishPractice =
		spanish &&
		(payload.professionCode === ES_MEDICAL_PRACTICE ||
			payload.professionCode === ES_OTHER_PRACTICE);
	const spanishSpecialty = spanishPractice
		? (payload.qualifications.find(
				(item) => item.source === "oferta" && item.code === payload.primarySpecialtyCode,
			)?.label ?? (payload.primarySpecialtyCode ? listingLabel : null))
		: null;
	const ownership = spanish
		? (payload.qualifications.find((item) => item.source === "dependencia") ?? null)
		: null;
	// Germany lists facilities: a hospital or clinic has its departments, its emergency care
	// level and modules, the kind of its operator and of the facility (the Destatis directory's
	// words, in German); a Thuringian pharmacy whether it is a main pharmacy or a branch and its
	// accessibility as the Land publishes it.
	const german = payload.country === "DE";
	const germanLabels = (source: string) =>
		german
			? payload.qualifications
					.filter((item) => item.source === source && item.label)
					.map((item) => item.label as string)
			: [];
	const germanFacts = german
		? [
				{ key: "departments", values: germanLabels("fachabteilung") },
				{
					key: "emergencyCare",
					values: [...germanLabels("notfallstufe"), ...germanLabels("notfallmodul")],
				},
				{ key: "facilityType", values: germanLabels("einrichtungstyp") },
				{ key: "operator", values: germanLabels("traeger") },
				{ key: "pharmacyType", values: germanLabels("apotheke") },
				{ key: "accessibility", values: germanLabels("barrierefreiheit") },
			].filter(
				(fact) =>
					fact.values.length > 0 ||
					// A hospital or clinic without departments says so; a pharmacy has none.
					(fact.key === "departments" &&
						payload.idScheme.startsWith("DE-") &&
						!payload.idScheme.startsWith("DE-APO")),
			)
		: [];
	// Estonia lists providers and pharmacies: a provider's activity licences, each with its number
	// and kind (every page about a provider prints its licence numbers, Advertising Act § 22(3)),
	// the kind of hospital and the services of its places of activity, in the register's words;
	// a pharmacy's licence number at the State Agency of Medicines.
	const estonian = payload.country === "EE";
	const estonianOf = (source: string) =>
		estonian ? payload.qualifications.filter((item) => item.source === source) : [];
	const estonianLicences = estonianOf("tegevusluba");
	const estonianHospitalKinds = estonianOf("haiglaliik")
		.map((item) => item.label)
		.filter((label): label is string => Boolean(label));
	const estonianServices = estonianOf("teenus")
		.map((item) => item.label)
		.filter((label): label is string => Boolean(label));
	const estonianPharmacyLicences = estonianOf("apteegi-tegevusluba");
	// Norway lists establishments of the Central Coordinating Register for Legal Entities: their
	// organisation number, the industry they registered (SN2025, in the register's words) and,
	// for a public or foundation-run establishment, the body that runs it.
	const norwegian = payload.country === "NO";
	const norwegianOf = (source: string) =>
		norwegian ? payload.qualifications.filter((item) => item.source === source) : [];
	const norwegianIndustries = norwegianOf("naeringskode");
	const norwegianOwners = norwegianOf("eier")
		.map((item) => item.label)
		.filter((label): label is string => Boolean(label));
	// Finland lists the public service locations of the Finnish Service Catalogue: the services
	// given there and the organisation that describes them (a wellbeing services county, HUS), in
	// the catalogue's words.
	const finnish = payload.country === "FI";
	const finnishOf = (source: string) =>
		finnish
			? payload.qualifications
					.filter((item) => item.source === source)
					.map((item) => item.label)
					.filter((label): label is string => Boolean(label))
			: [];
	const finnishServices = finnishOf("palvelu");
	const finnishOrganisers = finnishOf("jarjestaja");
	// Switzerland lists facilities: a hospital's type, activities, services and offer as the
	// FOPH's figures give them, its ownership and operator, and its category as its canton's list
	// names it (in that list's language).
	const swiss = payload.country === "CH";
	const language = CATALOG_LANGUAGES[locale];
	const swissFacts = swiss ? swissFacilityFacts(payload.qualifications, language) : null;
	// Poland lists establishments: their kind of activity, the kinds of their cells (clinics,
	// wards, laboratories) as the ministry's dictionary names them, their beds, their ownership and,
	// for an operator that is not a natural person, the operating entity, from RPWDL.
	const polish = payload.country === "PL";
	const polishFact = (source: string) =>
		polish ? payload.qualifications.filter((item) => item.source === source) : [];
	const polishFacts = polish
		? {
				activityKind: polishFact("rodzaj")[0]?.code ?? null,
				cells: polishFact("komorka")
					.map((item) => item.label)
					.filter((label): label is string => Boolean(label)),
				beds: Number(polishFact("lozka")[0]?.label ?? 0) || null,
				ownership: polishFact("forma")[0]?.code ?? null,
				operator: polishFact("podmiot")[0]?.label ?? null,
			}
		: null;
	const polishStatus = polish ? await getImportStatus("pl") : null;
	// Ireland lists facilities: a hospital's kind as the HSE's Health Atlas names it, a nursing
	// home's places for residents and its inspection reports on HIQA's website, who runs it. The
	// HSE's hospitals and health centres are a March 2020 snapshot, which their page says.
	const irish = payload.country === "IE";
	const irishFacts = irish ? irishFacilityFacts(payload.qualifications) : null;
	const atlasDate =
		irish && payload.activities.some((activity) => IE_HSE_SOURCES.has(activity.source ?? ""))
			? (await getFormatter({ locale })).dateTime(new Date(`${IE_HSE_ATLAS_DATE}-01T12:00:00Z`), {
					month: "long",
					year: "numeric",
					timeZone: "UTC",
				})
			: null;
	const identifier = displayId(payload);
	// Open licences (CC BY 4.0, OGL) require each source's attribution, word for word; Spain's
	// Ministry of Health asks for the date of its data: the last Spanish import's; Italy's is cited
	// with the date of its list's data; Geneva's SITG with the day of the last Swiss import.
	const sourceDate = spanish
		? ((await getImportStatus("es"))?.importedAt ?? page.updatedAt)
		: italian
			? italianSourceDate(payload.activities[0]?.source, await getImportStatus("it"))
			: swiss
				? ((await getImportStatus("ch"))?.importedAt ?? page.updatedAt)
				: polish
					? (polishStatus?.importedAt ?? null)
					: null;
	const sources = openDataSourcesOf(payload.country, payload.activities, sourceDate, {
		language,
		sources: swissFacts?.sources ?? [],
		// RPWDL is cited with the time its report was produced and the time it was obtained.
		producedAt: polishStatus?.files.rpwdl ?? null,
	});
	/** A list of lowercase labels as a sentence-case value ("Acute care, psychiatry"). */
	const listValue = (labels: string[]) => {
		const value = labels.join(", ");
		return value ? value.charAt(0).toLocaleUpperCase(locale) + value.slice(1) : null;
	};

	// Where the facts come from and when they were imported: under each block of facts, the
	// register's name; at the foot of the page, each source with its attribution.
	const provenanceOf = (source: string) => (
		<ProvenanceNote
			locale={locale}
			sourceLabel={tP("source.label")}
			source={source}
			updatedLabel={tP("source.updated")}
			updatedAt={page.updatedAt}
		/>
	);
	const provenance = provenanceOf(
		sources.length > 0 ? sources.map((source) => source.name).join("; ") : tP("source.name"),
	);

	const trail: TrailItem[] = [];
	if (payload.listingSlug && page.listings.country) {
		trail.push({
			label: labels.listing(payload.listingSlug, gender) ?? listingLabel,
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
		!isDepartmentCity(payload.country, page.commune.code)
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
						idScheme: payload.idScheme,
						country: payload.country,
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
							addressLine: marketLabel(site.site.addressLine, payload.country),
							addressComplement: marketLabel(site.site.addressComplement, payload.country),
							postcode: site.site.postcode,
							placeName: localityOf(site.site.placeName, payload.country),
							country: payload.country,
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
			<BookletPage>
				<div className="flex flex-col gap-6">
					<Trail locale={locale} items={trail} />
					<PractitionerHeader
						name={name}
						profession={listingLabel}
						rpps={identifier}
						rppsLabel={tP("rpps")}
						status={status}
						statusLabel={tP(`status.${status}`)}
						statusNote={status === "claimed" ? undefined : tP(`statusNote.${status}`)}
						headline={content.headline}
						address={sites[0]?.addressLines.join(", ")}
						photo={
							content.photoUrl ? { src: content.photoUrl, alt: t("photoAlt", { name }) } : null
						}
					/>
				</div>

				{/*
				 * Patients first, in reading order and on every screen: what they can do (book or call),
				 * then the facts, then what concerns the practitioner (claim, removal) and corrections.
				 * From 1024 px the action and the page's own matters share the right column.
				 */}
				<div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:gap-y-6">
					<div className="lg:col-start-2 lg:row-start-1">
						<Action
							plan={plan}
							locale={locale}
							booking={page.booking}
							practitionerId={page.practitionerId}
							practitionerName={name}
						/>
					</div>
					<div className="flex flex-col gap-14 lg:col-start-1 lg:row-span-2 lg:row-start-1">
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
								{practice ? null : norwegian ? (
									<>
										<FieldRow
											label={t("norwegianFacts.orgNumber")}
											value={
												<>
													<span className="tabular-nums">{identifier}</span>
													<span className="mt-1 block text-meta text-ink-muted">
														{t("norwegianFacts.orgNumberNote")}
													</span>
												</>
											}
											emptyLabel={empty}
										/>
										{norwegianIndustries.length > 0 ? (
											<FieldRow
												label={t("norwegianFacts.industry")}
												value={
													<ul className="flex flex-col gap-1">
														{norwegianIndustries.map((industry) => (
															<li key={industry.code}>
																<span className="tabular-nums">{industry.code}</span>
																{industry.label ? (
																	<>
																		{" · "}
																		<span lang="nb">{industry.label}</span>
																	</>
																) : null}
															</li>
														))}
													</ul>
												}
												emptyLabel={empty}
											/>
										) : null}
										{norwegianOwners.length > 0 ? (
											<FieldRow
												label={t("norwegianFacts.owner")}
												value={<span lang="nb">{norwegianOwners.join(", ")}</span>}
												emptyLabel={empty}
											/>
										) : null}
									</>
								) : estonian ? (
									<>
										{payload.idScheme === "EE-TTL" ? (
											<FieldRow
												label={t("estonianFacts.licences")}
												value={
													estonianLicences.length > 0 ? (
														<>
															<ul className="flex flex-col gap-1">
																{estonianLicences.map((licence) => (
																	<li key={licence.code}>
																		<span className="tabular-nums">{licence.code}</span>
																		{licence.label ? (
																			<>
																				{" · "}
																				<span lang="et">{licence.label}</span>
																			</>
																		) : null}
																	</li>
																))}
															</ul>
															<span className="mt-1 block text-meta text-ink-muted">
																{t("estonianFacts.licenceNote")}
															</span>
														</>
													) : null
												}
												emptyLabel={empty}
											/>
										) : null}
										{estonianHospitalKinds.length > 0 ? (
											<FieldRow
												label={t("estonianFacts.hospitalKind")}
												value={<span lang="et">{estonianHospitalKinds.join(", ")}</span>}
												emptyLabel={empty}
											/>
										) : null}
										{estonianServices.length > 0 ? (
											<FieldRow
												label={t("estonianFacts.services")}
												value={<span lang="et">{listValue(estonianServices)}</span>}
												emptyLabel={empty}
											/>
										) : null}
										{estonianPharmacyLicences.length > 0 ? (
											<FieldRow
												label={t("estonianFacts.pharmacyLicence")}
												value={
													<span className="tabular-nums">
														{estonianPharmacyLicences.map((licence) => licence.code).join(", ")}
													</span>
												}
												emptyLabel={empty}
											/>
										) : null}
									</>
								) : finnish ? (
									<>
										{finnishOrganisers.length > 0 ? (
											<FieldRow
												label={t("finnishFacts.organiser")}
												value={<span lang="fi">{finnishOrganisers.join(", ")}</span>}
												emptyLabel={empty}
											/>
										) : null}
										<FieldRow
											label={t("finnishFacts.services")}
											value={
												finnishServices.length > 0 ? (
													<span lang="fi">{listValue(finnishServices)}</span>
												) : null
											}
											emptyLabel={empty}
										/>
									</>
								) : german ? (
									germanFacts.map((fact) => (
										<FieldRow
											key={fact.key}
											label={t(`germanFacts.${fact.key}` as never)}
											value={
												fact.values.length > 0 ? (
													<span lang="de">{fact.values.join(", ")}</span>
												) : null
											}
											emptyLabel={empty}
										/>
									))
								) : spanish ? (
									<>
										{spanishPractice ? (
											<FieldRow
												label={tP("fields.specialty")}
												value={spanishSpecialty}
												emptyLabel={empty}
											/>
										) : null}
										<FieldRow
											label={t("fieldsOfCare")}
											value={spanishUnits.length > 0 ? spanishUnits.join(", ") : null}
											emptyLabel={empty}
										/>
										<FieldRow
											label={t("ownership")}
											value={
												ownership
													? t(ownership.code === "PUBLIC" ? "ownershipPublic" : "ownershipPrivate")
													: null
											}
											emptyLabel={empty}
										/>
									</>
								) : italian ? (
									<>
										{italianType ? (
											<FieldRow
												label={t("facilityType")}
												value={<span lang="it">{italianType}</span>}
												emptyLabel={empty}
											/>
										) : null}
										{italianBeds.length > 0 ? (
											<FieldRow
												label={t("beds")}
												value={<span lang="it">{italianBeds.join(", ")}</span>}
												emptyLabel={empty}
											/>
										) : null}
									</>
								) : swissFacts ? (
									<>
										{swissFacts.hospitalType ? (
											<FieldRow
												label={t("swiss.hospitalType")}
												value={swissFacts.hospitalType}
												emptyLabel={empty}
											/>
										) : null}
										{swissFacts.activities.length > 0 ? (
											<FieldRow
												label={t("swiss.activities")}
												value={listValue(
													swissFacts.activities.map((code) => t("swiss.activity", { code })),
												)}
												emptyLabel={empty}
											/>
										) : null}
										{swissFacts.offers.length > 0 ? (
											<FieldRow
												label={t("swiss.offer")}
												value={listValue(
													swissFacts.offers.map((code) => t("swiss.offerKind", { code })),
												)}
												emptyLabel={empty}
											/>
										) : null}
										{swissFacts.services.length > 0 ? (
											<FieldRow
												label={t("swiss.services")}
												value={
													<>
														{swissFacts.services
															.map((code) => t("swiss.service", { code }))
															.join(" ")}
														<span className="mt-1 block text-meta text-ink-muted">
															{t("swiss.servicesNote")}
														</span>
													</>
												}
												emptyLabel={empty}
											/>
										) : null}
										{swissFacts.ownership ? (
											<FieldRow
												label={t("ownership")}
												value={t(
													swissFacts.ownership === "public"
														? "ownershipPublic"
														: "ownershipPrivate",
												)}
												emptyLabel={empty}
											/>
										) : null}
										{swissFacts.operator ? (
											<FieldRow
												label={t("swiss.operator")}
												value={swissFacts.operator}
												emptyLabel={empty}
											/>
										) : null}
										{swissFacts.categories.length > 0 ? (
											<FieldRow
												label={t("swiss.category")}
												value={swissFacts.categories.map((category, index) => (
													<span key={`${category.language}-${category.label}`}>
														{index > 0 ? ", " : null}
														<span lang={category.language}>{category.label}</span>
													</span>
												))}
												emptyLabel={empty}
											/>
										) : null}
									</>
								) : polishFacts ? (
									<>
										{payload.professionCode === PL_SPECIALIST && payload.primarySpecialtyCode ? (
											<FieldRow
												label={tP("fields.specialty")}
												value={listingLabel}
												emptyLabel={empty}
											/>
										) : null}
										{polishFacts.activityKind ? (
											<FieldRow
												label={t("polish.activityKind")}
												value={t("polish.activity", { code: polishFacts.activityKind })}
												emptyLabel={empty}
											/>
										) : null}
										<FieldRow
											label={t("polish.cells")}
											value={
												polishFacts.cells.length > 0 ? (
													<span lang="pl">{listValue(polishFacts.cells)}</span>
												) : null
											}
											emptyLabel={empty}
										/>
										{polishFacts.beds ? (
											<FieldRow
												label={t("beds")}
												value={new Intl.NumberFormat(locale).format(polishFacts.beds)}
												emptyLabel={empty}
											/>
										) : null}
										{polishFacts.ownership ? (
											<FieldRow
												label={t("ownership")}
												value={t(
													polishFacts.ownership === "PUBLIC"
														? "ownershipPublic"
														: "ownershipPrivate",
												)}
												emptyLabel={empty}
											/>
										) : null}
										{polishFacts.operator ? (
											<FieldRow
												label={t("polish.operator")}
												value={<span lang="pl">{polishFacts.operator}</span>}
												emptyLabel={empty}
											/>
										) : null}
									</>
								) : irishFacts ? (
									<>
										{irishFacts.hospitalKind ? (
											<FieldRow
												label={t("irish.hospitalKind")}
												value={irishFacts.hospitalKind}
												emptyLabel={empty}
											/>
										) : null}
										{irishFacts.capacity ? (
											<FieldRow
												label={t("irish.capacity")}
												value={t("irish.capacityValue", { count: irishFacts.capacity })}
												emptyLabel={empty}
											/>
										) : null}
										{irishFacts.operator ? (
											<FieldRow
												label={t("irish.operator")}
												value={
													irishFacts.operator.kind === "hse"
														? t("irish.operatorHse")
														: irishFacts.operator.name
												}
												emptyLabel={empty}
											/>
										) : null}
										{irishFacts.hiqaUrl ? (
											<FieldRow
												label={t("irish.inspections")}
												value={
													<ExternalLink
														href={irishFacts.hiqaUrl}
														externalLabel={tSite("externalLink")}
													>
														{t("irish.hiqaLink")}
													</ExternalLink>
												}
												emptyLabel={empty}
											/>
										) : null}
									</>
								) : czech ? (
									<>
										{payload.professionCode === CZ_SPECIALIST ? (
											<FieldRow
												label={tP("fields.specialty")}
												value={czechSpecialty}
												emptyLabel={empty}
											/>
										) : null}
										<FieldRow
											label={t("fieldsOfCare")}
											value={otherQualifications.length > 0 ? otherQualifications.join(", ") : null}
											emptyLabel={empty}
										/>
									</>
								) : (
									<>
										<FieldRow label={tP("fields.specialty")} value={specialty} emptyLabel={empty} />
										<FieldRow
											label={t("otherQualifications")}
											value={
												otherQualifications.length > 0 ? (
													<span lang={austrian ? "de" : "fr"}>
														{otherQualifications.join(", ")}
													</span>
												) : null
											}
											emptyLabel={empty}
										/>
									</>
								)}
								<FieldRow label={tP("fields.hours")} emptyLabel={empty} />
							</FieldList>
							{atlasDate ? (
								<p data-atlas-note className="max-w-[65ch] text-body text-ink-muted">
									{t("irish.atlasNote", { date: atlasDate })}
								</p>
							) : null}
							{provenance}
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
							{provenance}
						</section>

						<PracticalSection
							content={content}
							headingId="practical-heading"
							emptyLabel={empty}
							externalLabel={tSite("externalLink")}
						/>

						{/* Austria's sources publish no fees, sectors or Carte Vitale facts. */}
						{showsBillingFacts(locale) ? (
							<FeesSection
								content={content}
								headingId="fees-heading"
								emptyLabel={empty}
								externalLabel={tSite("externalLink")}
								sectors={professionFees(locale, payload.professionCode)}
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
						) : null}
					</div>
					<aside
						aria-label={t("asideLabel")}
						className="flex flex-col gap-6 self-start lg:col-start-2 lg:row-start-2"
					>
						<OwnerBlock
							locale={locale}
							claimed={claimed}
							rpps={identifier}
							slug={page.slug}
							practitionerId={page.practitionerId}
						/>
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
						</section>
					</aside>
				</div>

				{page.neighbours.length > 0 && page.commune ? (
					<section aria-labelledby="ring-heading" className="flex flex-col gap-4">
						<h2 id="ring-heading" className={sectionHeading}>
							{t("ring.heading", {
								occupation: inSentence(
									labels.listing(payload.listingSlug, gender) ?? listingLabel,
									locale,
								),
								place: page.commune.name,
							})}
						</h2>
						<ul className="grid border-t border-rule-soft sm:grid-cols-2 lg:grid-cols-3">
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

				<RelatedGuides
					locale={locale}
					guides={relatedGuides([payload.listingSlug, professionSlugOf(payload.professionCode)])}
				/>

				<div className="rule-t">
					{provenanceOf(
						sources.length > 0
							? // CC BY 4.0 and the OGL: each source named with its attribution, word for word.
								sources.map((source) => `${source.name} (${source.attribution})`).join("; ")
							: tP("source.name"),
					)}
				</div>
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
					{/* A UK practice's or Czech facility's addresses are its own premises: no type to tell apart. */}
					{listsPractices(marketOf(locale)) ? null : (
						<FieldRow
							label={t("practiceType")}
							value={[labels.kind, labels.mode].filter(Boolean).join(" · ")}
							emptyLabel={empty}
						/>
					)}
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
			// The Ameli directory is French: an Austrian or UK page has no such pointer.
			if (marketOf(locale) !== "FR") {
				return <ActionBlock kind="notice" title={title} statement={t("action.noPhone")} />;
			}
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
