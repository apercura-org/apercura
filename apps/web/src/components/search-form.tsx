"use client";

import {
	BookletComboField,
	type BookletComboOption,
	type BookletComboSection,
	BookletSearchFrame,
	BookletSelectField,
	buttonStyles,
} from "@apercura/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
	MARKET_COUNTRIES,
	type MarketCountry,
	marketOf,
	marketOfSegment,
	marketSegment,
} from "~/i18n/locales";
import { getPathname, useRouter } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { searchFormId } from "~/lib/search-form-id";
import { useTRPC } from "~/trpc/client";
import { NearMeButton } from "./near-me-button";

/** Waits until typing pauses before asking for suggestions. */
function useDebounced(value: string, delay = 180) {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), delay);
		return () => clearTimeout(timer);
	}, [value, delay]);
	return debounced;
}

export interface SearchFormProps {
	/** Current query, printed back into the fields. */
	defaultWho?: string;
	defaultWhere?: string;
	/** Market the search runs in (the `pays` choice): the page's own by default. */
	defaultMarket?: MarketCountry;
	/** Prefix for input ids, when several searches share a page. */
	idPrefix?: string;
	/**
	 * `false` prints the form alone: the caller wraps it in the `<search>`
	 * landmark and puts the "near me" action under it (the home page, which
	 * hydrates this form later than that action).
	 */
	landmark?: boolean;
}

/**
 * The booklet search ("Qui ?" / "Où ?" / the country) with suggestions and "near me". The
 * fields are plain inputs of a GET form to `/recherche`: without JavaScript the
 * form submits exactly the same text; with it, suggestions come from tRPC, the places from
 * the country chosen. Another country moves the search to its market (`pays`, read by
 * `searchRedirect`).
 */
export function SearchForm({
	defaultWho = "",
	defaultWhere = "",
	defaultMarket,
	idPrefix = "search",
	landmark = true,
}: SearchFormProps) {
	const locale = useLocale() as Locale;
	const t = useTranslations("Search");
	const tForm = useTranslations("SearchForm");
	const tTaxonomy = useTranslations("taxonomy");
	const trpc = useTRPC();
	const router = useRouter();
	const formId = searchFormId(idPrefix);

	const [who, setWho] = useState(defaultWho);
	const [where, setWhere] = useState(defaultWhere);
	const [market, setMarket] = useState<MarketCountry>(defaultMarket ?? marketOf(locale));
	// Suggestions are fetched only once the visitor types, never for the printed-back query.
	const [touched, setTouched] = useState({ who: false, where: false });
	const whoQuery = useDebounced(who.trim());
	const whereQuery = useDebounced(where.trim());

	const whoResults = useQuery({
		...trpc.search.who.queryOptions({ q: whoQuery, locale }),
		enabled: touched.who && whoQuery.length >= 1 && whoQuery.length <= 80,
		placeholderData: keepPreviousData,
		staleTime: 60_000,
		retry: false,
	});
	const whereResults = useQuery({
		...trpc.search.where.queryOptions({
			q: whereQuery,
			locale,
			...(market === marketOf(locale) ? {} : { market }),
		}),
		enabled: touched.where && whereQuery.length >= 2 && whereQuery.length <= 80,
		placeholderData: keepPreviousData,
		staleTime: 60_000,
		retry: false,
	});

	// Dynamic keys: codes and slugs come from the database.
	const label = (key: string, values?: Record<string, string>) =>
		tTaxonomy.has(key as never) ? tTaxonomy(key as never, values as never) : null;

	const whoSections: BookletComboSection[] =
		who.trim().length === 0 || !whoResults.data
			? []
			: [
					{
						id: "listings",
						title: tForm("specialties"),
						options: whoResults.data.listings.map((listing) => ({
							id: `listing:${listing.slug}`,
							label: listing.label,
							textValue: listing.label,
						})),
					},
					{
						id: "practitioners",
						title: tForm("practitioners"),
						options: whoResults.data.practitioners.map((person) => {
							const title = person.titleCode ? label(`title.${person.titleCode}`) : null;
							const name = [title, person.firstName, person.lastName].filter(Boolean).join(" ");
							const occupation = person.listingSlug
								? label(`listing.${person.listingSlug}`, {
										gender: person.civilityCode === "MME" ? "female" : "other",
									})
								: null;
							return {
								id: `practitioner:${person.slug}`,
								label: name,
								textValue: name,
								detail: [occupation, person.placeName].filter(Boolean).join(" · ") || undefined,
							};
						}),
					},
				];

	const whereSections: BookletComboSection[] =
		where.trim().length < 2 || !whereResults.data
			? []
			: [
					{
						id: "places",
						title: tForm("places"),
						options: whereResults.data.places.map((place) => ({
							id: `place:${place.id}`,
							label: place.name,
							textValue: place.departmentCode
								? `${place.name} (${place.departmentCode})`
								: place.name,
							detail:
								place.kind === "department"
									? tForm("department")
									: [place.departmentCode, place.departmentName].filter(Boolean).join(" · "),
						})),
					},
				];

	/** What the open slip says while it has no rows: still loading, or nothing matches. */
	const status = (typed: string, settled: string, fetching: boolean, minLength: number) => {
		if (typed.length < minLength) return undefined;
		return typed !== settled || fetching ? tForm("searching") : tForm("noSuggestion");
	};
	const whoStatus = touched.who
		? status(who.trim(), whoQuery, whoResults.isFetching, 1)
		: undefined;
	const whereStatus = touched.where
		? status(where.trim(), whereQuery, whereResults.isFetching, 2)
		: undefined;

	const chooseWho = (option: BookletComboOption, sectionId: string) => {
		if (sectionId === "practitioners") {
			const slug = option.id.slice("practitioner:".length);
			router.push({ pathname: "/praticien/[slug]", params: { slug } });
		}
	};

	return (
		<BookletSearchFrame
			formId={formId}
			action={getPathname({ href: "/recherche", locale })}
			label={t("label")}
			submitLabel={t("submit")}
			landmark={landmark}
			footer={
				landmark ? (
					<NearMeButton
						formId={formId}
						className={buttonStyles({
							intent: "ink",
							size: "md",
							className: "normal-case tracking-normal",
						})}
						labels={{
							nearMe: tForm("nearMe"),
							locating: tForm("locating"),
							geoDenied: tForm("geoDenied"),
							geoUnavailable: tForm("geoUnavailable"),
						}}
					/>
				) : null
			}
		>
			<BookletComboField
				id={`${idPrefix}-quoi`}
				name="quoi"
				label={t("who")}
				hint={t("whoHint")}
				defaultValue={defaultWho}
				sections={whoSections}
				onInputChange={(value) => {
					setWho(value);
					setTouched((current) => (current.who ? current : { ...current, who: true }));
				}}
				onChoose={chooseWho}
				emptyStatus={whoStatus}
			/>
			<BookletComboField
				id={`${idPrefix}-ou`}
				name="ou"
				label={t("where")}
				hint={t("whereHint")}
				defaultValue={defaultWhere}
				autoComplete="address-level2"
				sections={whereSections}
				onInputChange={(value) => {
					setWhere(value);
					setTouched((current) => (current.where ? current : { ...current, where: true }));
				}}
				emptyStatus={whereStatus}
			/>
			<BookletSelectField
				id={`${idPrefix}-pays`}
				name="pays"
				label={t("market")}
				defaultValue={marketSegment(market)}
				options={MARKET_COUNTRIES.map((country) => ({
					value: marketSegment(country),
					label: t(`markets.${country}`),
				}))}
				onChange={(value) => setMarket(marketOfSegment(value) ?? marketOf(locale))}
			/>
			{/* Filled by the "near me" action. */}
			<input type="hidden" data-near-me="" />
		</BookletSearchFrame>
	);
}
