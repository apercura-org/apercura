"use client";

import "../astryx/styles";
import { Field } from "@astryxdesign/core/Field";
import { type ReactNode, useId, useRef, useState } from "react";
import { describedBy, fieldLook } from "../astryx/field-look";
import { AstryxIntl } from "../astryx/intl";
import { textOf } from "../astryx/text";
import { cn, fieldStyles } from "../recipes";
import { FieldDescription, FieldError } from "./field-parts";
import { useFieldValidation } from "./form";

const styles = fieldStyles();

export interface OtpFieldProps {
	label: ReactNode;
	description?: ReactNode;
	errorMessage?: string;
	/** Number of digits in the code. */
	length?: number;
	name?: string;
	value?: string;
	defaultValue?: string;
	onChange?: (value: string) => void;
	isRequired?: boolean;
	isInvalid?: boolean;
	isDisabled?: boolean;
	autoFocus?: boolean;
	className?: string;
	id?: string;
}

/**
 * One-time code field, on Astryx's field (label, hint and error wiring). Astryx has no code
 * field: a single real input (so paste, SMS/email autofill and screen readers work) drawn over
 * a comb of printed boxes, one per digit.
 */
export function OtpField({
	label,
	description,
	errorMessage,
	length = 6,
	name,
	value: valueProp,
	defaultValue,
	onChange,
	isRequired,
	isInvalid,
	isDisabled,
	autoFocus,
	className,
	id: idProp,
}: OtpFieldProps) {
	const [own, setOwn] = useState(defaultValue ?? "");
	const value = valueProp ?? own;
	const digits = Array.from({ length }, (_, index) => value[index] ?? "");
	const ownId = useId();
	const id = idProp ?? ownId;
	const hintId = useId();
	const errorId = useId();
	const input = useRef<HTMLInputElement>(null);
	const { error } = useFieldValidation({ element: input, name, value, isInvalid, errorMessage });
	return (
		<div className={cn(styles.root(), className)} data-invalid={error !== null ? "" : undefined}>
			<AstryxIntl>
				<Field
					label={textOf(label)}
					inputID={id}
					isDisabled={isDisabled}
					className={fieldLook.container}
				>
					<div className="group/otp relative w-fit">
						<div aria-hidden="true" className="flex gap-2">
							{digits.map((digit, index) => (
								<span
									// biome-ignore lint/suspicious/noArrayIndexKey: positions are the identity of comb boxes
									key={index}
									className={cn(
										"flex h-14 w-12 items-center justify-center rounded-field border border-field-edge bg-paper font-body text-title font-semibold text-ink tabular",
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
						<input
							ref={input}
							id={id}
							name={name}
							value={value}
							onChange={(event) => {
								const cleaned = event.target.value.replace(/\D/g, "").slice(0, length);
								setOwn(cleaned);
								onChange?.(cleaned);
							}}
							inputMode="numeric"
							autoComplete="one-time-code"
							pattern={`\\d{${length}}`}
							maxLength={length}
							required={isRequired}
							disabled={isDisabled}
							// biome-ignore lint/a11y/noAutofocus: the code step's own field.
							autoFocus={autoFocus}
							aria-invalid={error !== null || undefined}
							aria-describedby={describedBy(description != null && hintId, error && errorId)}
							className="absolute inset-0 h-full w-full cursor-text bg-transparent p-0 text-transparent caret-transparent outline-none selection:bg-transparent"
						/>
					</div>
				</Field>
			</AstryxIntl>
			{description != null ? <FieldDescription id={hintId}>{description}</FieldDescription> : null}
			<FieldError id={errorId}>{error}</FieldError>
		</div>
	);
}
