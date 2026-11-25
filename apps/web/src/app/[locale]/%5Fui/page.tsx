import {
	ActionBlock,
	BookletSearch,
	FieldList,
	FieldRow,
	MapView,
	ProvenanceNote,
	Seal,
	SiteCard,
	SkeletonText,
} from "@apercura/ui";
import { contrastRatio, palette } from "@apercura/ui/tokens";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { BookletPage } from "~/components/booklet-page";
import { ClientIsland } from "~/components/client-island";
import { SiteHeader } from "~/components/site-header";
import { clientEnv } from "~/env";
import { routing } from "~/i18n/routing";
import { getMapStrings } from "~/lib/map-strings";
import { TRPCReactProvider } from "~/trpc/client";
import { BookletSample } from "./booklet-sample";
import { SAMPLE_PRACTITIONERS, SAMPLE_SITE, SAMPLE_UPDATED_AT } from "./fixtures";
import { GalleryPrimitives } from "./primitives";
import { SlotDemo } from "./slot-demo";

/** The gallery is a development tool: production builds answer 404. */
const isGalleryEnabled = process.env.NODE_ENV !== "production";

export async function generateMetadata({ params }: PageProps<"/[locale]/_ui">): Promise<Metadata> {
	const { locale: requested } = await params;
	const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
	const t = await getTranslations({ locale, namespace: "Metadata" });
	return { title: t("galleryTitle"), robots: { index: false, follow: false } };
}

const PALETTE_ORDER = [
	"paper",
	"paperShade",
	"ink",
	"inkMuted",
	"inkDisabled",
	"ruleSoft",
	"fieldEdge",
	"stamp",
	"stampStrong",
	"stampTint",
	"error",
	"errorTint",
] as const;

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
	return (
		<h2 id={id} className="type-title text-ink">
			{children}
		</h2>
	);
}

export default async function GalleryPage({ params }: PageProps<"/[locale]/_ui">) {
	if (!isGalleryEnabled) {
		notFound();
	}
	const { locale: requested } = await params;
	const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
	setRequestLocale(locale);

	const t = await getTranslations({ locale, namespace: "Gallery" });
	const tPage = await getTranslations({ locale, namespace: "Practitioner" });
	const tSite = await getTranslations({ locale, namespace: "Site" });
	const tSearch = await getTranslations({ locale, namespace: "Search" });
	const mapStrings = await getMapStrings(locale);
	const empty = tPage("notProvided");
	const providers = {
		openStreetMap: tPage("providers.openStreetMap"),
		appleMaps: tPage("providers.appleMaps"),
		googleMaps: tPage("providers.googleMaps"),
	};

	// Every client component is shown here: the whole catalogue and the API client.
	return (
		<ClientIsland locale={locale} namespaces="all">
			<TRPCReactProvider>
				<SiteHeader locale={locale} href="/_ui" />
				<main id="main" tabIndex={-1} className="flex-1 outline-none">
					<div className="surface-shade border-b border-rule-soft">
						<div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 pt-8 pb-10 sm:px-8">
							<h1 className="type-headline">{t("title")}</h1>
							<p className="max-w-[65ch] text-body text-ink-muted">{t("intro")}</p>
						</div>
					</div>
					<BookletPage>
						<section aria-labelledby="g-tokens" className="flex flex-col gap-6">
							<SectionHeading id="g-tokens">{t("sections.tokens")}</SectionHeading>
							<ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
								{PALETTE_ORDER.map((name) => (
									<li key={name} className="flex items-center gap-3 border-b border-rule-soft pb-3">
										<span
											aria-hidden="true"
											className="size-12 shrink-0 border border-ink"
											style={{ backgroundColor: palette[name] }}
										/>
										<span className="flex min-w-0 flex-col">
											<span className="text-meta font-semibold text-ink">
												{t(`palette.${name}`)}
											</span>
											<span className="text-meta text-ink-muted tabular">
												{palette[name]} · {contrastRatio(palette[name], palette.paper).toFixed(2)}:1
											</span>
										</span>
									</li>
								))}
							</ul>
						</section>

						<section aria-labelledby="g-type" className="flex flex-col gap-4">
							<SectionHeading id="g-type">{t("sections.type")}</SectionHeading>
							<p className="type-display">Apercura</p>
							<p className="type-headline">{t("typeRoles.headline")}</p>
							<p className="type-title">{t("typeRoles.title")}</p>
							<p className="text-lead">{t("typeRoles.lead")}</p>
							<p className="max-w-[65ch] text-body">{t("typeRoles.body")}</p>
							<p className="text-meta text-ink-muted">{t("typeRoles.meta")}</p>
							<p className="type-caption">{t("typeRoles.caps")}</p>
							<p className="text-meta text-ink-muted">{t("typeRoles.display")}</p>
						</section>

						{/* React Aria date components read the clock while rendering: stream them. */}
						<Suspense fallback={<SkeletonText lines={6} label={t("feedback.loadingLabel")} />}>
							<GalleryPrimitives />
						</Suspense>

						<section
							aria-labelledby="g-domain"
							className="flex flex-col gap-10 border-t border-rule-soft pt-6"
						>
							<SectionHeading id="g-domain">{t("sections.domain")}</SectionHeading>

							<div className="flex flex-col gap-3">
								<h3 className="type-subtitle">{t("domain.seals")}</h3>
								<ul className="flex flex-wrap gap-6">
									{SAMPLE_PRACTITIONERS.map((practitioner) => (
										<li key={practitioner.id} className="flex flex-col items-center gap-2">
											<Seal
												rpps={practitioner.rpps}
												verified={practitioner.status === "verified"}
											/>
											<span className="text-meta tabular text-ink-muted">{practitioner.rpps}</span>
										</li>
									))}
								</ul>
								<p className="text-meta text-ink-muted">{t("domain.sealVerified")}</p>
							</div>

							<div className="grid gap-8 md:grid-cols-2">
								<div className="flex flex-col gap-3">
									<h3 className="type-subtitle">{t("domain.fieldRows")}</h3>
									<FieldList>
										<FieldRow
											label={tPage("fields.address")}
											value={SAMPLE_SITE.address.join(", ")}
											emptyLabel={empty}
										/>
										<FieldRow label={tPage("fields.phone")} emptyLabel={empty} />
										<FieldRow label={tPage("fields.access")} value="" emptyLabel={empty} />
									</FieldList>
								</div>
								<div className="flex flex-col gap-3">
									<h3 className="type-subtitle">{t("domain.provenance")}</h3>
									<ProvenanceNote
										locale={locale}
										sourceLabel={tPage("source.label")}
										source={tPage("source.name")}
										sourceHref="https://annuaire.sante.fr"
										externalLabel={tSite("externalLink")}
										updatedLabel={tPage("source.updated")}
										updatedAt={SAMPLE_UPDATED_AT}
									/>
								</div>
							</div>

							<div className="flex flex-col gap-3">
								<h3 className="type-subtitle">{t("domain.actions")}</h3>
								<div className="grid gap-6 md:grid-cols-2">
									<ActionBlock
										headingLevel={4}
										kind="book"
										title={tPage("action.title")}
										statement={tPage("action.book.statement")}
										actionLabel={tPage("action.book.label")}
										href="#g-domain"
									/>
									<ActionBlock
										headingLevel={4}
										kind="call"
										title={tPage("action.title")}
										statement={tPage("action.call.statement")}
										actionLabel={tPage("action.call.label", { phone: SAMPLE_SITE.phoneDisplay })}
										phone={SAMPLE_SITE.phone}
									/>
									<ActionBlock
										headingLevel={4}
										kind="establishment"
										title={tPage("action.title")}
										statement={tPage("action.establishment.statement", {
											establishment: SAMPLE_SITE.establishment,
										})}
										actionLabel={tPage("action.establishment.label", {
											establishment: SAMPLE_SITE.establishment,
										})}
										href={SAMPLE_SITE.establishmentUrl}
										externalLabel={tSite("externalLink")}
									/>
									<ActionBlock
										headingLevel={4}
										kind="locum"
										title={tPage("action.title")}
										statement={tPage("action.locum.statement")}
										hint={tPage("action.locum.hint")}
									/>
								</div>
							</div>

							<div className="flex flex-col gap-3">
								<h3 className="type-subtitle">{t("domain.slots")}</h3>
								<Suspense fallback={<SkeletonText lines={4} label={t("feedback.loadingLabel")} />}>
									<SlotDemo defaultValue="2026-11-25T09:30" />
								</Suspense>
							</div>

							<div className="grid gap-8 md:grid-cols-2">
								<div className="flex flex-col gap-3">
									<h3 className="type-subtitle">{t("domain.site")}</h3>
									<SiteCard
										headingLevel={4}
										name={SAMPLE_SITE.name}
										address={[...SAMPLE_SITE.address]}
										coordinates={SAMPLE_SITE.coordinates}
										directionsLabel={tPage("directions")}
										providers={providers}
										externalLabel={tSite("externalLink")}
									/>
								</div>
								<div className="flex flex-col gap-3">
									<h3 className="type-subtitle">{t("domain.map")}</h3>
									<MapView
										className="h-72"
										center={SAMPLE_SITE.coordinates}
										styleUrl={clientEnv.NEXT_PUBLIC_MAP_STYLE_URL}
										label={tPage("mapLabel", { place: SAMPLE_SITE.name })}
										markerLabel={tPage("mapPin", { place: SAMPLE_SITE.name })}
										strings={mapStrings}
										fallback={
											<p className="bg-paper/90 p-2 text-meta text-ink">
												{SAMPLE_SITE.address.join(", ")}
											</p>
										}
									/>
								</div>
							</div>

							<div className="flex flex-col gap-3">
								<h3 className="type-subtitle">{t("domain.search")}</h3>
								<div className="surface-shade p-5 sm:p-8">
									<BookletSearch
										idPrefix="gallery-search"
										action="#g-domain"
										label={tSearch("label")}
										submitLabel={tSearch("submit")}
										fields={[
											{ name: "quoi", label: tSearch("who"), hint: tSearch("whoHint") },
											{ name: "ou", label: tSearch("where"), hint: tSearch("whereHint") },
										]}
									/>
								</div>
							</div>
						</section>

						<section
							aria-labelledby="g-booklet"
							className="flex flex-col gap-8 border-t border-rule-soft pt-6"
						>
							<SectionHeading id="g-booklet">{t("sections.booklet")}</SectionHeading>
							<BookletSample locale={locale} variant="unclaimed" />
							<Suspense fallback={<SkeletonText lines={8} label={t("feedback.loadingLabel")} />}>
								<BookletSample locale={locale} variant="verified" />
							</Suspense>
						</section>
					</BookletPage>
				</main>
			</TRPCReactProvider>
		</ClientIsland>
	);
}
