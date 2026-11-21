"use client";

import {
	CalendarCell,
	CalendarGrid,
	CalendarGridBody,
	CalendarGridHeader,
	CalendarHeaderCell,
	type DateValue,
	Heading,
	Button as RACButton,
	Calendar as RACCalendar,
	type CalendarProps as RACCalendarProps,
	Text,
} from "react-aria-components";
import { ChevronLeftIcon, ChevronRightIcon } from "../icons";
import { cn, focusRing } from "../recipes";

export interface CalendarProps<T extends DateValue> extends Omit<RACCalendarProps<T>, "children"> {
	/** Error text shown under the grid when the calendar is invalid. */
	errorMessage?: string;
}

const navButton = cn(
	"flex size-11 cursor-pointer items-center justify-center rounded-field border-[1.5px] border-ink text-ink hover:bg-paper-shade data-disabled:cursor-not-allowed data-disabled:border-ink-disabled data-disabled:text-ink-disabled",
	focusRing,
);

/**
 * Month grid set like a ruled form: caps weekday headers, hairline cells.
 * Selection is ink (it is a choice, not yet a booking); today is underlined.
 */
export function Calendar<T extends DateValue>({
	errorMessage,
	className,
	...props
}: CalendarProps<T>) {
	return (
		<RACCalendar
			{...props}
			className={cn(
				"w-fit max-w-full text-ink",
				typeof className === "string" ? className : undefined,
			)}
		>
			<header className="mb-3 flex items-center justify-between gap-2">
				<RACButton slot="previous" className={navButton}>
					<ChevronLeftIcon className="size-5" />
				</RACButton>
				<Heading className="font-display text-body font-bold capitalize font-stretch-semi-expanded" />
				<RACButton slot="next" className={navButton}>
					<ChevronRightIcon className="size-5" />
				</RACButton>
			</header>
			<CalendarGrid className="border-collapse border-y-2 border-ink" weekdayStyle="short">
				<CalendarGridHeader className="border-b-[1.5px] border-ink">
					{(day) => <CalendarHeaderCell className="caps h-9 text-center">{day}</CalendarHeaderCell>}
				</CalendarGridHeader>
				<CalendarGridBody>
					{(date) => (
						<CalendarCell
							date={date}
							className={cn(
								"m-px flex size-11 cursor-pointer items-center justify-center rounded-field text-body tabular outline-none",
								"hover:bg-paper-shade data-outside-month:hidden",
								"data-today:font-bold data-today:underline data-today:decoration-2 data-today:underline-offset-4",
								"data-selected:bg-ink data-selected:text-paper",
								"data-unavailable:cursor-not-allowed data-unavailable:text-ink-disabled data-unavailable:line-through",
								"data-disabled:cursor-not-allowed data-disabled:text-ink-disabled",
								"data-invalid:data-selected:bg-error",
								"data-focus-visible:outline-3 data-focus-visible:outline-offset-1 data-focus-visible:outline-(--focus-ring)",
							)}
						/>
					)}
				</CalendarGridBody>
			</CalendarGrid>
			{errorMessage ? (
				<Text slot="errorMessage" className="mt-2 block text-meta font-semibold text-error">
					{errorMessage}
				</Text>
			) : null}
		</RACCalendar>
	);
}
