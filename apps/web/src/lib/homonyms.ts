import { isEuropeanCityOf } from "@apercura/core/geo";
import { isDepartmentCity } from "./places";

/** A homonym is clearly the largest at this many times the population of the next one. */
export const CLEARLY_LARGER = 10;

/** What tells same-named places of one market apart. */
export type Homonym = { id: number; code: string; population: number | null };

/** The one entry above all the others by `size`, else null (a tie, or nothing to compare). */
function largest<T>(entries: readonly T[], size: (entry: T) => number, factor = 1): T | null {
	const sorted = [...entries].sort((a, b) => size(b) - size(a));
	const [first, second] = sorted;
	if (!first || size(first) <= 0) return null;
	if (!second) return first;
	return size(first) > size(second) && size(first) >= factor * size(second) ? first : null;
}

/**
 * The place a name means among the same-named places of one market (`country`), when one stands
 * out; null when the name is genuinely ambiguous (two villages of a size), and the search asks
 * which. In order:
 *
 * 1. the level of the place: the one city that is a department of its own (`isDepartmentCity`:
 *    Vilnius, a city municipality, over the village Vilnius in Kupiškis; a kreisfreie Stadt, a
 *    Polish city with powiat rights, Praha, Wien, Oslo, Helsinki);
 * 2. its population, when every candidate left carries one (France, Germany, Spain, Ireland):
 *    the largest, at any margin when `where` is one of the market's main cities
 *    (`@apercura/core/geo`), else only when it is {@link CLEARLY_LARGER} times the next one;
 * 3. for one of the market's main cities whose places carry neither (most markets publish no
 *    population): the one with the most places of care (`sites`, by place id), when given.
 *
 * Several department cities of one name (Frankfurt am Main and Frankfurt an der Oder) are
 * compared by population, then places of care, as the others are.
 */
export function standoutPlace<T extends Homonym>(
	places: readonly T[],
	country: string,
	where: string,
	sites?: ReadonlyMap<number, number>,
): T | null {
	if (places.length <= 1) return places[0] ?? null;
	const cities = places.filter((place) => isDepartmentCity(country, place.code));
	if (cities.length === 1) return cities[0] ?? null;
	const pool = cities.length > 1 ? cities : places;
	const mainCity = isEuropeanCityOf(where, country);
	if (pool.every((place) => place.population !== null)) {
		const found = largest(pool, (place) => place.population ?? 0, mainCity ? 1 : CLEARLY_LARGER);
		if (found) return found;
	}
	if (mainCity && sites) return largest(pool, (place) => sites.get(place.id) ?? 0);
	return null;
}
