import type { RegistrySource } from "@apercura/core/country";
import type { PlaceRef } from "~/server/queries/types";
import { placeLabel, REGION_LISTING_MARKETS } from "./places";

/*
 * The rules of the one home every market renders (`app/[locale]/page.tsx`), kept pure so they
 * are unit-tested without a database: which places the directory section lists, which rows the
 * figures print, and how the sources are named.
 */

/**
 * Markets whose places run to the hundreds (France's hundred-odd départements, Germany's four
 * hundred Kreise): their home lists the largest ones only, the directory page lists them all.
 */
export const TOP_PLACES_MARKETS: ReadonlySet<string> = new Set(["FR", "DE"]);

/** How many places the home of a {@link TOP_PLACES_MARKETS} market lists. */
export const HOME_PLACES_LIMIT = 30;

type DepartmentLike = PlaceRef & { practitionerCount: number };

type RegionLike = { code: string; name: string; slug: string; departments: DepartmentLike[] };

export type HomePlace = { key: string; label: string; slug: string; count: number };

/**
 * The places a market's home lists, each a hub of the directory: the regions where they have
 * pages of their own (the UK's regions and nations, Italy's regions, Switzerland's cantons);
 * else the departments (Austria's Bundesländer, Czechia's districts, Spain's provinces), the
 * largest {@link HOME_PLACES_LIMIT} only in France and Germany. Directory order, or the largest
 * first when cut. Places without anyone listed are left out.
 */
export function homePlaces(country: string, regions: readonly RegionLike[]): HomePlace[] {
	if (REGION_LISTING_MARKETS.has(country)) {
		return regions
			.filter((region) => region.slug)
			.map((region) => ({
				key: region.code,
				label: region.name,
				slug: region.slug,
				count: region.departments.reduce((sum, item) => sum + item.practitionerCount, 0),
			}))
			.filter((place) => place.count > 0);
	}
	const places = regions
		.flatMap((region) => region.departments)
		.filter((department) => department.practitionerCount > 0)
		.map((department) => ({
			key: String(department.id),
			label: placeLabel(department, country),
			slug: department.slug,
			count: department.practitionerCount,
		}));
	if (!TOP_PLACES_MARKETS.has(country)) return places;
	return places
		.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
		.slice(0, HOME_PLACES_LIMIT);
}

export type FigureRow = { key: string; label: string; codes: string[] };

/**
 * One figure row per listing, in the order of `codes`: kinds that share a listing share a row
 * (Spain's health centres and local surgeries). `listingOf` maps a profession code to its
 * listing slug, `labelOf` a listing slug to its label.
 */
export function listingRows(
	codes: readonly string[],
	listingOf: (code: string) => string | null,
	labelOf: (slug: string) => string | null,
): FigureRow[] {
	const rows = new Map<string, FigureRow>();
	for (const code of codes) {
		const slug = listingOf(code) ?? code;
		const row = rows.get(slug);
		if (row) row.codes.push(code);
		else rows.set(slug, { key: code, label: labelOf(slug) ?? code, codes: [code] });
	}
	return [...rows.values()];
}

/** Markets whose lists are credited by publisher: the UK's eight lists come from three. */
const BY_PUBLISHER: ReadonlySet<string> = new Set(["GB", "CH"]);

/**
 * The sources a market's figures and specimen credit: the registries that provide its
 * practitioners or facilities, by name, or by publisher where several lists share one (the UK,
 * Switzerland). `covered`, when given, keeps only the registries actually imported
 * (Switzerland's cantonal lists): a list that was never imported is not credited.
 */
export function sourceLine(
	country: string,
	registries: readonly Pick<RegistrySource, "id" | "name" | "publisher" | "provides">[],
	covered?: readonly string[] | null,
): string {
	const byPublisher = BY_PUBLISHER.has(country);
	const names = registries
		.filter((registry) => registry.provides.includes("practitioners"))
		.filter((registry) => !covered || covered.includes(registry.id))
		.map((registry) => (byPublisher ? registry.publisher : registry.name));
	return [...new Set(names)].join(byPublisher ? "; " : ", ");
}
