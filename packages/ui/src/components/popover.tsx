"use client";

import "../astryx/styles";
import { Popover as AstryxPopover } from "@astryxdesign/core/Popover";
import type { ReactNode } from "react";
import { AstryxIntl } from "../astryx/intl";

export interface PopoverProps {
	/** The trigger: a `Button`. */
	children: ReactNode;
	/** What the popover holds. */
	content: ReactNode;
	/** Accessible name of the popover (a non-modal dialog). */
	label?: string;
	placement?: "above" | "below" | "start" | "end";
	isOpen?: boolean;
	onOpenChange?: (isOpen: boolean) => void;
}

/**
 * A popover holding free content (help text, a small form), built on Astryx's: a non-modal
 * dialog in the top layer, with the booklet's panel (the Apercura theme).
 */
export function Popover({
	children,
	content,
	label,
	placement = "below",
	isOpen,
	onOpenChange,
}: PopoverProps) {
	return (
		<AstryxIntl>
			<AstryxPopover
				content={<div className="max-w-sm text-body">{content}</div>}
				label={label}
				placement={placement}
				isOpen={isOpen}
				onOpenChange={onOpenChange}
				isModal={false}
				padding={4}
			>
				{children}
			</AstryxPopover>
		</AstryxIntl>
	);
}

export interface PopoverDialogProps {
	/** Accessible name of the dialog inside the popover. */
	"aria-label"?: string;
	children: ReactNode;
}

/**
 * The content of a popover opened by a `DialogTrigger`: a description the trigger renders
 * with `Popover`.
 */
export function PopoverDialog(_props: PopoverDialogProps): null {
	return null;
}
