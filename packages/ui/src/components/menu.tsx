"use client";

import "../astryx/styles";
import { DropdownMenu, DropdownMenuItem } from "@astryxdesign/core/DropdownMenu";
import {
	Children,
	cloneElement,
	isValidElement,
	type Key,
	type ReactElement,
	type ReactNode,
} from "react";
import { AstryxIntl } from "../astryx/intl";

export interface MenuTriggerProps {
	/** The trigger (a `Button`), then the `Menu` it opens. */
	children: ReactNode;
	isOpen?: boolean;
	onOpenChange?: (isOpen: boolean) => void;
}

export interface MenuProps {
	/** `MenuItem`s. */
	children: ReactNode;
	onAction?: (key: Key) => void;
	"aria-label"?: string;
	placement?: "above" | "below" | "start" | "end";
}

export interface MenuItemProps {
	id: Key;
	children: ReactNode;
	href?: string;
	isDisabled?: boolean;
	onAction?: () => void;
}

/** A `MenuTrigger`'s list: a description the trigger renders. */
export function Menu(_props: MenuProps): null {
	return null;
}

/** One row of a `Menu`. */
export function MenuItem(_props: MenuItemProps): null {
	return null;
}

/**
 * A menu of actions, built on Astryx's dropdown menu (arrow keys, type-ahead, Escape gives the
 * focus back to the trigger): the trigger is the caller's `Button`, the rows the booklet's.
 */
export function MenuTrigger({ children, isOpen, onOpenChange }: MenuTriggerProps) {
	const parts = Children.toArray(children);
	const menu = parts.find(
		(child): child is ReactElement<MenuProps> => isValidElement(child) && child.type === Menu,
	);
	const trigger = parts.find((child) => child !== menu);
	if (!menu || !isValidElement(trigger)) return <>{children}</>;
	const items = Children.toArray(menu.props.children).filter(
		(child): child is ReactElement<MenuItemProps> =>
			isValidElement(child) && child.type === MenuItem,
	);
	return (
		<AstryxIntl>
			<DropdownMenu
				isMenuOpen={isOpen}
				onOpenChange={onOpenChange}
				placement={menu.props.placement ?? "below"}
				renderTrigger={(props) =>
					cloneElement(
						trigger as ReactElement<Record<string, unknown>>,
						props as unknown as Record<string, unknown>,
					)
				}
			>
				{items.map(({ props }) => (
					<DropdownMenuItem
						key={String(props.id)}
						label={props.children}
						href={props.href}
						isDisabled={props.isDisabled}
						onClick={() => {
							props.onAction?.();
							menu.props.onAction?.(props.id);
						}}
					/>
				))}
			</DropdownMenu>
		</AstryxIntl>
	);
}
