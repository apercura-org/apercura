"use client";

import "../astryx/styles";
import { TextArea as AstryxTextArea } from "@astryxdesign/core/TextArea";
import { TextInput as AstryxTextInput } from "@astryxdesign/core/TextInput";
import { type FocusEvent, type ReactNode, useId, useLayoutEffect, useRef, useState } from "react";
import { useControlDescription } from "../astryx/aria";
import { describedBy, fieldLook } from "../astryx/field-look";
import { AstryxIntl } from "../astryx/intl";
import { nativeConstraints } from "../astryx/native";
import { textOf } from "../astryx/text";
import { useMergedRef } from "../astryx/use-merged-ref";
import { FieldDescription, FieldError } from "./field-parts";
import { useFieldValidation, type ValidationResult } from "./form";

/** What every text-like field takes, as React Aria's `TextField` did. */
interface TextLikeProps {
	/** Visible label, the field's accessible name. */
	label: ReactNode;
	/** Hint printed under the box. */
	description?: ReactNode;
	/** Shown when the field is invalid; a function gets the browser's checks. */
	errorMessage?: string | ((validation: ValidationResult) => string);
	placeholder?: string;
	className?: string;
	id?: string;
	/** Submitted with the form under this name. */
	name?: string;
	/** Controlled value; leave it out for a field whose value lives in the form. */
	value?: string;
	defaultValue?: string;
	onChange?: (value: string) => void;
	onFocus?: (event: FocusEvent<HTMLElement>) => void;
	onBlur?: (event: FocusEvent<HTMLElement>) => void;
	isRequired?: boolean;
	isInvalid?: boolean;
	isDisabled?: boolean;
	isReadOnly?: boolean;
	autoFocus?: boolean;
	autoComplete?: string;
	maxLength?: number;
	minLength?: number;
	validate?: (value: string) => string | string[] | true | null | undefined;
	"aria-label"?: string;
	"aria-describedby"?: string;
}

export interface TextFieldProps extends TextLikeProps {
	type?: "text" | "email" | "password" | "tel" | "url" | "search";
	inputMode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search";
	pattern?: string;
	/** Classes for the input itself (tabular figures). */
	inputClassName?: string;
	ref?: React.Ref<HTMLInputElement>;
}

function useTextValue(value: string | undefined, defaultValue: string | undefined) {
	const [own, setOwn] = useState(defaultValue ?? "");
	return [value ?? own, setOwn] as const;
}

/** Single-line text field, built on Astryx's: label above, ruled box, hint and error below. */
export function TextField({
	label,
	description,
	errorMessage,
	placeholder,
	className,
	inputClassName,
	id,
	name,
	value: valueProp,
	defaultValue,
	onChange,
	isRequired,
	isInvalid,
	isDisabled,
	isReadOnly,
	autoFocus,
	validate,
	type = "text",
	inputMode,
	"aria-label": ariaLabel,
	"aria-describedby": ariaDescribedBy,
	ref,
	...native
}: TextFieldProps) {
	const [value, setValue] = useTextValue(valueProp, defaultValue);
	const input = useRef<HTMLInputElement>(null);
	const hintId = useId();
	const errorId = useId();
	// Astryx styles its input itself: classes of the caller's (tabular figures) are added to it.
	useLayoutEffect(() => {
		if (inputClassName)
			input.current?.classList.add(...inputClassName.split(/\s+/).filter(Boolean));
	});
	const { error } = useFieldValidation({
		element: input,
		name,
		value,
		isInvalid,
		errorMessage,
		validate,
	});
	useControlDescription(input, error !== null);
	return (
		<div className={fieldLook.root(className)} data-invalid={error !== null ? "" : undefined}>
			<AstryxIntl>
				<AstryxTextInput
					{...native}
					ref={useMergedRef(ref, input)}
					id={id}
					label={ariaLabel ?? textOf(label)}
					type={type}
					inputMode={inputMode}
					value={value}
					onChange={(next) => {
						setValue(next);
						onChange?.(next);
					}}
					htmlName={name}
					{...nativeConstraints({ required: isRequired })}
					isDisabled={isDisabled}
					isReadOnly={isReadOnly}
					hasAutoFocus={autoFocus}
					placeholder={placeholder}
					aria-describedby={describedBy(
						ariaDescribedBy,
						description != null && hintId,
						error && errorId,
					)}
					containerClassName={fieldLook.container}
					controlClassName={fieldLook.control}
				/>
			</AstryxIntl>
			{description != null ? <FieldDescription id={hintId}>{description}</FieldDescription> : null}
			<FieldError id={errorId}>{error}</FieldError>
		</div>
	);
}

export interface TextAreaFieldProps extends TextLikeProps {
	/** Visible lines before the box scrolls. */
	rows?: number;
	ref?: React.Ref<HTMLTextAreaElement>;
}

/**
 * Multi-line text field, built on Astryx's, same anatomy as TextField: label above, ruled box,
 * hint and error below. Plain text only; the box grows with `rows`.
 */
export function TextAreaField({
	label,
	description,
	errorMessage,
	placeholder,
	className,
	id,
	name,
	value: valueProp,
	defaultValue,
	onChange,
	isRequired,
	isInvalid,
	isDisabled,
	isReadOnly,
	autoFocus,
	validate,
	rows = 6,
	maxLength,
	"aria-label": ariaLabel,
	"aria-describedby": ariaDescribedBy,
	ref,
	...native
}: TextAreaFieldProps) {
	const [value, setValue] = useTextValue(valueProp, defaultValue);
	const area = useRef<HTMLTextAreaElement>(null);
	const hintId = useId();
	const errorId = useId();
	const { error } = useFieldValidation({
		element: area,
		name,
		value,
		isInvalid,
		errorMessage,
		validate,
	});
	useControlDescription(area, error !== null);
	return (
		<div className={fieldLook.root(className)} data-invalid={error !== null ? "" : undefined}>
			<AstryxIntl>
				<AstryxTextArea
					{...native}
					ref={useMergedRef(ref, area)}
					id={id}
					label={ariaLabel ?? textOf(label)}
					rows={rows}
					value={value}
					onChange={(next) => {
						setValue(next);
						onChange?.(next);
					}}
					htmlName={name}
					htmlMaxLength={maxLength}
					{...nativeConstraints({ required: isRequired })}
					isDisabled={isDisabled}
					isReadOnly={isReadOnly}
					hasAutoFocus={autoFocus}
					placeholder={placeholder}
					aria-describedby={describedBy(
						ariaDescribedBy,
						description != null && hintId,
						error && errorId,
					)}
					containerClassName={fieldLook.container}
					controlClassName={fieldLook.control}
				/>
			</AstryxIntl>
			{description != null ? <FieldDescription id={hintId}>{description}</FieldDescription> : null}
			<FieldError id={errorId}>{error}</FieldError>
		</div>
	);
}
