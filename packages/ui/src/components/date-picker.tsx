"use client";

import type { ReactNode } from "react";
import {
	type DateValue,
	Dialog,
	Group,
	Button as RACButton,
	DatePicker as RACDatePicker,
	type DatePickerProps as RACDatePickerProps,
} from "react-aria-components";
import { CalendarIcon } from "../icons";
import { cn, fieldStyles, focusRing } from "../recipes";
import { Calendar } from "./calendar";
import { DateSegments } from "./date-segments";
import { FieldDescription, FieldError, Label } from "./field";
import { Popover } from "./popover";

const styles = fieldStyles();

export interface DatePickerProps<T extends DateValue>
	extends Omit<RACDatePickerProps<T>, "children"> {
	label: ReactNode;
	description?: ReactNode;
	errorMessage?: string;
}

/** Date typed segment by segment, or picked from a month grid. */
export function DatePicker<T extends DateValue>({
	label,
	description,
	errorMessage,
	className,
	...props
}: DatePickerProps<T>) {
	return (
		<RACDatePicker
			{...props}
			className={styles.root({ className: typeof className === "string" ? className : undefined })}
		>
			<Label>{label}</Label>
			<Group
				className={cn(
					styles.box(),
					"w-auto max-w-full data-focus-within:outline-3 data-focus-within:outline-solid data-focus-within:outline-offset-2 data-focus-within:outline-(--focus-ring)",
				)}
			>
				<DateSegments />
				<RACButton
					className={`flex size-11 shrink-0 cursor-pointer items-center justify-center border-s border-field-edge text-ink hover:bg-paper-shade ${focusRing}`}
				>
					<CalendarIcon className="size-5" />
				</RACButton>
			</Group>
			{description ? <FieldDescription>{description}</FieldDescription> : null}
			<FieldError>{errorMessage}</FieldError>
			<Popover placement="bottom start">
				<Dialog className="p-4 outline-none">
					<Calendar />
				</Dialog>
			</Popover>
		</RACDatePicker>
	);
}
