"use client";

import "../astryx/styles";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { type ReactNode, useId, useRef, useState } from "react";
import { useControlDescription } from "../astryx/aria";
import { fieldLook } from "../astryx/field-look";
import { AstryxIntl } from "../astryx/intl";
import { nativeConstraints } from "../astryx/native";
import { textOf } from "../astryx/text";
import { cn } from "../recipes";
import { FieldError } from "./field-parts";
import { useFieldValidation } from "./form";

export interface CheckboxProps {
	/** The label, read as the box's name. */
	children: ReactNode;
	isSelected?: boolean;
	defaultSelected?: boolean;
	onChange?: (isSelected: boolean) => void;
	isIndeterminate?: boolean;
	isRequired?: boolean;
	isDisabled?: boolean;
	isReadOnly?: boolean;
	isInvalid?: boolean;
	errorMessage?: string;
	/** Submitted as `name=on` when ticked. */
	name?: string;
	className?: string;
	id?: string;
}

/** Checkbox, built on Astryx's: a printed square ticked in ink (the Apercura theme). */
export function Checkbox({
	children,
	isSelected,
	defaultSelected = false,
	onChange,
	isIndeterminate,
	isRequired,
	isDisabled,
	isReadOnly,
	isInvalid,
	errorMessage,
	name,
	className,
	id,
}: CheckboxProps) {
	const [own, setOwn] = useState(defaultSelected);
	const checked = isSelected ?? own;
	const input = useRef<HTMLInputElement>(null);
	const errorId = useId();
	const { error } = useFieldValidation({
		element: input,
		name,
		value: checked,
		isInvalid,
		errorMessage,
	});
	useControlDescription(input, error !== null);
	return (
		<div
			className={cn("group/field flex flex-col gap-1.5", className)}
			data-invalid={error !== null ? "" : undefined}
		>
			<AstryxIntl>
				<CheckboxInput
					ref={input}
					id={id}
					label={textOf(children)}
					value={isIndeterminate ? "indeterminate" : checked}
					onChange={(next) => {
						setOwn(next);
						onChange?.(next);
					}}
					htmlName={name}
					aria-describedby={error ? errorId : undefined}
					{...nativeConstraints({ required: isRequired })}
					isDisabled={isDisabled}
					isReadOnly={isReadOnly}
					className={fieldLook.container}
				/>
			</AstryxIntl>
			<FieldError id={errorId}>{error}</FieldError>
		</div>
	);
}
