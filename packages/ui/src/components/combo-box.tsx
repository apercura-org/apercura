"use client";

import "../astryx/styles";
import { type Key, type ReactNode, useId, useMemo, useRef, useState } from "react";
import { describedBy, fieldLook } from "../astryx/field-look";
import { SuggestBox } from "../astryx/suggest-box";
import { textOf } from "../astryx/text";
import { FieldDescription, FieldError, Label } from "./field-parts";
import { useFieldValidation } from "./form";
import { collectItems } from "./list-box";

export interface ComboBoxProps<T> {
	label: ReactNode;
	description?: ReactNode;
	errorMessage?: string;
	placeholder?: string;
	items?: Iterable<T>;
	/** `ListBoxItem`s, or a function of `items` returning one. */
	children: ReactNode | ((item: T) => ReactNode);
	inputValue?: string;
	defaultInputValue?: string;
	onInputChange?: (value: string) => void;
	onSelectionChange?: (key: Key | null) => void;
	/** The typed text's name in the form. */
	name?: string;
	isRequired?: boolean;
	isInvalid?: boolean;
	isDisabled?: boolean;
	/** Printed in the open list while it has no row; none keeps it shut. */
	emptyStatus?: string;
	/** Kept for the callers of React Aria's combo box: the list opens as the person types. */
	menuTrigger?: "input" | "focus" | "manual";
	allowsEmptyCollection?: boolean;
	className?: string;
}

/**
 * Text input with a list of suggestions (cities, professions), on the booklet's field and
 * Astryx's layer (`SuggestBox`). The text stays free; choosing a row writes its text.
 */
export function ComboBox<T>({
	label,
	description,
	errorMessage,
	placeholder,
	items,
	children,
	inputValue,
	defaultInputValue,
	onInputChange,
	onSelectionChange,
	name,
	isRequired,
	isInvalid,
	isDisabled,
	emptyStatus,
	className,
}: ComboBoxProps<T>) {
	const options = collectItems(children, items);
	const [own, setOwn] = useState(defaultInputValue ?? "");
	const value = inputValue ?? own;
	const input = useRef<HTMLInputElement>(null);
	const id = useId();
	const hintId = useId();
	const errorId = useId();
	const { error } = useFieldValidation({ element: input, name, value, isInvalid, errorMessage });
	const sections = useMemo(
		() => [
			{
				id: "items",
				options: options.map((item) => ({
					id: item.id,
					textValue: item.textValue,
					label: item.label,
					isDisabled: item.isDisabled,
				})),
			},
		],
		[options],
	);
	const change = (next: string) => {
		setOwn(next);
		onInputChange?.(next);
	};
	return (
		<div className={fieldLook.root(className)} data-invalid={error !== null ? "" : undefined}>
			<Label htmlFor={id}>{label}</Label>
			<SuggestBox
				value={value}
				onValueChange={change}
				sections={sections}
				emptyStatus={emptyStatus}
				listLabel={textOf(label)}
				inputRef={input}
				onChoose={(option) => {
					const item = options.find((entry) => entry.id === option.id);
					onSelectionChange?.(item ? item.key : option.id);
				}}
			>
				{(box, anchor) => (
					<div ref={anchor} className={fieldLook.control}>
						<input
							{...box}
							id={id}
							name={name}
							value={value}
							onChange={(event) => {
								box.onInput();
								change(event.target.value);
							}}
							placeholder={placeholder}
							required={isRequired}
							disabled={isDisabled}
							autoComplete="off"
							aria-invalid={error !== null || undefined}
							aria-describedby={describedBy(description != null && hintId, error && errorId)}
						/>
					</div>
				)}
			</SuggestBox>
			{description != null ? <FieldDescription id={hintId}>{description}</FieldDescription> : null}
			<FieldError id={errorId}>{error}</FieldError>
		</div>
	);
}
