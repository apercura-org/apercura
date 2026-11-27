/**
 * The Irish lists placed and made one page per facility. Many of the HSE's community hospitals
 * and continuing-care units are also designated centres for older people on HIQA's register:
 * when an HSE hospital of those kinds and a HIQA centre are the same facility (the same Eircode,
 * or the same county and the same name once the kind of facility is left out of it), HIQA's
 * current register makes the page and the HSE's row is not imported. Comparing Eircodes tells two
 * rows are one facility; an Eircode never locates anything.
 *
 * Without HIQA's register in a run, the HSE's hospitals of those kinds are not read either (they
 * could double a centre's page) and keep their pages as the last run left them.
 */
import { IE_HSE_CARE_KINDS } from "./hse";
import type { IeLocation, IeLocator, IePlacedBy } from "./locate";
import type { IeFacility, IeSourceId, ParseResult } from "./types";

export type LocatedIeFacility = IeFacility & { location: IeLocation };

export type IePlacedList = {
	source: IeSourceId;
	rows: LocatedIeFacility[];
	/** How the list's facilities were placed (`stats.sources.<id>.placed`). */
	placed: Partial<Record<IePlacedBy | "unplaced", number>>;
};

/**
 * Places a list's facilities (by name, or by the point PostGIS found each in); a facility that
 * cannot be placed is quarantined in `result` ("not placed").
 */
export function placeIeList(
	result: ParseResult,
	locator: IeLocator,
	points: ReadonlyMap<string, { town: string | null; county: string | null }>,
): IePlacedList {
	const placed: IePlacedList["placed"] = {};
	const rows: LocatedIeFacility[] = [];
	for (const row of result.rows) {
		const location =
			row.latitude !== null && row.longitude !== null
				? locator.placeByPoint(row, points.get(row.nationalId) ?? { town: null, county: null })
				: locator.placeByName(row);
		const by = location?.by ?? "unplaced";
		placed[by] = (placed[by] ?? 0) + 1;
		if (!location) {
			result.quarantined.push({ lineNo: row.lineNo, reason: "not placed", sample: row.nationalId });
			continue;
		}
		rows.push({ ...row, location });
	}
	return { source: result.source, rows, placed };
}

export type IeCombineStats = {
	/** HSE hospitals that are a HIQA centre (not imported), and a few of their keys. */
	hseDuplicatesOfHiqa: number;
	duplicateExamples: { key: string; hiqa: string; by: "eircode" | "name"; name: string }[];
	/** HSE care hospitals not read because HIQA's register is not in the run. */
	hseHeldBack: number;
};

export type IeCombined = {
	facilities: LocatedIeFacility[];
	/** HSE rows not imported this run whose pages are kept as they are (no HIQA register). */
	spared: { idScheme: string; nationalId: string }[];
	stats: IeCombineStats;
};

/** The placed lists as one set of pages: the HSE hospitals that are a HIQA centre are dropped. */
export function combineIeLists(lists: readonly IePlacedList[], locator: IeLocator): IeCombined {
	const stats: IeCombineStats = { hseDuplicatesOfHiqa: 0, duplicateExamples: [], hseHeldBack: 0 };
	const located = lists.flatMap((list) => list.rows);
	const countyOf = (row: LocatedIeFacility) =>
		row.location.kind === "commune" ? locator.countyOf(row.location.code) : row.location.code;
	const hiqa = located.filter((row) => row.source === "hiqa");
	const hasHiqa = lists.some((list) => list.source === "hiqa");
	const byEircode = new Map<string, LocatedIeFacility>();
	const byName = new Map<string, LocatedIeFacility | null>();
	for (const row of hiqa) {
		if (row.eircode) byEircode.set(row.eircode, row);
		const county = countyOf(row) ?? row.countyCode ?? "";
		for (const name of row.matchNames) {
			const key = `${county}|${name}`;
			// A name two centres of a county share tells nothing.
			byName.set(key, byName.has(key) ? null : row);
		}
	}
	const spared: IeCombined["spared"] = [];
	const facilities = located.filter((row) => {
		if (row.source !== "hse-hospitals" || !IE_HSE_CARE_KINDS.includes(row.kind ?? "")) return true;
		if (!hasHiqa) {
			stats.hseHeldBack++;
			spared.push({ idScheme: row.idScheme, nationalId: row.nationalId });
			return false;
		}
		const county = countyOf(row) ?? row.countyCode ?? "";
		const sameEircode = row.eircode ? byEircode.get(row.eircode) : undefined;
		const sameName = row.matchNames.map((name) => byName.get(`${county}|${name}`)).find(Boolean);
		const centre = sameEircode ?? sameName;
		if (!centre) return true;
		stats.hseDuplicatesOfHiqa++;
		if (stats.duplicateExamples.length < 10) {
			stats.duplicateExamples.push({
				key: row.nationalId,
				hiqa: centre.nationalId,
				by: sameEircode ? "eircode" : "name",
				name: row.name,
			});
		}
		return false;
	});
	return { facilities, spared, stats };
}
