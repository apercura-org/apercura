"use client";

import "../astryx/styles";
import { TextInput as AstryxTextInput } from "@astryxdesign/core/TextInput";
import { type ReactNode, useId, useMemo, useRef, useState } from "react";
import { useControlDescription } from "../astryx/aria";
import { describedBy, fieldLook } from "../astryx/field-look";
import { AstryxIntl } from "../astryx/intl";
import { nativeConstraints } from "../astryx/native";
import { textOf } from "../astryx/text";
import { SearchIcon } from "../icons";
import { cn } from "../recipes";
import { FieldDescription, FieldError } from "./field-parts";
import { useFieldValidation } from "./form";

export interface SearchFieldProps {
	label: ReactNode;
	description?: ReactNode;
	errorMessage?: string;
	placeholder?: string;
	/** Accessible label of the clear button. */
	clearLabel: string;
	name?: string;
	value?: string;
	defaultValue?: string;
	onChange?: (value: string) => void;
	/** Enter in the field. */
	onSubmit?: (value: string) => void;
	isRequired?: boolean;
	isInvalid?: boolean;
	isDisabled?: boolean;
	className?: string;
	id?: string;
}

/** Search input, built on Astryx's, with a leading search mark and a clear button once filled. */
export function SearchField({
	label,
	description,
	errorMessage,
	placeholder,
	clearLabel,
	name,
	value: valueProp,
	defaultValue,
	onChange,
	onSubmit,
	isRequired,
	isInvalid,
	isDisabled,
	className,
	id,
}: SearchFieldProps) {
	const [own, setOwn] = useState(defaultValue ?? "");
	const value = valueProp ?? own;
	const input = useRef<HTMLInputElement>(null);
	const hintId = useId();
	const errorId = useId();
	const { error } = useFieldValidation({ element: input, name, value, isInvalid, errorMessage });
	useControlDescription(input, error !== null);
	const extra = useMemo(() => ({ "@astryx.textInput.clearLabel": clearLabel }), [clearLabel]);
	return (
		<div className={fieldLook.root(className)} data-invalid={error !== null ? "" : undefined}>
			<AstryxIntl extra={extra}>
				<AstryxTextInput
					ref={input}
					id={id}
					type="search"
					enterKeyHint="search"
					label={textOf(label)}
					value={value}
					onChange={(next) => {
						setOwn(next);
						onChange?.(next);
					}}
					onEnter={onSubmit ? () => onSubmit(value) : undefined}
					hasClear
					startIcon={<SearchIcon className="ms-3.5 size-5 shrink-0 text-ink-muted" />}
					htmlName={name}
					{...nativeConstraints({ required: isRequired })}
					isDisabled={isDisabled}
					placeholder={placeholder}
					aria-describedby={describedBy(description != null && hintId, error && errorId)}
					containerClassName={fieldLook.container}
					controlClassName={cn(fieldLook.control, "[&_input]:ps-2.5")}
				/>
			</AstryxIntl>
			{description != null ? <FieldDescription id={hintId}>{description}</FieldDescription> : null}
			<FieldError id={errorId}>{error}</FieldError>
		</div>
	);
}
