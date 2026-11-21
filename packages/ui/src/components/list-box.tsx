"use client";

import {
	composeRenderProps,
	ListBox as RACListBox,
	ListBoxItem as RACListBoxItem,
	type ListBoxItemProps as RACListBoxItemProps,
	type ListBoxProps as RACListBoxProps,
} from "react-aria-components";
import { CheckIcon } from "../icons";
import { cn, listBoxItemStyles } from "../recipes";

export function ListBox<T extends object>({ className, ...props }: RACListBoxProps<T>) {
	return (
		<RACListBox
			{...props}
			className={cn(
				"max-h-80 overflow-auto outline-none",
				typeof className === "string" ? className : undefined,
			)}
		/>
	);
}

/** Option row: ink check plus weight marks the selected option, not colour. */
export function ListBoxItem({ className, children, ...props }: RACListBoxItemProps) {
	const textValue = props.textValue ?? (typeof children === "string" ? children : undefined);
	return (
		<RACListBoxItem
			{...props}
			textValue={textValue}
			className={composeRenderProps(className, (cls) => listBoxItemStyles({ className: cls }))}
		>
			{composeRenderProps(children, (content, { isSelected }) => (
				<>
					<span className="flex-1">{content}</span>
					{isSelected ? <CheckIcon className="size-5 shrink-0" /> : null}
				</>
			))}
		</RACListBoxItem>
	);
}
