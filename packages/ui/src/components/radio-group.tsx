"use client";

import "../astryx/styles";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
import {
	Children,
	isValidElement,
	type ReactElement,
	type ReactNode,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { fieldLook } from "../astryx/field-look";
import { AstryxIntl } from "../astryx/intl";
import { markRequired } from "../astryx/native";
import { textOf } from "../astryx/text";
import { FieldError } from "./field-parts";
import { useFieldValidation } from "./form";

export interface RadioGroupProps {
	label: ReactNode;
	description?: ReactNode;
	errorMessage?: string;
	/** `Radio`s. */
	children: ReactNode;
	value?: string | null;
	defaultValue?: string;
	onChange?: (value: string) => void;
	isRequired?: boolean;
	isDisabled?: boolean;
	isInvalid?: boolean;
	name?: string;
	orientation?: "vertical" | "horizontal";
	className?: string;
}

export interface RadioProps {
	value: string;
	/** The option's label, read whole as the radio's name (a title and its detail). */
	children: ReactNode;
	isDisabled?: boolean;
}

/** One choice of a `RadioGroup`: only a description of the option, rendered by the group. */
export function Radio(_props: RadioProps): null {
	return null;
}

/**
 * A group of radios, built on Astryx's radio list: the label names the group, each radio a ring
 * with an ink dot (the Apercura theme). Arrow keys move and choose, as native radios do.
 */
export function RadioGroup({
	label,
	description,
	errorMessage,
	children,
	value: valueProp,
	defaultValue,
	onChange,
	isRequired,
	isDisabled,
	isInvalid,
	name,
	orientation = "vertical",
	className,
}: RadioGroupProps) {
	const [own, setOwn] = useState(defaultValue ?? "");
	const value = valueProp === undefined ? own : (valueProp ?? "");
	const group = useRef<HTMLDivElement>(null);
	// The browser checks a required group through its radios; the focus goes to the chosen or
	// the first one.
	const radio = useMemo(
		() => ({
			get current() {
				return (
					group.current?.querySelector<HTMLInputElement>("input[type=radio]:checked") ??
					group.current?.querySelector<HTMLInputElement>("input[type=radio]") ??
					null
				);
			},
		}),
		[],
	);
	const { error } = useFieldValidation({
		element: radio,
		name,
		value,
		isInvalid,
		errorMessage,
	});
	// Required: the group and its radios say so, and the browser checks it.
	useLayoutEffect(() => {
		markRequired(
			group.current?.parentElement ?? null,
			'[role="radiogroup"], input[type=radio]',
			isRequired === true,
		);
	});
	const radios = Children.toArray(children).filter(
		(child): child is ReactElement<RadioProps> => isValidElement(child) && child.type === Radio,
	);
	return (
		<div className={fieldLook.root(className)} data-invalid={error !== null ? "" : undefined}>
			<AstryxIntl>
				<RadioList
					ref={group}
					label={textOf(label)}
					description={description != null ? textOf(description) : undefined}
					value={value}
					onChange={(next) => {
						setOwn(next);
						onChange?.(next);
					}}
					htmlName={name}
					isDisabled={isDisabled}
					orientation={orientation}
					status={error !== null ? { type: "error", message: error || undefined } : undefined}
					containerClassName={fieldLook.container}
				>
					{radios.map(({ key, props }) => (
						<RadioListItem
							key={key ?? props.value}
							value={props.value}
							label={props.children}
							isDisabled={props.isDisabled}
						/>
					))}
				</RadioList>
			</AstryxIntl>
			<FieldError aria-hidden>{error}</FieldError>
		</div>
	);
}
