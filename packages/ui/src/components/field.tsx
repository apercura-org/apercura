"use client";

import type { ReactNode } from "react";
import {
	FieldError as RACFieldError,
	type FieldErrorProps as RACFieldErrorProps,
	Form as RACForm,
	type FormProps as RACFormProps,
	Input as RACInput,
	type InputProps as RACInputProps,
	Label as RACLabel,
	type LabelProps as RACLabelProps,
	TextArea as RACTextArea,
	TextField as RACTextField,
	type TextFieldProps as RACTextFieldProps,
	Text,
	type ValidationResult,
} from "react-aria-components";
import { AlertIcon } from "../icons";
import { cn, fieldStyles } from "../recipes";

const styles = fieldStyles();

export function Label({ className, ...props }: RACLabelProps) {
	return <RACLabel {...props} className={styles.label({ className })} />;
}

export function FieldDescription({
	className,
	...props
}: {
	className?: string;
	children: ReactNode;
}) {
	return <Text {...props} slot="description" className={styles.description({ className })} />;
}

/**
 * Field error: ink red plus an error mark and text, never colour alone.
 * Renders nothing while the field is valid.
 */
export function FieldError({ className, children, ...props }: RACFieldErrorProps) {
	return (
		<RACFieldError
			{...props}
			className={(renderProps) =>
				styles.error({
					className: typeof className === "function" ? className(renderProps) : className,
				})
			}
		>
			{(renderProps) => (
				<>
					<AlertIcon className="mt-[0.15em] size-[1.15em] shrink-0" />
					<span>
						{typeof children === "function"
							? children(renderProps)
							: (children ?? renderProps.validationErrors.join(" "))}
					</span>
				</>
			)}
		</RACFieldError>
	);
}

export function Input({ className, ...props }: RACInputProps) {
	return (
		<RACInput
			{...props}
			className={cn(styles.input(), typeof className === "string" ? className : undefined)}
		/>
	);
}

export interface TextFieldProps extends Omit<RACTextFieldProps, "children"> {
	label: ReactNode;
	description?: ReactNode;
	errorMessage?: string | ((validation: ValidationResult) => string);
	placeholder?: string;
	inputClassName?: string;
}

/** Single-line text field: label above, ruled box, hint and error below. */
export function TextField({
	label,
	description,
	errorMessage,
	placeholder,
	inputClassName,
	className,
	...props
}: TextFieldProps) {
	return (
		<RACTextField
			{...props}
			className={styles.root({ className: typeof className === "string" ? className : undefined })}
		>
			<Label>{label}</Label>
			<div className={styles.box()}>
				<Input placeholder={placeholder} className={inputClassName} />
			</div>
			{description ? <FieldDescription>{description}</FieldDescription> : null}
			<FieldError>{errorMessage}</FieldError>
		</RACTextField>
	);
}

export interface TextAreaFieldProps extends Omit<RACTextFieldProps, "children"> {
	label: ReactNode;
	description?: ReactNode;
	errorMessage?: string | ((validation: ValidationResult) => string);
	placeholder?: string;
	/** Visible lines before the box scrolls. */
	rows?: number;
}

/**
 * Multi-line text field, same anatomy as TextField: label above, ruled box,
 * hint and error below. Plain text only; the box grows with `rows`.
 */
export function TextAreaField({
	label,
	description,
	errorMessage,
	placeholder,
	rows = 6,
	className,
	...props
}: TextAreaFieldProps) {
	return (
		<RACTextField
			{...props}
			className={styles.root({ className: typeof className === "string" ? className : undefined })}
		>
			<Label>{label}</Label>
			<div
				className={styles.box({
					className:
						"items-stretch has-[textarea:focus-visible]:outline-3 has-[textarea:focus-visible]:outline-offset-2 has-[textarea:focus-visible]:outline-(--focus-ring)",
				})}
			>
				<RACTextArea
					placeholder={placeholder}
					rows={rows}
					className={cn(styles.input(), "resize-y leading-relaxed")}
				/>
			</div>
			{description ? <FieldDescription>{description}</FieldDescription> : null}
			<FieldError>{errorMessage}</FieldError>
		</RACTextField>
	);
}

/** Form with native-feeling validation: errors are shown after submit and announced. */
export function Form({ className, ...props }: RACFormProps) {
	return (
		<RACForm
			validationBehavior="native"
			{...props}
			className={cn("flex flex-col gap-6", className)}
		/>
	);
}
