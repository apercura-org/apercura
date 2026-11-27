/**
 * The Swiss lists combined into one set of facilities, before the merge: each row located with
 * swisstopo's postcode directory, and the facilities two lists give merged into one page.
 *
 * - A hospital or clinic of a canton's list that is a site of the FOPH's figures (same commune
 *   or postcode, and the same name or street) is that site: the canton's list adds its point
 *   (address precision), its phone and the emergency department it records, and is credited on
 *   the page (`quelle`); it gets no page of its own. Without the FOPH's figures in the run, the
 *   cantons' hospitals are not read at all, so no page doubles a FOPH site.
 * - A nursing home two cantons list (Basel-Landschaft lists homes of Basel-Stadt on its list) is
 *   one page: the list of the canton it lies in, crediting the other.
 */
import { slugifyDe } from "@apercura/core";
import { CH_HOSPITAL_KINDS, CH_NURSING_HOME } from "@apercura/core/taxonomy";
import type { ChLocation, ChLocator } from "./places";
import { CH_SOURCES, type ChSourceId } from "./sources";
import {
	CH_SERVICE_SOURCE,
	CH_SOURCE_SOURCE,
	type ChFacility,
	type ParseResult,
	quarantine,
} from "./types";

export type LocatedFacility = ChFacility<ChSourceId> & { location: ChLocation };

export type CombineStats = {
	/** Cantonal hospitals merged into a site of the FOPH's figures, by list. */
	mergedIntoBag: Record<string, number>;
	/** Cantonal hospitals left out because the FOPH's figures were not read. */
	hospitalsWithoutBag: number;
	/** Nursing homes listed by two cantons, merged into the list of the canton they lie in. */
	homesMerged: number;
	/** Facilities placed by their commune number, postcode, locality, point or a neighbouring postcode. */
	placedBy: Record<string, number>;
	/** Sites of the FOPH's figures given a point by a canton's list. */
	bagWithPoint: number;
};

const tokens = (key: string) =>
	new Set(key.split(" ").filter((token) => token.length > 1 || /^\d$/.test(token)));

/**
 * True when one name's distinctive words are all in the other's (`Hôpital La Tour` and `Hôpital
 * de La Tour`, `Senevita Obstgarten` and `Pflegezentrum Senevita Obstgarten`), numbers included,
 * so `Pflegeheim Muster 2` is never `Pflegeheim Muster 3`.
 */
export function similarNames(a: readonly string[], b: readonly string[]): boolean {
	for (const left of a) {
		for (const right of b) {
			const x = tokens(left);
			const y = tokens(right);
			if (x.size === 0 || y.size === 0) continue;
			const [small, large] = x.size <= y.size ? [x, y] : [y, x];
			if ([...small].every((token) => large.has(token))) return true;
		}
	}
	return false;
}

/** Words of a street line that do not tell two streets apart. */
const STREET_NOISE = new Set([
	"de",
	"la",
	"le",
	"les",
	"du",
	"des",
	"l",
	"d",
	"di",
	"del",
	"via",
	"rue",
	"route",
	"rte",
	"chemin",
	"ch",
	"avenue",
	"av",
	"boulevard",
	"bd",
	"place",
	"quai",
	"strasse",
	"str",
	"weg",
	"gasse",
	"platz",
]);

/**
 * A street line for matching, whatever the order of its number (`6 avenue Beau-Séjour`, `Avenue
 * de Beau-Séjour 6`): its house number and its distinctive words.
 */
export function streetKey(street: string | null): { number: string; words: Set<string> } | null {
	if (!street) return null;
	const parts = slugifyDe(
		street.replace(/strasse\b/gi, " strasse").replace(/str\.(?=\s|$)/gi, " strasse"),
	)
		.split("-")
		.filter(Boolean);
	const number = parts.find((part) => /^\d+[a-z]?$/.test(part)) ?? "";
	const words = new Set(parts.filter((part) => !/^\d/.test(part) && !STREET_NOISE.has(part)));
	return number && words.size > 0 ? { number, words } : null;
}

/** True when two street lines have the same house number and share a distinctive word. */
export function sameStreet(a: string | null, b: string | null): boolean {
	const x = streetKey(a);
	const y = streetKey(b);
	if (!x || !y || x.number !== y.number) return false;
	for (const word of x.words) if (y.words.has(word)) return true;
	return false;
}

const samePlace = (a: LocatedFacility, b: LocatedFacility) =>
	a.location.communeCode === b.location.communeCode || a.location.postcode === b.location.postcode;

const sameKey = (a: readonly string[], b: readonly string[]) =>
	a.some((key) => key !== "" && b.includes(key));

/**
 * How surely two rows of two lists are one facility, 0 when they are not: in the same commune or
 * postcode, the same name and street (4), the same name (3), the same street and kind (2), or
 * one's name within the other's when a list gives no street (1). Two different streets are two
 * facilities, whatever their names.
 */
export function matchScore(a: LocatedFacility, b: LocatedFacility): number {
	if (!samePlace(a, b)) return 0;
	const street = sameStreet(a.street, b.street);
	const named = similarNames(a.matchKeys, b.matchKeys);
	if (street && named) return 4;
	if (sameKey(a.matchKeys, b.matchKeys)) return 3;
	if (street && a.professionCode === b.professionCode) return 2;
	if (named && (!streetKey(a.street) || !streetKey(b.street))) return 1;
	return 0;
}

/** The candidate most surely the same facility as `row`, or undefined. */
function bestMatch(candidates: readonly LocatedFacility[], row: LocatedFacility) {
	let best: LocatedFacility | undefined;
	let score = 0;
	for (const candidate of candidates) {
		const value = matchScore(candidate, row);
		if (value > score) {
			best = candidate;
			score = value;
		}
	}
	return best;
}

const credit = (row: ChFacility, source: ChSourceId) => {
	const registry = CH_SOURCES[source].registry;
	if (registry === CH_SOURCES[row.source as ChSourceId]?.registry) return;
	if (
		row.qualifications.some((item) => item.source === CH_SOURCE_SOURCE && item.code === registry)
	) {
		return;
	}
	row.qualifications.push({ source: CH_SOURCE_SOURCE, code: registry, label: "" });
};

/**
 * Locates and combines the parsed lists (the FOPH's first). Rows that cannot be placed are
 * quarantined in their list's result. Returns the facilities to merge, one per page.
 */
export function combineChLists(
	results: readonly ParseResult<ChSourceId>[],
	locator: ChLocator,
): { facilities: LocatedFacility[]; stats: CombineStats } {
	const stats: CombineStats = {
		mergedIntoBag: {},
		hospitalsWithoutBag: 0,
		homesMerged: 0,
		placedBy: {},
		bagWithPoint: 0,
	};
	const hospitalKinds = new Set(CH_HOSPITAL_KINDS);
	const withBag = results.some((result) => result.source === "bag");
	const located: LocatedFacility[] = [];
	for (const result of results) {
		const kept: ChFacility<ChSourceId>[] = [];
		for (const row of result.rows) {
			if (result.source !== "bag" && hospitalKinds.has(row.professionCode) && !withBag) {
				stats.hospitalsWithoutBag++;
				continue;
			}
			const location = locator.locate(row);
			if (!location) {
				quarantine(result, row.lineNo, "not placed", row.postcode ?? row.name);
				continue;
			}
			stats.placedBy[location.by] = (stats.placedBy[location.by] ?? 0) + 1;
			kept.push(row);
			located.push({
				...row,
				postcode: row.postcode ?? location.postcode,
				locality: row.locality || location.locality,
				location,
			});
		}
		result.rows.splice(0, result.rows.length, ...kept);
	}

	const bag = located.filter((row) => row.source === "bag");
	const bagByPlace = new Map<string, LocatedFacility[]>();
	for (const site of bag) {
		for (const key of [`c${site.location.communeCode}`, `p${site.location.postcode}`]) {
			const list = bagByPlace.get(key) ?? [];
			list.push(site);
			bagByPlace.set(key, list);
		}
	}
	const facilities: LocatedFacility[] = [...bag];
	const homes: LocatedFacility[] = [];
	for (const row of located) {
		if (row.source === "bag") continue;
		if (hospitalKinds.has(row.professionCode)) {
			const candidates = [
				...(bagByPlace.get(`c${row.location.communeCode}`) ?? []),
				...(bagByPlace.get(`p${row.location.postcode}`) ?? []),
			];
			const site = bestMatch(candidates, row);
			if (site) {
				if (site.location.precision === "city" && row.location.precision === "address") {
					site.location = { ...site.location, point: row.location.point, precision: "address" };
					stats.bagWithPoint++;
				}
				site.phone ??= row.phone;
				for (const service of row.qualifications.filter(
					(item) => item.source === CH_SERVICE_SOURCE,
				)) {
					if (
						!site.qualifications.some(
							(item) => item.source === CH_SERVICE_SOURCE && item.code === service.code,
						)
					) {
						site.qualifications.push(service);
					}
				}
				credit(site, row.source);
				stats.mergedIntoBag[row.source] = (stats.mergedIntoBag[row.source] ?? 0) + 1;
				continue;
			}
		}
		if (row.professionCode === CH_NURSING_HOME) {
			const twin = bestMatch(homes, row);
			if (twin) {
				stats.homesMerged++;
				// Keep the list of the canton the home lies in.
				const own = CH_SOURCES[row.source].canton === row.location.canton;
				const twinOwn = CH_SOURCES[twin.source].canton === twin.location.canton;
				if (own && !twinOwn) {
					credit(row, twin.source);
					row.phone ??= twin.phone;
					homes.splice(homes.indexOf(twin), 1, row);
					facilities.splice(facilities.indexOf(twin), 1, row);
				} else {
					credit(twin, row.source);
					twin.phone ??= row.phone;
				}
				continue;
			}
			homes.push(row);
		}
		facilities.push(row);
	}
	return { facilities, stats };
}
