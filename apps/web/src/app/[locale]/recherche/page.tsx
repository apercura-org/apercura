import { parseSearchQuery, type SearchQuery } from "@apercura/core";
import { buttonStyles, EmptyState, linkStyles, tableStyles } from "@apercura/ui";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookletPage } from "~/components/booklet-page";
import { ClientIsland, SEARCH_FORM_MESSAGES } from "~/components/client-island";
import { PublicPage } from "~/components/public-page";
import { ResultsMap } from "~/components/results-map";
import { SearchForm } from "~/components/search-form";
import { clientEnv } from "~/env";
import { type MarketCountry, marketOf, marketOfSegment } from "~/i18n/locales";
import { Link, redirect } from "~/i18n/navigation";
import { type Locale, routing } from "~/i18n/routing";
import { genderOf, getTaxonomyLabels } from "~/lib/labels";
import { resolveSearchTerm } from "~/lib/listing-index";
import { getMapStrings } from "~/lib/map-strings";
import { cardTownLine, formatPhone } from "~/lib/practitioner-view";
import { slotParts, slotTime } from "~/lib/slot-format";
import {
	matchPlaces,
	type PlaceSuggestion,
	SEARCH_PAGE_SIZE,
	type SearchResult,
	searchPractitioners,
	suggestPlaces,
} from "~/server/queries/search";
import { searchRedirect } from "~/server/search-redirect";
import { TRPCReactProvider } from "~/trpc/client";

/**
 * Search is dynamic and never indexed. The page awaits its query at the top
 * level (no static shell) so redirects to practitioner and listing pages are
 * real HTTP redirects, decided before anything is sent.
 */
export const instant = false;

type Props = PageProps<"/[locale]/recherche">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { locale: requested } = await params;
	const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
	const t = await getTranslations({ locale, namespace: "Metadata" });
	return { title: t("searchTitle"), robots: { index: false, follow: true } };
}

const first = (value: string | string[] | undefined) =>
	(Array.isArray(value) ? value[0] : value) ?? undefined;

/** Results pages beyond this are not served: refine the search instead. */
const MAX_PAGE = 50;

function pageOf(value: string | undefined): number {
	const page = Number(value);
	return Number.isInteger(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1;
}

type Outcome =
	| { kind: "start" }
	| { kind: "rpps_missing"; rpps: string }
	| { kind: "unknown_place"; candidates: PlaceSuggestion[] }
	| { kind: "ambiguous_place"; candidates: PlaceSuggestion[] }
	| { kind: "results"; results: SearchResult[]; hasNext: boolean }
	/** "Qui ?" names care the market does not list: said so, above any practitioner of that name. */
	| { kind: "unlisted"; results: SearchResult[]; hasNext: boolean };

/**
 * Applies the search rules, redirecting (307) when the query names a page: an
 * RPPS number goes to its practitioner page, a specialty in a place to its
 * listing page, a specialty alone to its hub. Everything else is a list.
 */
async function run(
	query: SearchQuery,
	page: number,
	locale: Locale,
	chosen: MarketCountry | null,
): Promise<Outcome> {
	const country = marketOf(locale);
	const target = await searchRedirect(query, page, locale, chosen);
	if (target) redirect(target);
	if (query.rpps && country === "FR") return { kind: "rpps_missing", rpps: query.rpps };
	const term = query.who ? resolveSearchTerm(query.who, country) : null;
	const listingSlug = term?.kind === "listing" ? term.slug : null;
	const wantsPlace = Boolean((query.where || query.postcode) && !query.near);
	const places = wantsPlace
		? await matchPlaces({
				country,
				where: query.where,
				...(query.postcode ? { postcode: query.postcode } : {}),
				...(query.departmentHint ? { departmentHint: query.departmentHint } : {}),
			})
		: [];
	const place = places.length === 1 ? (places[0] ?? null) : null;

	if (wantsPlace && places.length > 1) return { kind: "ambiguous_place", candidates: places };
	if (wantsPlace && places.length === 0) {
		return {
			kind: "unknown_place",
			candidates: await suggestPlaces(query.where || query.postcode || "", 5, country),
		};
	}
	if (!query.who && !place && !query.near) return { kind: "start" };

	return {
		kind: term?.kind === "unlisted" ? "unlisted" : "results",
		...(await searchPractitioners({
			country,
			...(listingSlug ? { listingSlug } : query.who ? { name: query.who } : {}),
			...(place ? { placeId: place.id } : {}),
			...(query.near ? { near: query.near } : {}),
			page,
		})),
	};
}

/** "Où ?" as typed, with its department hint. */
function typedWhere(query: SearchQuery): string {
	return [query.where || query.postcode, query.departmentHint ? `(${query.departmentHint})` : null]
		.filter(Boolean)
		.join(" ");
}

export default async function SearchPage({ params, searchParams }: Props) {
	const { locale: requested } = await params;
	const locale: Locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
	setRequestLocale(locale);
	const raw = await searchParams;
	const query = parseSearchQuery({
		quoi: first(raw.quoi),
		ou: first(raw.ou),
		pres: first(raw.pres),
	});
	const page = pageOf(first(raw.page));
	const outcome = await run(query, page, locale, marketOfSegment(first(raw.pays)));

	const t = await getTranslations({ locale, namespace: "SearchPage" });

	return (
		<PublicPage locale={locale} href="/recherche">
			<div className="rule-double-b">
				<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 pt-8 pb-10 sm:px-8 lg:pe-[calc(33.333%+1rem)]">
					<h1 className="type-headline">{t("title")}</h1>
					<ClientIsland locale={locale} namespaces={SEARCH_FORM_MESSAGES}>
						<TRPCReactProvider>
							<SearchForm defaultWho={query.who} defaultWhere={typedWhere(query)} />
						</TRPCReactProvider>
					</ClientIsland>
				</div>
			</div>
			<BookletPage>
				<div className="flex flex-col gap-6">
					<QuerySummary locale={locale} query={query} />
					<OutcomeView locale={locale} outcome={outcome} query={query} page={page} />
				</div>
			</BookletPage>
		</PublicPage>
	);
}

async function QuerySummary({ locale, query }: { locale: Locale; query: SearchQuery }) {
	const t = await getTranslations({ locale, namespace: "SearchPage" });
	const who = query.who;
	const where = typedWhere(query);
	let text: string | null = null;
	if (query.near) text = who ? t("queryNear", { who }) : t("queryOnlyNear");
	else if (who && where) text = t("queryWhere", { who, where });
	else if (who) text = t("query", { who });
	else if (where) text = t("queryOnlyWhere", { where });
	return text ? <p className="text-lead text-ink">{text}</p> : null;
}

/** The same search with another place typed in "Où ?". */
function placeHref(query: SearchQuery, candidate: PlaceSuggestion) {
	const where = candidate.departmentCode
		? `${candidate.name} (${candidate.departmentCode})`
		: candidate.name;
	return {
		pathname: "/recherche" as const,
		query: query.who ? { quoi: query.who, ou: where } : { ou: where },
	};
}

async function PlaceList({
	query,
	candidates,
	locale,
}: {
	query: SearchQuery;
	candidates: PlaceSuggestion[];
	locale: Locale;
}) {
	const t = await getTranslations({ locale, namespace: "SearchPage" });
	return (
		<ul className="flex flex-col border-t border-rule-soft">
			{candidates.map((candidate) => (
				<li key={candidate.id} className="border-b border-rule-soft">
					<Link
						href={placeHref(query, candidate)}
						className={`${linkStyles()} flex min-h-12 flex-wrap items-baseline gap-x-2 py-2 text-body`}
					>
						<span className="font-semibold">{candidate.name}</span>
						<span className="text-meta text-ink-muted">
							{candidate.kind === "department"
								? t("departmentPlace")
								: [candidate.departmentCode, candidate.departmentName].filter(Boolean).join(" · ")}
						</span>
					</Link>
				</li>
			))}
		</ul>
	);
}

const sectionHeading = "type-title text-ink";
const table = tableStyles();

async function OutcomeView({
	locale,
	outcome,
	query,
	page,
}: {
	locale: Locale;
	outcome: Outcome;
	query: SearchQuery;
	page: number;
}) {
	const t = await getTranslations({ locale, namespace: "SearchPage" });
	const browse = (
		<Link href="/annuaire" className={buttonStyles({ intent: "ink" })}>
			{t("browseDirectory")}
		</Link>
	);

	switch (outcome.kind) {
		case "start":
			return <EmptyState title={t("startTitle")} description={t("startBody")} action={browse} />;
		case "rpps_missing":
			return (
				<EmptyState
					title={t("rppsTitle", { rpps: outcome.rpps })}
					description={t("rppsBody")}
					action={
						<Link href="/pro" className={buttonStyles({ intent: "ink" })}>
							{t("rppsPro")}
						</Link>
					}
				/>
			);
		case "ambiguous_place":
			return (
				<section aria-labelledby="places-heading" className="flex flex-col gap-4">
					<h2 id="places-heading" className={sectionHeading}>
						{t("ambiguousTitle", { where: query.where })}
					</h2>
					<p className="text-body text-ink">{t("ambiguousBody")}</p>
					<PlaceList query={query} candidates={outcome.candidates} locale={locale} />
				</section>
			);
		case "unknown_place":
			return (
				<div className="flex flex-col gap-6">
					<EmptyState
						title={t("unknownPlaceTitle", { where: typedWhere(query) })}
						description={
							outcome.candidates.length > 0 ? t("unknownPlaceSuggest") : t("unknownPlaceBody")
						}
						action={outcome.candidates.length > 0 ? undefined : browse}
					/>
					{outcome.candidates.length > 0 ? (
						<PlaceList query={query} candidates={outcome.candidates} locale={locale} />
					) : null}
				</div>
			);
		case "results":
			if (outcome.results.length === 0) {
				return (
					<EmptyState
						title={page > 1 ? t("noMoreTitle") : t("emptyTitle")}
						description={t("emptyBody")}
						action={browse}
					/>
				);
			}
			return <Results locale={locale} outcome={outcome} query={query} page={page} />;
		case "unlisted":
			return (
				<div className="flex flex-col gap-6">
					<EmptyState
						title={t("unlistedTitle", { who: query.who })}
						description={t("unlistedBody")}
						action={browse}
					/>
					{outcome.results.length > 0 ? (
						<Results
							locale={locale}
							outcome={{ ...outcome, kind: "results" }}
							query={query}
							page={page}
						/>
					) : null}
				</div>
			);
	}
}

async function Results({
	locale,
	outcome,
	query,
	page,
}: {
	locale: Locale;
	outcome: Extract<Outcome, { kind: "results" }>;
	query: SearchQuery;
	page: number;
}) {
	const t = await getTranslations({ locale, namespace: "SearchPage" });
	const labels = await getTaxonomyLabels(locale);
	const mapStrings = await getMapStrings(locale);
	const kilometres = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
	const from = (page - 1) * SEARCH_PAGE_SIZE + 1;
	const to = from + outcome.results.length - 1;
	/** What the patient can do next, from the place shown: call it, go through its establishment… */
	const action = (result: SearchResult) => {
		if (result.nextFreeAt && result.bookingTimeZone) {
			// Bookable online: the next free time, opening the booking panel on the practitioner's page.
			const next = slotParts(new Date(result.nextFreeAt).getTime(), result.bookingTimeZone, locale);
			return (
				<Link
					href={{
						pathname: "/praticien/[slug]",
						params: { slug: result.slug },
						query: { rdv: "1" },
					}}
					className={`${linkStyles()} tabular font-semibold`}
				>
					{t("action.nextFree", { slot: `${next.dayLabel} ${slotTime(next)}` })}
				</Link>
			);
		}
		const kind = result.practiceKind;
		if (kind === "locum") return <span>{t("action.locum")}</span>;
		if (kind === "hospital" && result.establishmentSlug) {
			return (
				<Link
					href={{ pathname: "/etablissement/[slug]", params: { slug: result.establishmentSlug } }}
					className={linkStyles()}
				>
					{t("action.establishment")}
				</Link>
			);
		}
		if (kind === "office" || kind === "health_center" || kind === "hospital") {
			if (!result.phone) return <span className="text-ink-muted">{t("action.noPhone")}</span>;
			return (
				<a href={`tel:${result.phone}`} className={`${linkStyles()} tabular whitespace-nowrap`}>
					{t("action.call", { phone: formatPhone(result.phone) })}
				</a>
			);
		}
		return <span>{t("action.page")}</span>;
	};
	const where = typedWhere(query);
	const pageQuery = (target: number) => ({
		...(query.who ? { quoi: query.who } : {}),
		...(where ? { ou: where } : {}),
		...(query.near ? { pres: `${query.near.lat},${query.near.lon}` } : {}),
		...(target > 1 ? { page: String(target) } : {}),
	});
	const pins = outcome.results.flatMap((result) =>
		result.lat !== null && result.lon !== null
			? [{ lat: result.lat, lon: result.lon, label: labels.personName(result) }]
			: [],
	);

	return (
		<section aria-labelledby="results-heading" className="flex flex-col gap-5">
			<div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
				<h2 id="results-heading" className={sectionHeading}>
					{t("resultsHeading")}
				</h2>
				<p className="tabular text-meta text-ink-muted">{t("range", { from, to })}</p>
			</div>
			<p className="max-w-[65ch] text-body text-ink">
				{query.near ? t("orderNear") : t("orderName")}{" "}
				{outcome.results.some((result) => result.nextFreeAt)
					? t("bookingOpenSome")
					: t("bookingNotOpen")}
			</p>
			<ResultsMap
				pins={pins}
				styleUrl={clientEnv.NEXT_PUBLIC_MAP_STYLE_URL}
				labels={{
					show: t("map.show"),
					hide: t("map.hide"),
					region: t("map.region"),
					fallback: t("map.fallback"),
				}}
				mapStrings={mapStrings}
			/>
			<table className={table.table()} aria-labelledby="results-heading">
				<thead className={table.head()}>
					<tr>
						<th scope="col" className={table.column()}>
							{t("columns.practitioner")}
						</th>
						<th scope="col" className={table.column()}>
							{t("columns.place")}
						</th>
						<th scope="col" className={table.column({ className: "hidden md:table-cell" })}>
							{t("columns.appointments")}
						</th>
					</tr>
				</thead>
				<tbody>
					{outcome.results.map((result) => {
						const gender = genderOf(result.civilityCode);
						const occupation =
							labels.occupation(result.listingSlug, gender) ??
							labels.profession(result.listingSlug ?? "", gender);
						const address = [
							result.addressLine,
							cardTownLine(result.postcode, result.placeName, marketOf(locale)),
						]
							.filter(Boolean)
							.join(", ");
						return (
							<tr key={result.id} className={table.row()}>
								<td className={table.cell()}>
									<Link
										href={{ pathname: "/praticien/[slug]", params: { slug: result.slug } }}
										className={`${linkStyles()} font-semibold`}
									>
										{labels.personName(result)}
									</Link>
									{occupation ? <p className="text-meta text-ink">{occupation}</p> : null}
									<p className="text-meta text-ink md:hidden">{action(result)}</p>
								</td>
								<td className={table.cell({ className: "text-meta" })}>
									{result.siteName ? (
										<span className="block text-ink">{result.siteName}</span>
									) : null}
									{address ? <span className="block text-ink-muted">{address}</span> : null}
									{where && !query.near && !result.inPlace ? (
										<span className="block text-ink">{t("outsidePlace", { where })}</span>
									) : null}
									{result.distance !== null ? (
										<span className="tabular block text-ink">
											{t("distance", { km: kilometres.format(result.distance / 1000) })}
										</span>
									) : null}
								</td>
								<td className={table.cell({ className: "hidden text-meta md:table-cell" })}>
									{action(result)}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
			{page > 1 || outcome.hasNext ? (
				<nav aria-label={t("pagination")} className="flex flex-wrap gap-3">
					{page > 1 ? (
						<Link
							href={{ pathname: "/recherche", query: pageQuery(page - 1) }}
							className={buttonStyles({ intent: "ink" })}
						>
							{t("previous")}
						</Link>
					) : null}
					{outcome.hasNext && page < MAX_PAGE ? (
						<Link
							href={{ pathname: "/recherche", query: pageQuery(page + 1) }}
							className={buttonStyles({ intent: "ink" })}
						>
							{t("next")}
						</Link>
					) : null}
				</nav>
			) : null}
		</section>
	);
}
