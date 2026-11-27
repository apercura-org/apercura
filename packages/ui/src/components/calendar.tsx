"use client";

import "../astryx/styles";
import { Calendar as AstryxCalendar } from "@astryxdesign/core/Calendar";
import { type CalendarDate, parseDate } from "@internationalized/date";
import { useMemo } from "react";
import { localDay } from "../astryx/dates";
import { AstryxIntl } from "../astryx/intl";
import { cn } from "../recipes";

export interface CalendarProps {
	value?: CalendarDate | null;
	defaultValue?: CalendarDate;
	onChange?: (value: CalendarDate) => void;
	minValue?: CalendarDate;
	maxValue?: CalendarDate;
	isDateUnavailable?: (date: CalendarDate) => boolean;
	/** Error text shown under the grid when the calendar is invalid. */
	errorMessage?: string;
	"aria-label"?: string;
	className?: string;
}

/**
 * Month grid, built on Astryx's calendar (a grid of days, arrow keys by day and week, Page Up
 * and Down by month). Weeks start on Monday. Selection is ink: it is a choice, not a booking.
 */
export function Calendar({
	value,
	defaultValue,
	onChange,
	minValue,
	maxValue,
	isDateUnavailable,
	errorMessage,
	"aria-label": ariaLabel,
	className,
}: CalendarProps) {
	const constraints = useMemo(
		() =>
			isDateUnavailable
				? [(date: Date) => isDateUnavailable(parseDate(localDay(date)))]
				: undefined,
		[isDateUnavailable],
	);
	return (
		<AstryxIntl>
			{/* biome-ignore lint/a11y/useSemanticElements: names the month grid, not a part of a form. */}
			<div
				className={cn("w-fit max-w-full text-ink", className)}
				aria-label={ariaLabel}
				role="group"
			>
				<AstryxCalendar
					value={
						value === undefined ? undefined : value === null ? null : (value.toString() as never)
					}
					defaultValue={defaultValue ? (defaultValue.toString() as never) : undefined}
					onChange={(next: unknown) => {
						if (typeof next === "string") onChange?.(parseDate(next));
					}}
					min={minValue ? (minValue.toString() as never) : undefined}
					max={maxValue ? (maxValue.toString() as never) : undefined}
					dateConstraints={constraints}
					weekStartsOn="mon"
				/>
				{errorMessage ? (
					<p className="mt-2 block text-meta font-semibold text-error">{errorMessage}</p>
				) : null}
			</div>
		</AstryxIntl>
	);
}
