"use client";

import {
	BookletComboField,
	type BookletComboOption,
	type BookletComboSection,
	BookletSearchFrame,
	buttonStyles,
	PinIcon,
} from "@apercura/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { getPathname, useRouter } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { useTRPC } from "~/trpc/client";

/** Waits until typing pauses before asking for suggestions. */
function useDebounced(value: string, delay = 180) {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), delay);
		return () => clearTimeout(timer);
	}, [value, delay]);
	return debounced;
}

type GeoStatus = "idle" | "locating" | "denied" | "unavailable";

export interface SearchFormProps {
	/** Current query, printed back into the fields. */
	defaultWho?: string;
	defaultWhere?: string;
	/** Prefix for input ids, when several searches share a page. */
	idPrefix?: string;
}

/**
 * The booklet search ("Qui ?" / "Où ?") with suggestions and "near me". The
 * fields are plain inputs of a GET form to `/recherche`: without JavaScript the
 * form submits exactly the same text; with it, suggestions come from tRPC.
 */
export function SearchForm({
	defaultWho = "",
	defaultWhere = "",
	idPrefix = "search",
}: SearchFormProps) {
	const locale = useLocale() as Locale;
	const t = useTranslations("Search");
	const tForm = useTranslations("SearchForm");
	const tTaxonomy = useTranslations("taxonomy");
	const trpc = useTRPC();
	const router = useRouter();
	const formId = useId();
	const presRef = useRef<HTMLInputElement>(null);

	const [who, setWho] = useState(defaultWho);
	const [where, setWhere] = useState(defaultWhere);
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
		...trpc.search.where.queryOptions({ q: whereQuery }),
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

	// "Near me" exists only where the browser can locate the visitor.
	const [geoSupported, setGeoSupported] = useState(false);
	const [geo, setGeo] = useState<GeoStatus>("idle");
	useEffect(() => setGeoSupported("geolocation" in navigator), []);

	const locate = () => {
		setGeo("locating");
		navigator.geolocation.getCurrentPosition(
			(position) => {
				const form = document.getElementById(formId) as HTMLFormElement | null;
				if (!form || !presRef.current) return;
				// Named only now, so an ordinary search never carries an empty `pres`.
				presRef.current.name = "pres";
				presRef.current.value = `${position.coords.latitude.toFixed(5)},${position.coords.longitude.toFixed(5)}`;
				// Near me replaces the place: the results are ordered by distance.
				const whereInput = form.elements.namedItem("ou") as HTMLInputElement | null;
				if (whereInput) whereInput.value = "";
				form.requestSubmit();
			},
			(error) => setGeo(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable"),
			{ enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
		);
	};

	return (
		<BookletSearchFrame
			formId={formId}
			action={getPathname({ href: "/recherche", locale })}
			label={t("label")}
			submitLabel={t("submit")}
			footer={
				geoSupported ? (
					<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
						<button
							type="button"
							onClick={locate}
							disabled={geo === "locating"}
							className={buttonStyles({
								intent: "ink",
								size: "md",
								className: "normal-case tracking-normal",
							})}
						>
							<PinIcon className="size-5" />
							{geo === "locating" ? tForm("locating") : tForm("nearMe")}
						</button>
						<p role="status" className="text-meta text-ink">
							{geo === "denied"
								? tForm("geoDenied")
								: geo === "unavailable"
									? tForm("geoUnavailable")
									: ""}
						</p>
					</div>
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
			<input ref={presRef} type="hidden" />
		</BookletSearchFrame>
	);
}
