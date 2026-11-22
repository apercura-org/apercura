/** Keyboard moves of the agenda's week grid (pure, tested). */

export interface CellPosition {
	/** Time row, 0 = first row of the day. */
	row: number;
	/** Day column, 0 = first day shown. */
	column: number;
}

export type WeekGridKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Home" | "End";

const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), Math.max(max, 0));

/**
 * The cell the focus moves to. Up and down walk through the day's times, left and right
 * through the days at the same time, Home and End jump to the first and last time of the day.
 * The focus stays put at an edge (Page Up and Page Down change the week instead).
 */
export function moveCell(
	from: CellPosition,
	key: WeekGridKey,
	size: { rows: number; columns: number },
): CellPosition {
	const lastRow = size.rows - 1;
	const lastColumn = size.columns - 1;
	switch (key) {
		case "ArrowUp":
			return { row: clamp(from.row - 1, lastRow), column: from.column };
		case "ArrowDown":
			return { row: clamp(from.row + 1, lastRow), column: from.column };
		case "ArrowLeft":
			return { row: from.row, column: clamp(from.column - 1, lastColumn) };
		case "ArrowRight":
			return { row: from.row, column: clamp(from.column + 1, lastColumn) };
		case "Home":
			return { row: 0, column: from.column };
		case "End":
			return { row: clamp(lastRow, lastRow), column: from.column };
	}
}

/** Index of the time row that contains `minute` (minutes since local midnight). */
export function rowOf(minute: number, startMin: number, stepMin: number): number {
	return Math.floor((minute - startMin) / stepMin);
}

/** Whether `[from, until)` overlaps one of the opening windows (minutes since midnight). */
export function isOpen(
	windows: readonly (readonly [number, number])[],
	from: number,
	until: number,
): boolean {
	return windows.some(([start, end]) => start < until && from < end);
}
