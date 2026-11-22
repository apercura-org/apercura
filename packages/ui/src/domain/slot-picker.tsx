"use client";

import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon } from "../icons";
import { cn } from "../recipes";
import {
	type GridDay,
	type GridKey,
	type GridSlot,
	isBookable,
	moveFocus,
	nowFraction,
	type Position,
} from "./slot-grid";

export interface Slot extends GridSlot {
	/** Printed time, e.g. "09:30". */
	time: string;
	/**
	 * Printed under the time in caps, e.g. "UTC+2" for the hour that occurs twice when clocks go
	 * back. Must also be part of `accessibleLabel`.
	 */
	detail?: string;
	/**
	 * Why an unavailable slot cannot be stamped when it is not simply taken, e.g. "your current
	 * time" when moving an appointment. Spoken instead of `unavailableLabel`; the slot is printed
	 * on a shaded ground instead of struck through. Pair it with a visible `detail`.
	 */
	unavailableNote?: string;
	/** Full spoken label, e.g. "Tuesday 24 November, 9:30". */
	accessibleLabel: string;
}

export interface SlotDay extends GridDay<Slot> {
	/** Printed day, e.g. "Tue 24 Nov". */
	label: string;
}

export interface SlotPickerProps {
	days: SlotDay[];
	/** Accessible name of the grid, e.g. "Available times". */
	label: string;
	/** Selected slot id (controlled). */
	value?: string | null;
	defaultValue?: string | null;
	onChange?: (slot: Slot) => void;
	/**
	 * Start time of the "now" marker. Defaults to the client clock after mount.
	 * The marker then advances with real time either way.
	 */
	initialNow?: string;
	/** Printed under the marker, e.g. "now". */
	nowLabel: string;
	/** Appended to the label of slots that cannot be booked, e.g. "unavailable". */
	unavailableLabel: string;
	/** Appended to the label of slots whose time has passed, e.g. "past". */
	pastLabel: string;
	/** Spoken when a slot is stamped, e.g. (slot) => `Selected: ${slot.accessibleLabel}`. */
	announceSelection: (slot: Slot) => string;
	/** Shown in a day row without slots. */
	emptyDayLabel: string;
}

const GRID_KEYS = new Set<string>([
	"ArrowLeft",
	"ArrowRight",
	"ArrowUp",
	"ArrowDown",
	"Home",
	"End",
	"PageUp",
	"PageDown",
]);

/**
 * Each day of slots is one unbroken row, like a step sequencer. A ruled "now"
 * marker moves through today's row; past slots close as it passes. Selecting
 * a slot stamps it in violet. Keyboard: arrows move, Home/End jump within a
 * day, Page Up/Down jump to the first/last day, Enter or Space stamps.
 */
export function SlotPicker({
	days,
	label,
	value,
	defaultValue = null,
	onChange,
	initialNow,
	nowLabel,
	unavailableLabel,
	pastLabel,
	announceSelection,
	emptyDayLabel,
}: SlotPickerProps) {
	const [uncontrolled, setUncontrolled] = useState<string | null>(defaultValue);
	const selected = value === undefined ? uncontrolled : value;
	const [announcement, setAnnouncement] = useState("");
	const [now, setNow] = useState<Date | null>(initialNow ? new Date(initialNow) : null);
	const cellRefs = useRef(new Map<string, HTMLDivElement>());

	useEffect(() => {
		const origin = initialNow ? Date.parse(initialNow) : Date.now();
		const mountedAt = Date.now();
		const tick = () => setNow(new Date(origin + (Date.now() - mountedAt)));
		tick();
		const timer = window.setInterval(tick, 30_000);
		return () => window.clearInterval(timer);
	}, [initialNow]);

	const initialFocus = useMemo<Position>(() => {
		for (const [row, day] of days.entries()) {
			const column = day.slots.findIndex((slot) => slot.id === selected);
			if (column >= 0) {
				return { row, column };
			}
		}
		for (const [row, day] of days.entries()) {
			const column = day.slots.findIndex((slot) => isBookable(slot, now));
			if (column >= 0) {
				return { row, column };
			}
		}
		return {
			row: Math.max(
				0,
				days.findIndex((day) => day.slots.length > 0),
			),
			column: 0,
		};
	}, [days, selected, now]);
	const [focus, setFocus] = useState<Position | null>(null);
	const active = focus ?? initialFocus;

	const select = (slot: Slot) => {
		if (!isBookable(slot, now)) {
			return;
		}
		setUncontrolled(slot.id);
		setAnnouncement(announceSelection(slot));
		onChange?.(slot);
	};

	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, slot: Slot) => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			select(slot);
			return;
		}
		if (!GRID_KEYS.has(event.key)) {
			return;
		}
		event.preventDefault();
		const next = moveFocus(days, active, event.key as GridKey);
		setFocus(next);
		const target = days[next.row]?.slots[next.column];
		if (target) {
			const element = cellRefs.current.get(target.id);
			element?.focus();
			element?.scrollIntoView({ block: "nearest", inline: "nearest" });
		}
	};

	return (
		<div className="flex flex-col gap-2">
			<div className="scroll-ps-32 overflow-x-auto border-y border-ink sm:scroll-ps-40">
				{/* biome-ignore lint/a11y/useSemanticElements: ARIA grid pattern (roving focus on cells); flex rows keep each day one unbroken row */}
				<div role="grid" aria-label={label} className="flex w-max min-w-full flex-col">
					{days.map((day, row) => {
						const fraction = now ? nowFraction(day, now) : null;
						// The "now" label sits in a strip of its own under today's cells, on the side
						// of the past slots once there is room for it, so it never covers a cell and
						// stays inside the row near the start of the day.
						const labelBefore = fraction !== null && Math.round(fraction * day.slots.length) >= 2;
						return (
							// biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: ARIA grid pattern (roving focus on cells); flex rows keep each day one unbroken row
							<div
								key={day.date}
								role="row"
								className="flex border-b border-rule-soft last:border-b-0"
							>
								{/* biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: ARIA grid pattern (roving focus on cells); flex rows keep each day one unbroken row */}
								<div
									role="rowheader"
									className="sticky start-0 z-40 flex w-32 shrink-0 items-center border-e border-field-edge bg-paper py-2 pe-3 font-display text-meta font-medium text-ink font-stretch-semi-condensed sm:w-40"
								>
									{day.label}
								</div>
								{day.slots.length === 0 ? (
									// biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: ARIA grid pattern (roving focus on cells); flex rows keep each day one unbroken row
									<div
										role="gridcell"
										className="flex min-h-14 items-center px-4 text-meta text-ink-muted"
									>
										{emptyDayLabel}
									</div>
								) : (
									<div className={cn("relative flex", fraction !== null && "pb-6")}>
										{day.slots.map((slot, column) => {
											const bookable = isBookable(slot, now);
											// Past: was open, time has gone (plain muted). Taken: closed (struck through).
											const isPast = slot.available && !bookable;
											const isNoted = !slot.available && Boolean(slot.unavailableNote);
											const isSelected = slot.id === selected;
											const isActive = active.row === row && active.column === column;
											return (
												// biome-ignore lint/a11y/useSemanticElements: ARIA grid pattern (roving focus on cells); flex rows keep each day one unbroken row
												<div
													key={slot.id}
													ref={(element) => {
														if (element) {
															cellRefs.current.set(slot.id, element);
														} else {
															cellRefs.current.delete(slot.id);
														}
													}}
													role="gridcell"
													tabIndex={isActive ? 0 : -1}
													aria-selected={isSelected}
													aria-disabled={!bookable || undefined}
													aria-label={
														bookable
															? slot.accessibleLabel
															: `${slot.accessibleLabel}, ${isPast ? pastLabel : (slot.unavailableNote ?? unavailableLabel)}`
													}
													onClick={() => {
														setFocus({ row, column });
														select(slot);
													}}
													onKeyDown={(event) => onKeyDown(event, slot)}
													onFocus={() => setFocus({ row, column })}
													className={cn(
														"relative flex h-14 w-20 shrink-0 items-center justify-center gap-1 border-e border-rule-soft text-meta font-semibold tabular outline-none last:border-e-0",
														"focus-visible:z-20 focus-visible:outline-3 focus-visible:outline-solid focus-visible:-outline-offset-3 focus-visible:outline-(--focus-ring)",
														bookable &&
															!isSelected &&
															"cursor-pointer text-ink hover:bg-paper-shade",
														isPast && "cursor-not-allowed font-normal text-ink-muted",
														!slot.available &&
															!isNoted &&
															"cursor-not-allowed text-ink-disabled line-through decoration-1",
														isNoted && "cursor-not-allowed bg-paper-shade text-ink",
														isSelected &&
															"z-10 cursor-pointer bg-stamp text-paper shadow-[inset_0_0_0_3px_var(--color-stamp),inset_0_0_0_4px_var(--color-paper)] motion-safe:animate-stamp",
													)}
												>
													{isSelected ? <CheckIcon className="size-4" strokeWidth={2.5} /> : null}
													{slot.detail ? (
														<span className="flex flex-col items-center leading-tight">
															<span>{slot.time}</span>{" "}
															<span className="caps font-normal">{slot.detail}</span>
														</span>
													) : (
														slot.time
													)}
												</div>
											);
										})}
										{fraction === null ? null : (
											<span
												aria-hidden="true"
												className="pointer-events-none absolute inset-y-0 z-30 w-0.5 -translate-x-1/2 bg-ink transition-[left] duration-700 ease-out"
												style={{ left: `${fraction * 100}%` }}
											>
												<span className="absolute -top-px left-1/2 size-0 -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent border-t-ink" />
												<span
													className={cn(
														"caps absolute bottom-1 whitespace-nowrap bg-paper px-0.5 leading-none text-ink",
														labelBefore ? "right-1.5" : "left-1.5",
													)}
												>
													{nowLabel}
												</span>
											</span>
										)}
									</div>
								)}
							</div>
						);
					})}
				</div>
			</div>
			<div aria-live="polite" aria-atomic="true" className="sr-only">
				{announcement}
			</div>
		</div>
	);
}
