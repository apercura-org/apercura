/** A half-open range of UTC milliseconds, `[start, end)`. */
export interface Interval {
	start: number;
	end: number;
}

/**
 * Sorts intervals and merges those that overlap or touch. Empty intervals are dropped.
 * The result is sorted and pairwise disjoint.
 */
export function unionIntervals(intervals: readonly Interval[]): Interval[] {
	const sorted = intervals
		.filter((interval) => interval.end > interval.start)
		.map((interval) => ({ start: interval.start, end: interval.end }))
		.sort((a, b) => a.start - b.start || a.end - b.end);
	const merged: Interval[] = [];
	for (const interval of sorted) {
		const last = merged[merged.length - 1];
		if (last !== undefined && interval.start <= last.end) {
			last.end = Math.max(last.end, interval.end);
		} else {
			merged.push(interval);
		}
	}
	return merged;
}

/**
 * Removes `cuts` from `base`. Both inputs must be sorted and pairwise disjoint (as returned by
 * {@link unionIntervals}); so is the result. Runs in linear time.
 */
export function subtractIntervals(
	base: readonly Interval[],
	cuts: readonly Interval[],
): Interval[] {
	const result: Interval[] = [];
	let cutIndex = 0;
	for (const interval of base) {
		let start = interval.start;
		while (cutIndex < cuts.length && (cuts[cutIndex] as Interval).end <= start) {
			cutIndex += 1;
		}
		let index = cutIndex;
		while (index < cuts.length && (cuts[index] as Interval).start < interval.end) {
			const cut = cuts[index] as Interval;
			if (cut.start > start) {
				result.push({ start, end: cut.start });
			}
			start = Math.max(start, cut.end);
			index += 1;
		}
		if (start < interval.end) {
			result.push({ start, end: interval.end });
		}
	}
	return result;
}
