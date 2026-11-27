"use client";

import "../astryx/styles";
import { DateInput } from "@astryxdesign/core/DateInput";
import { type CalendarDate, parseDate } from "@internationalized/date";
import { type ReactNode, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { localDay } from "../astryx/dates";
import { describedBy, fieldLook } from "../astryx/field-look";
import { AstryxIntl } from "../astryx/intl";
import { markRequired } from "../astryx/native";
import { textOf } from "../astryx/text";
import { FieldDescription, FieldError } from "./field-parts";
import { useFieldValidation } from "./form";

export interface DatePickerProps {
	label: ReactNode;
	description?: ReactNode;
	errorMessage?: string;
	value?: CalendarDate | null;
	defaultValue?: CalendarDate;
	onChange?: (value: CalendarDate | null) => void;
	minValue?: CalendarDate;
	maxValue?: CalendarDate;
	isDateUnavailable?: (date: CalendarDate) => boolean;
	isRequired?: boolean;
	isInvalid?: boolean;
	isDisabled?: boolean;
	name?: string;
	/** Kept for the callers of React Aria's date picker: dates are days. */
	granularity?: "day";
	className?: string;
}

const iso = (date: CalendarDate | null | undefined) => (date ? date.toString() : undefined);

/** The browser's own words for a required field left empty. */
function requiredMessage() {
	const probe = document.createElement("input");
	probe.required = true;
	return probe.validationMessage || " ";
}

/**
 * Date typed, or picked from Astryx's calendar (a popover with a pointer, the system's own
 * picker on a touch screen), built on Astryx's date input. Weeks start on Monday.
 */
export function DatePicker({
	label,
	description,
	errorMessage,
	value: valueProp,
	defaultValue,
	onChange,
	minValue,
	maxValue,
	isDateUnavailable,
	isRequired,
	isInvalid,
	isDisabled,
	name,
	className,
}: DatePickerProps) {
	const [own, setOwn] = useState<CalendarDate | null>(defaultValue ?? null);
	const value = valueProp === undefined ? own : valueProp;
	const field = useRef<HTMLDivElement>(null);
	const input = useMemo(
		() => ({
			get current() {
				return field.current?.querySelector<HTMLInputElement>("input") ?? null;
			},
		}),
		[],
	);
	const hintId = useId();
	useLayoutEffect(() => markRequired(field.current, "input", isRequired === true));
	const { error } = useFieldValidation({
		element: input,
		name,
		value: iso(value),
		isInvalid,
		errorMessage,
		checkRequired: () => (isRequired && !value ? requiredMessage() : null),
	});
	const constraints = useMemo(
		() =>
			isDateUnavailable
				? [(date: Date) => isDateUnavailable(parseDate(localDay(date)))]
				: undefined,
		[isDateUnavailable],
	);
	return (
		<div
			ref={field}
			className={fieldLook.root(className)}
			data-invalid={error !== null ? "" : undefined}
		>
			<AstryxIntl>
				<DateInput
					label={textOf(label)}
					value={iso(value) as never}
					onChange={(next) => {
						const date = next ? parseDate(next) : null;
						setOwn(date);
						onChange?.(date);
					}}
					min={iso(minValue) as never}
					max={iso(maxValue) as never}
					dateConstraints={constraints}
					weekStartsOn="mon"
					format="date"
					presentation="adaptive-native"
					isDisabled={isDisabled}
					status={error !== null ? { type: "error", message: error || undefined } : undefined}
					aria-describedby={describedBy(description != null && hintId)}
					containerClassName={fieldLook.container}
					controlClassName={fieldLook.control}
				/>
			</AstryxIntl>
			{name ? <input type="hidden" name={name} value={iso(value) ?? ""} /> : null}
			{description != null ? <FieldDescription id={hintId}>{description}</FieldDescription> : null}
			<FieldError aria-hidden>{error}</FieldError>
		</div>
	);
}
