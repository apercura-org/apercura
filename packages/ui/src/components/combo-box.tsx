"use client";

import type { ReactNode } from "react";
import {
	Button as RACButton,
	ComboBox as RACComboBox,
	type ComboBoxProps as RACComboBoxProps,
} from "react-aria-components";
import { ChevronDownIcon } from "../icons";
import { fieldStyles, focusRing } from "../recipes";
import { FieldDescription, FieldError, Input, Label } from "./field";
import { ListBox } from "./list-box";
import { Popover } from "./popover";

const styles = fieldStyles();

export interface ComboBoxProps<T extends object> extends Omit<RACComboBoxProps<T>, "children"> {
	label: ReactNode;
	description?: ReactNode;
	errorMessage?: string;
	placeholder?: string;
	children: React.ReactNode | ((item: T) => React.ReactNode);
}

/** Text input with a filtered list of suggestions (cities, professions). */
export function ComboBox<T extends object>({
	label,
	description,
	errorMessage,
	placeholder,
	children,
	items,
	className,
	...props
}: ComboBoxProps<T>) {
	return (
		<RACComboBox
			{...props}
			className={styles.root({ className: typeof className === "string" ? className : undefined })}
		>
			<Label>{label}</Label>
			<div className={styles.box()}>
				<Input placeholder={placeholder} />
				<RACButton
					className={`flex size-11 shrink-0 cursor-pointer items-center justify-center text-ink hover:bg-paper-shade ${focusRing}`}
				>
					<ChevronDownIcon className="size-5" />
				</RACButton>
			</div>
			{description ? <FieldDescription>{description}</FieldDescription> : null}
			<FieldError>{errorMessage}</FieldError>
			<Popover placement="bottom start">
				<ListBox items={items}>{children}</ListBox>
			</Popover>
		</RACComboBox>
	);
}
