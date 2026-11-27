"use client";

import "../astryx/styles";
import { Selector } from "@astryxdesign/core/Selector";
import {
	type Key,
	type ReactNode,
	useCallback,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useControlDescription } from "../astryx/aria";
import { describedBy, fieldLook } from "../astryx/field-look";
import { AstryxIntl } from "../astryx/intl";
import { markRequired } from "../astryx/native";
import { textOf } from "../astryx/text";
import { cn } from "../recipes";
import { FieldDescription, FieldError } from "./field-parts";
import { useFieldValidation, type ValidationBehavior } from "./form";
import { collectItems } from "./list-box";

export interface SelectProps<T> {
	label: ReactNode;
	description?: ReactNode;
	errorMessage?: string;
	placeholder?: string;
	items?: Iterable<T>;
	/** `ListBoxItem`s, or a function of `items` returning one. */
	children: ReactNode | ((item: T) => ReactNode);
	selectedKey?: Key | null;
	defaultSelectedKey?: Key;
	onSelectionChange?: (key: Key | null) => void;
	name?: string;
	/** An autofill hint (`address-level2`): a hidden native select takes the browser's value. */
	autoComplete?: string;
	isRequired?: boolean;
	isDisabled?: boolean;
	isInvalid?: boolean;
	/** `aria`: checked by the caller (`isInvalid`), not on submit. */
	validationBehavior?: ValidationBehavior;
	className?: string;
	"aria-label"?: string;
}

/** The browser's own words for a required list left empty, in the page's language. */
function requiredChoiceMessage() {
	const probe = document.createElement("select");
	probe.required = true;
	return probe.validationMessage || " ";
}

/**
 * Single choice from a short list, built on Astryx's selector: the trigger reads like a filled
 * form field (a select-only combobox) and opens the list below it.
 */
export function Select<T>({
	label,
	description,
	errorMessage,
	placeholder,
	items,
	children,
	selectedKey,
	defaultSelectedKey,
	onSelectionChange,
	name,
	autoComplete,
	isRequired,
	isDisabled,
	isInvalid,
	validationBehavior,
	className,
	"aria-label": ariaLabel,
}: SelectProps<T>) {
	const options = collectItems(children, items);
	const [own, setOwn] = useState<Key | null>(defaultSelectedKey ?? null);
	const current = selectedKey === undefined ? own : selectedKey;
	const value = current === null ? null : String(current);
	const field = useRef<HTMLDivElement>(null);
	const trigger = useMemo(
		() => ({
			get current() {
				return field.current?.querySelector<HTMLElement>('[role="combobox"]') ?? null;
			},
		}),
		[],
	);
	const hintId = useId();
	const errorId = useId();
	useLayoutEffect(() => markRequired(field.current, '[role="combobox"]', isRequired === true));
	const checkRequired = useCallback(
		() =>
			validationBehavior !== "aria" && isRequired && value === null
				? requiredChoiceMessage()
				: null,
		[validationBehavior, isRequired, value],
	);
	const { error } = useFieldValidation({
		element: trigger,
		name,
		value,
		isInvalid,
		errorMessage,
		checkRequired,
	});
	useControlDescription(
		trigger,
		error !== null,
		describedBy(description != null && hintId, error !== null && errorId) ?? null,
	);
	const choose = (next: string | null) => {
		const key = next === null ? null : (options.find((item) => item.id === next)?.key ?? next);
		setOwn(key);
		onSelectionChange?.(key);
	};
	const selectorOptions = options.map((item) => ({
		value: item.id,
		label: item.text,
		disabled: item.isDisabled,
	}));
	return (
		<div
			ref={field}
			className={fieldLook.root(className)}
			data-invalid={error !== null ? "" : undefined}
		>
			<AstryxIntl>
				<Selector
					label={ariaLabel ?? textOf(label)}
					options={selectorOptions}
					value={value}
					hasClear={false as never}
					onChange={(next: string | null) => choose(next)}
					placeholder={placeholder ?? ""}
					placement="below"
					htmlName={autoComplete ? undefined : name}
					isDisabled={isDisabled}
					containerClassName={fieldLook.container}
					controlClassName={cn(
						fieldLook.control,
						"cursor-pointer",
						"[&_[role=combobox]]:flex-1 [&_[role=combobox]]:px-3.5 [&_[role=combobox]]:py-2.5 [&_[role=combobox]]:text-start [&_[role=combobox]]:text-body [&_[role=combobox]]:text-ink [&_[role=combobox]]:outline-none",
						"has-[[role=combobox]:focus-visible]:outline-3 has-[[role=combobox]:focus-visible]:outline-solid has-[[role=combobox]:focus-visible]:-outline-offset-1 has-[[role=combobox]:focus-visible]:outline-(--focus-ring)",
						"[&_.astryx-selector-indicator-icon]:me-3.5 [&_.astryx-selector-indicator-icon]:text-[1.25rem] [&_.astryx-selector-indicator-icon]:text-ink",
					)}
				/>
			</AstryxIntl>
			{autoComplete ? (
				// Autofill writes into a native select; it is out of sight and of the Tab order.
				<select
					aria-hidden="true"
					tabIndex={-1}
					name={name}
					autoComplete={autoComplete}
					value={value ?? ""}
					onChange={(event) => choose(event.target.value === "" ? null : event.target.value)}
					className="sr-only"
				>
					<option value="" />
					{options.map((item) => (
						<option key={item.id} value={item.id}>
							{item.textValue}
						</option>
					))}
				</select>
			) : null}
			{description != null ? <FieldDescription id={hintId}>{description}</FieldDescription> : null}
			<FieldError id={errorId}>{error}</FieldError>
		</div>
	);
}
