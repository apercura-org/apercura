"use client";

import {
	composeRenderProps,
	type MenuTriggerProps,
	type PopoverProps,
	Menu as RACMenu,
	MenuItem as RACMenuItem,
	type MenuItemProps as RACMenuItemProps,
	type MenuProps as RACMenuProps,
	MenuTrigger as RACMenuTrigger,
} from "react-aria-components";
import { listBoxItemStyles } from "../recipes";
import { Popover } from "./popover";

export function MenuTrigger(props: MenuTriggerProps) {
	return <RACMenuTrigger {...props} />;
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
