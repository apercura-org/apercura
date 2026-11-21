/** Pure helpers for the slot picker: keyboard moves and the "now" marker position. */

export interface GridSlot {
	id: string;
	/** ISO 8601 start time with offset, e.g. `2026-11-24T09:30:00+01:00`. */
	start: string;
	available: boolean;
}

export interface GridDay<S extends GridSlot = GridSlot> {
	/** ISO date, `YYYY-MM-DD`. */
	date: string;
	slots: S[];
}

export interface Position {
	row: number;
	column: number;
}

export type GridKey =
	| "ArrowLeft"
	| "ArrowRight"
	| "ArrowUp"
	| "ArrowDown"
	| "Home"
	| "End"
	| "PageUp"
	| "PageDown";

/** Next focus position for a key press, clamped to the grid. Up/down keep the same time column when possible. */
export function moveFocus(days: GridDay[], from: Position, key: GridKey): Position {
	const rowCount = days.length;
	const columnsIn = (row: number) => days[row]?.slots.length ?? 0;
	const clampColumn = (row: number, column: number) =>
		Math.max(0, Math.min(column, columnsIn(row) - 1));
	const nearestRow = (start: number, step: 1 | -1) => {
		for (let row = start; row >= 0 && row < rowCount; row += step) {
			if (columnsIn(row) > 0) {
				return row;
			}
		}
		return from.row;
	};

	switch (key) {
		case "ArrowLeft":
			return { row: from.row, column: clampColumn(from.row, from.column - 1) };
		case "ArrowRight":
			return { row: from.row, column: clampColumn(from.row, from.column + 1) };
		case "Home":
			return { row: from.row, column: 0 };
		case "End":
			return { row: from.row, column: clampColumn(from.row, Number.POSITIVE_INFINITY) };
		case "ArrowUp": {
			const row = nearestRow(from.row - 1, -1);
			return { row, column: clampColumn(row, from.column) };
		}
		case "ArrowDown": {
			const row = nearestRow(from.row + 1, 1);
			return { row, column: clampColumn(row, from.column) };
		}
		case "PageUp": {
			const row = nearestRow(0, 1);
			return { row, column: clampColumn(row, from.column) };
		}
		case "PageDown": {
			const row = nearestRow(rowCount - 1, -1);
			return { row, column: clampColumn(row, from.column) };
		}
	}
}

/**
 * Where the "now" marker sits in a day's row, as a fraction of the row (0 to 1),
 * or `null` when `now` is not within that day's slots. Each slot owns an equal
 * share of the row, so the marker moves through a slot as its time passes.
 */
export function nowFraction(day: GridDay, now: Date): number | null {
	const starts = day.slots.map((slot) => Date.parse(slot.start));
	const first = starts[0];
	if (first === undefined || starts.some(Number.isNaN)) {
		return null;
	}
	const last = starts[starts.length - 1] ?? first;
	const step = starts.length > 1 ? (last - first) / (starts.length - 1) : 15 * 60_000;
	const end = first + step * starts.length;
	const time = now.getTime();
	if (time < first || time > end) {
		return null;
	}
	return (time - first) / (end - first);
}

/** A slot can be stamped only while it is open and still in the future. */
export function isBookable(slot: GridSlot, now: Date | null): boolean {
	return slot.available && (now === null || Date.parse(slot.start) > now.getTime());
}
