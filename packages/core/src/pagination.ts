/**
 * The links of a listing's pager, kept pure so its depth bound is unit tested.
 *
 * Pages are grouped by their decimal digits. Besides the previous and next
 * pages, the pager of page `p` (out of `pages`) links to:
 *
 * - `nearby`: every page of `p`'s block of ten (`180` to `189` from `187`;
 *   `1` to `9` in the first block, there is no page 0);
 * - `jumps`: the first and the last page, then for every power of ten `s`
 *   below `pages` (10, 100, 1,000…), the multiples of `s` in `p`'s block of
 *   `10 × s` (`100`, `110`… `190` and `100`, `200` from `187` of 219).
 *
 * Any page `t` is then reached from any page in at most `digits(pages)` clicks
 * (`pagerDepthBound`): the first page (or the page itself) links to `t`
 * rounded down to its highest power of ten, that page to `t` rounded down to
 * the next one, and so on to `t` (`1 → 200 → 210 → 218`). That is 3 clicks
 * for any listing under 1,000 pages (20,000 practitioners), with at most
 * `10 + 9 × (digits − 1) + 2` numbered links.
 */
export type Pager = {
	page: number;
	pages: number;
	previous: number | null;
	next: number | null;
	/** Pages of the current block of ten, the current page included, ascending. */
	nearby: number[];
	/** First and last page and the round pages of the larger blocks, outside `nearby`, ascending. */
	jumps: number[];
};

/** The pager of `page` out of `pages` (both clamped to at least 1). */
export function pager(page: number, pages: number): Pager {
	const total = Math.max(1, Math.floor(pages));
	const current = Math.min(total, Math.max(1, Math.floor(page)));
	const inRange = (value: number) => value >= 1 && value <= total;

	const blockStart = Math.floor(current / 10) * 10;
	const nearby: number[] = [];
	for (let value = blockStart; value < blockStart + 10; value++) {
		if (inRange(value)) nearby.push(value);
	}

	const jumps = new Set<number>([1, total]);
	for (let step = 10; step <= total; step *= 10) {
		const start = Math.floor(current / (step * 10)) * step * 10;
		for (let value = start; value < start + step * 10; value += step) {
			if (inRange(value)) jumps.add(value);
		}
	}
	for (const value of nearby) jumps.delete(value);

	return {
		page: current,
		pages: total,
		previous: current > 1 ? current - 1 : null,
		next: current < total ? current + 1 : null,
		nearby,
		jumps: [...jumps].sort((a, b) => a - b),
	};
}

/** Every page the pager of `page` links to (not the page itself), ascending. */
export function pagerTargets(page: number, pages: number): number[] {
	const { previous, next, nearby, jumps, page: current } = pager(page, pages);
	const targets = new Set([...nearby, ...jumps]);
	if (previous) targets.add(previous);
	if (next) targets.add(next);
	targets.delete(current);
	return [...targets].sort((a, b) => a - b);
}

/** Most clicks between two pages of a `pages`-page listing: its number of decimal digits. */
export function pagerDepthBound(pages: number): number {
	return String(Math.max(1, Math.floor(pages))).length;
}
