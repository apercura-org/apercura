"use client";

import { type ReactNode, useState } from "react";
import {
	TextField as RACTextField,
	type TextFieldProps as RACTextFieldProps,
} from "react-aria-components";
import { cn, fieldStyles } from "../recipes";
import { FieldDescription, FieldError, Input, Label } from "./field";

const styles = fieldStyles();

export interface OtpFieldProps extends Omit<RACTextFieldProps, "children" | "type" | "inputMode"> {
	label: ReactNode;
	description?: ReactNode;
	errorMessage?: string;
	/** Number of digits in the code. */
	length?: number;
}

/**
 * One-time code field. A single real input (so paste, SMS/email autofill and
 * screen readers work) drawn over a comb of printed boxes, one per digit.
 */
export function OtpField({
	label,
	description,
	errorMessage,
	length = 6,
	value: controlledValue,
	defaultValue,
	onChange,
	className,
	...props
}: OtpFieldProps) {
	const [uncontrolled, setUncontrolled] = useState(defaultValue ?? "");
	const value = controlledValue ?? uncontrolled;
	const digits = Array.from({ length }, (_, index) => value[index] ?? "");

	return (
		<RACTextField
			{...props}
			value={value}
			onChange={(next) => {
				const cleaned = next.replace(/\D/g, "").slice(0, length);
				setUncontrolled(cleaned);
				onChange?.(cleaned);
			}}
			inputMode="numeric"
			autoComplete="one-time-code"
			pattern={`\\d{${length}}`}
			maxLength={length}
			className={styles.root({ className: typeof className === "string" ? className : undefined })}
		>
			<Label>{label}</Label>
			<div className="group/otp relative w-fit">
				<div aria-hidden="true" className="flex gap-2">
					{digits.map((digit, index) => (
						<span
							// biome-ignore lint/suspicious/noArrayIndexKey: positions are the identity of comb boxes
							key={index}
							className={cn(
								"flex h-14 w-12 items-center justify-center rounded-field border-[1.5px] border-field-edge bg-paper font-body text-title font-bold text-ink tabular",
								"group-has-[input:focus-visible]/otp:border-ink",
								index === Math.min(value.length, length - 1) &&
									"group-has-[input:focus-visible]/otp:border-[3px] group-has-[input:focus-visible]/otp:border-(--focus-ring)",
								"group-data-invalid/field:border-2 group-data-invalid/field:border-error",
							)}
						>
							{digit}
						</span>
					))}
				</div>
				<Input className="absolute inset-0 h-full w-full cursor-text bg-transparent p-0 text-transparent caret-transparent outline-none selection:bg-transparent" />
			</div>
			{description ? <FieldDescription>{description}</FieldDescription> : null}
			<FieldError>{errorMessage}</FieldError>
		</RACTextField>
	);
}
