"use client";

import { Children, type DOMAttributes, isValidElement, type ReactElement } from "react";
import {
	composeRenderProps,
	type MenuTriggerProps,
	type PopoverProps,
	Pressable,
	Menu as RACMenu,
	MenuItem as RACMenuItem,
	type MenuItemProps as RACMenuItemProps,
	type MenuProps as RACMenuProps,
	MenuTrigger as RACMenuTrigger,
} from "react-aria-components";
import { listBoxItemStyles } from "../recipes";
import { Popover } from "./popover";

/**
 * Opens the menu among its children from the other child, a `Button`. The menu is React Aria's;
 * the button (Astryx's) takes its press through `Pressable`.
 */
export function MenuTrigger({ children, ...props }: MenuTriggerProps) {
	const [trigger, ...rest] = Children.toArray(children);
	return (
		<RACMenuTrigger {...props}>
			{isValidElement(trigger) ? (
				<Pressable>{trigger as ReactElement<DOMAttributes<HTMLButtonElement>, string>}</Pressable>
			) : (
				trigger
			)}
			{rest}
		</RACMenuTrigger>
	);
}

export interface MenuProps<T extends object> extends RACMenuProps<T> {
	placement?: PopoverProps["placement"];
}

export function Menu<T extends object>({
	placement = "bottom start",
	className,
	...props
}: MenuProps<T>) {
	return (
		<Popover placement={placement} className="min-w-56">
			<RACMenu {...props} className="max-h-80 overflow-auto outline-none" />
		</Popover>
	);
}

export function MenuItem({ className, ...props }: RACMenuItemProps) {
	const textValue =
		props.textValue ?? (typeof props.children === "string" ? props.children : undefined);
	return (
		<RACMenuItem
			{...props}
			textValue={textValue}
			className={composeRenderProps(className, (cls) => listBoxItemStyles({ className: cls }))}
		/>
	);
}
