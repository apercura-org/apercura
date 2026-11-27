"use client";

import "../astryx/styles";
import { TimeInput } from "@astryxdesign/core/TimeInput";
import { Time } from "@internationalized/date";
import { type ReactNode, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useControlDescription } from "../astryx/aria";
import { describedBy, fieldLook } from "../astryx/field-look";
import { AstryxIntl } from "../astryx/intl";
import { markRequired } from "../astryx/native";
import { textOf } from "../astryx/text";
import { FieldDescription, FieldError } from "./field-parts";
import { useFieldValidation } from "./form";

export interface TimeFieldProps {
	label: ReactNode;
	description?: ReactNode;
	errorMessage?: string;
	value?: Time | null;
	defaultValue?: Time;
	onChange?: (value: Time | null) => void;
	/** 24 (default in French) or 12. */
	hourCycle?: 12 | 24;
	isRequired?: boolean;
	isInvalid?: boolean;
	isDisabled?: boolean;
	name?: string;
	className?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (time: Time | null | undefined) =>
	time ? `${pad(time.hour)}:${pad(time.minute)}` : undefined;

function requiredMessage() {
	const probe = document.createElement("input");
	probe.required = true;
	return probe.validationMessage || " ";
}

/** Time typed (hours, minutes), built on Astryx's time input; 24-hour clock in French. */
export function TimeField({
	label,
	description,
	errorMessage,
	value: valueProp,
	defaultValue,
	onChange,
	hourCycle,
	isRequired,
	isInvalid,
	isDisabled,
	name,
	className,
}: TimeFieldProps) {
	const [own, setOwn] = useState<Time | null>(defaultValue ?? null);
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
	const errorId = useId();
	useLayoutEffect(() => markRequired(field.current, "input", isRequired === true));
	const { error } = useFieldValidation({
		element: input,
		name,
		value: iso(value),
		isInvalid,
		errorMessage,
		checkRequired: () => (isRequired && !value ? requiredMessage() : null),
	});
	useControlDescription(
		input,
		error !== null,
		describedBy(description != null && hintId, error !== null && errorId) ?? null,
	);
	return (
		<div
			ref={field}
			className={fieldLook.root(className)}
			data-invalid={error !== null ? "" : undefined}
		>
			<AstryxIntl>
				<TimeInput
					label={textOf(label)}
					value={iso(value) as never}
					onChange={(next) => {
						const [hour, minute] = (next ?? "").split(":").map(Number);
						const time =
							next && hour !== undefined && minute !== undefined ? new Time(hour, minute) : null;
						setOwn(time);
						onChange?.(time);
					}}
					hourFormat={hourCycle === 12 ? "12h" : hourCycle === 24 ? "24h" : undefined}
					presentation="text-input"
					isDisabled={isDisabled}
					containerClassName={fieldLook.container}
					controlClassName={fieldLook.control}
				/>
			</AstryxIntl>
			{name ? <input type="hidden" name={name} value={iso(value) ?? ""} /> : null}
			{description != null ? <FieldDescription id={hintId}>{description}</FieldDescription> : null}
			<FieldError id={errorId}>{error}</FieldError>
		</div>
	);
}
