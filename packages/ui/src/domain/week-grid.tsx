"use client";

import {
	type CSSProperties,
	type KeyboardEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { cn } from "../recipes";
import { type CellPosition, isOpen, moveCell, rowOf, type WeekGridKey } from "./week-grid-nav";

export type WeekGridTone = "booked" | "pending" | "block" | "held" | "done" | "absent";

export interface WeekGridEntry {
	id: string;
	/** Index of the day in `days`. */
	day: number;
	/** Minutes since local midnight. */
	startMin: number;
	endMin: number;
	tone: WeekGridTone;
	/** First printed line, e.g. "09:00 Consultation". */
	title: string;
	/** Second line, e.g. the patient's name or "Pending". */
	detail?: string;
	/**
	 * Spoken details read after the printed title and detail, e.g. "Monday 23 November, 09:00 to
	 * 09:15, confirmed".
	 */
	accessibleLabel: string;
}

export interface WeekGridDay {
	/** Stable key, e.g. "2026-11-23". */
	key: string;
	/** Printed header, e.g. "Mon 23". */
	label: string;
	/** Spoken day, e.g. "Monday 23 November". */
	accessibleLabel: string;
	isToday?: boolean;
	/** Opening windows of the day, minutes since midnight (shaded outside). */
	open: readonly (readonly [number, number])[];
}

export interface WeekGridProps {
	days: readonly WeekGridDay[];
	entries: readonly WeekGridEntry[];
	/** First and last minute shown (e.g. 07:00 to 20:00) and the row step (e.g. 30). */
	startMin: number;
	endMin: number;
	stepMin: number;
	/** Accessible name of the grid, e.g. "Week of 23 November". */
	label: string;
	/** Printed time of a row, e.g. (540) => "09:00". */
	formatTime: (minute: number) => string;
	/** Spoken label of a free cell, e.g. "Monday 23 November, 09:30, free". */
	freeLabel: (day: WeekGridDay, minute: number, open: boolean) => string;
	/** Header of the time column (visually hidden). */
	timeColumnLabel: string;
	/** Enter, Space or a click on a free cell. */
	onCellAction: (day: number, minute: number) => void;
	/** Enter, Space or a click on an entry. */
	onEntryAction: (entryId: string) => void;
	/** Page Up and Page Down. */
	onPageChange?: (direction: -1 | 1) => void;
	/** Where the "now" rule stands, when today is shown. */
	now?: { day: number; minute: number } | null;
	nowLabel: string;
}

const KEYS = new Set<string>(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"]);

const TONES: Record<WeekGridTone, string> = {
	// The Stamp Law: a booked slot is violet.
	booked:
		"bg-stamp text-paper shadow-[inset_0_0_0_2px_var(--color-stamp),inset_0_0_0_3px_var(--color-paper)]",
	done: "border border-ink bg-paper text-ink",
	// Not yet a booking: a dashed form box in ink.
	pending: "border-[1.5px] border-dashed border-ink bg-paper text-ink",
	held: "border border-dashed border-field-edge bg-paper-shade text-ink",
	// Printed solid in ink.
	block: "bg-ink text-paper",
	absent: "border border-ink bg-paper-shade text-ink line-through decoration-1",
};

/** Lines of 0.875 rem text (leading 1.25) that fit in `rows` rows, split between title and detail. */
function linesFor(rows: number, hasDetail: boolean): { title: number; detail: number } {
	// Row height 44 px, minus the slip's 3 px inset and 4 px padding; a line is 17.5 px.
	const total = Math.max(1, Math.floor((rows * 44 - 7) / 17.5));
	if (!hasDetail) return { title: Math.min(total, 3), detail: 0 };
	if (total < 2) return { title: 1, detail: 0 };
	const title = total >= 4 ? 2 : 1;
	return { title, detail: total - title };
}

/** Multi-line clamp for entries that cover several rows; one line stays `truncate`. */
function clampTo(lines: number): CSSProperties | undefined {
	return lines > 1
		? {
				display: "-webkit-box",
				WebkitBoxOrient: "vertical",
				WebkitLineClamp: lines,
				overflow: "hidden",
			}
		: undefined;
}

/** Height of one time row (the 44 px target). */
const ROW_REM = 2.75;

/**
 * The practice's week, set like a timetable: one column per day, one ruled row per step, the
 * opening hours on white and the rest on Paper Shade. Entries are printed over the cells they
 * cover: booked appointments stamped violet, requests in a dashed box, blocks solid ink, holds
 * (someone is booking) dashed and muted. A ruled "now" marker crosses today's column.
 *
 * Keyboard (ARIA grid, roving focus): arrows move by time and by day, Home and End jump to
 * the first and last time, Page Up and Page Down change the week, Enter or Space opens the
 * entry or adds one in a free cell.
 */
export function WeekGrid({
	days,
	entries,
	startMin,
	endMin,
	stepMin,
	label,
	formatTime,
	freeLabel,
	timeColumnLabel,
	onCellAction,
	onEntryAction,
	onPageChange,
	now,
	nowLabel,
}: WeekGridProps) {
	const rows = Math.max(1, Math.ceil((endMin - startMin) / stepMin));
	const cellRefs = useRef(new Map<string, HTMLDivElement>());
	const [focus, setFocus] = useState<CellPosition | null>(null);

	const covered = useMemo(() => {
		const map = new Map<string, WeekGridEntry>();
		for (const entry of entries) {
			const first = Math.max(0, rowOf(entry.startMin, startMin, stepMin));
			const last = Math.min(
				rows - 1,
				rowOf(Math.max(entry.endMin - 1, entry.startMin), startMin, stepMin),
			);
			for (let row = first; row <= last; row += 1) {
				const key = `${entry.day}:${row}`;
				if (!map.has(key)) map.set(key, entry);
			}
		}
		return map;
	}, [entries, rows, startMin, stepMin]);

	const initial = useMemo<CellPosition>(() => {
		if (now && now.minute >= startMin && now.minute < endMin) {
			return { row: rowOf(now.minute, startMin, stepMin), column: now.day };
		}
		const today = days.findIndex((day) => day.isToday);
		return { row: 0, column: Math.max(0, today) };
	}, [now, days, startMin, endMin, stepMin]);
	const active = focus && focus.row < rows && focus.column < days.length ? focus : initial;

	// After Page Up / Page Down the days change under the focus: keep it on the same cell.
	const keepFocus = useRef(false);
	const daysKey = days.map((day) => day.key).join(",");
	useEffect(() => {
		if (!keepFocus.current || !daysKey) return;
		keepFocus.current = false;
		cellRefs.current.get(`${active.column}:${active.row}`)?.focus();
	}, [daysKey, active.column, active.row]);

	// Opening a week that holds "now": scroll the timetable to it (once per week shown).
	const scroller = useRef<HTMLDivElement>(null);
	const scrolledFor = useRef<string | null>(null);
	const nowRow =
		now && now.minute >= startMin && now.minute < endMin
			? rowOf(now.minute, startMin, stepMin)
			: null;
	useEffect(() => {
		if (nowRow === null || !scroller.current || scrolledFor.current === daysKey) return;
		scrolledFor.current = daysKey;
		scroller.current.scrollTop = Math.max(0, (nowRow - 2) * 44);
	}, [daysKey, nowRow]);

	const move = (next: CellPosition) => {
		setFocus(next);
		const element = cellRefs.current.get(`${next.column}:${next.row}`);
		element?.focus();
		element?.scrollIntoView({ block: "nearest", inline: "nearest" });
	};

	const act = (column: number, row: number) => {
		const entry = covered.get(`${column}:${row}`);
		if (entry) {
			onEntryAction(entry.id);
		} else {
			onCellAction(column, startMin + row * stepMin);
		}
	};

	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, column: number, row: number) => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			act(column, row);
			return;
		}
		if (event.key === "PageUp" || event.key === "PageDown") {
			if (onPageChange) {
				event.preventDefault();
				keepFocus.current = true;
				setFocus({ row, column });
				onPageChange(event.key === "PageUp" ? -1 : 1);
			}
			return;
		}
		if (!KEYS.has(event.key)) {
			return;
		}
		event.preventDefault();
		move(moveCell({ row, column }, event.key as WeekGridKey, { rows, columns: days.length }));
	};

	const template: CSSProperties = {
		gridTemplateColumns: `6.5rem repeat(${days.length}, minmax(${days.length > 1 ? "7.5rem" : "0"}, 1fr))`,
	};

	return (
		<div ref={scroller} className="max-h-[70vh] overflow-auto border-y border-ink">
			{/* biome-ignore lint/a11y/useSemanticElements: ARIA grid pattern (roving focus on cells); a table cannot hold the entries printed across rows */}
			<div role="grid" aria-label={label} className="min-w-full w-max sm:w-full">
				{/* biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: ARIA grid pattern */}
				<div
					role="row"
					style={template}
					className="sticky top-0 z-30 grid border-b border-ink bg-paper"
				>
					{/* biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: ARIA grid pattern */}
					<div role="columnheader" className="sticky start-0 bg-paper">
						<span className="sr-only">{timeColumnLabel}</span>
					</div>
					{days.map((day, index) => (
						// biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: ARIA grid pattern
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: columns are positions; keeping their nodes keeps the focus across weeks
							key={index}
							role="columnheader"
							aria-label={day.accessibleLabel}
							className={cn(
								"caps flex min-h-11 items-center justify-center border-s border-rule-soft px-2 text-ink",
								day.isToday && "bg-ink text-paper",
							)}
						>
							{day.label}
						</div>
					))}
				</div>
				{Array.from({ length: rows }, (_, row) => {
					const minute = startMin + row * stepMin;
					const onHour = minute % 60 === 0;
					return (
						// biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: ARIA grid pattern
						<div
							key={minute}
							role="row"
							style={template}
							className={cn(
								"grid",
								onHour ? "border-t border-rule-soft" : "border-t border-dotted border-rule-soft",
							)}
						>
							{/* biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: ARIA grid pattern */}
							<div
								role="rowheader"
								className="sticky start-0 z-20 flex items-start justify-end bg-paper pe-2 pt-0.5 text-meta text-ink-muted tabular"
							>
								<span
									className={
										!onHour
											? "sr-only"
											: // The "now" label takes the hour's place when they would overlap.
												nowRow === row && now && (now.minute - minute) / stepMin < 0.6
												? "font-semibold text-transparent"
												: "font-semibold text-ink"
									}
								>
									{formatTime(minute)}
								</span>
								{nowRow === row && now ? (
									// The "now" label has a strip of its own, the time column, at the height of the
									// rule that crosses today's column: it never covers a cell.
									<span
										aria-hidden="true"
										className="pointer-events-none absolute inset-x-0 z-10 flex items-center justify-end gap-1 pe-0"
										style={{
											top: `calc(${((now.minute - minute) / stepMin) * ROW_REM}rem - 0.5rem)`,
										}}
									>
										<span className="caps bg-paper px-0.5 leading-none text-ink">{nowLabel}</span>
										<span className="h-0.5 w-2 bg-ink" />
									</span>
								) : null}
							</div>
							{days.map((day, column) => {
								const entry = covered.get(`${column}:${row}`);
								const starts =
									entry !== undefined &&
									(rowOf(entry.startMin, startMin, stepMin) === row ||
										(row === 0 && entry.startMin < startMin));
								const open = isOpen(day.open, minute, minute + stepMin);
								const isActive = active.row === row && active.column === column;
								const offset = starts && entry ? Math.max(0, entry.startMin - minute) / stepMin : 0;
								const span =
									starts && entry
										? (Math.min(entry.endMin, endMin) - Math.max(entry.startMin, minute)) / stepMin
										: 0;
								const lines = linesFor(Math.max(span, 1), Boolean(entry?.detail));
								const showNow =
									now &&
									now.day === column &&
									now.minute >= minute &&
									now.minute < minute + stepMin;
								return (
									// biome-ignore lint/a11y/useSemanticElements: ARIA grid pattern (roving focus on cells)
									<div
										// biome-ignore lint/suspicious/noArrayIndexKey: columns are positions; keeping their nodes keeps the focus across weeks
										key={column}
										ref={(element) => {
											const key = `${column}:${row}`;
											if (element) cellRefs.current.set(key, element);
											else cellRefs.current.delete(key);
										}}
										role="gridcell"
										tabIndex={isActive ? 0 : -1}
										aria-label={
											entry
												? // Starts with the printed text (WCAG 2.5.3), then the spoken details.
													`${[entry.title, entry.detail].filter(Boolean).join(" ")}, ${entry.accessibleLabel}`
												: freeLabel(day, minute, open)
										}
										onClick={() => {
											setFocus({ row, column });
											act(column, row);
										}}
										onKeyDown={(event) => onKeyDown(event, column, row)}
										onFocus={() => setFocus({ row, column })}
										className={cn(
											"relative h-11 cursor-pointer border-s border-rule-soft outline-none",
											open
												? "bg-paper hover:bg-paper-shade"
												: "bg-paper-shade hover:bg-rule-soft/40",
											"focus-visible:z-20 focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-(--focus-ring)",
										)}
									>
										{starts && entry ? (
											<div
												aria-hidden="true"
												className={cn(
													"absolute inset-x-0.5 z-10 flex flex-col overflow-hidden rounded-field px-1.5 py-0.5 text-start",
													TONES[entry.tone],
												)}
												style={{
													top: `calc(${offset * ROW_REM}rem + 1px)`,
													// At least one row: a short entry stays readable.
													height: `calc(${Math.max(span, 1) * ROW_REM}rem - 3px)`,
												}}
											>
												<span
													className={cn(
														"text-[0.875rem] leading-tight font-semibold tabular",
														lines.title === 1 && "truncate",
													)}
													style={clampTo(lines.title)}
												>
													{entry.title}
												</span>
												{entry.detail && lines.detail > 0 ? (
													<span
														className={cn(
															"text-[0.875rem] leading-tight",
															lines.detail === 1 && "truncate",
														)}
														style={clampTo(lines.detail)}
													>
														{/* Leading space: the two lines read as words, as in the label. */}{" "}
														{entry.detail}
													</span>
												) : null}
											</div>
										) : null}
										{showNow && now ? (
											<span
												aria-hidden="true"
												className="pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-ink"
												style={{ top: `${((now.minute - minute) / stepMin) * ROW_REM}rem` }}
											/>
										) : null}
									</div>
								);
							})}
						</div>
					);
				})}
			</div>
		</div>
	);
}
