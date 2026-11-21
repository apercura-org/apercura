"use client";

import {
	composeRenderProps,
	Dialog as RACDialog,
	Popover as RACPopover,
	type PopoverProps as RACPopoverProps,
} from "react-aria-components";
import { popoverStyles } from "../recipes";

export function Popover({ className, offset = 6, ...props }: RACPopoverProps) {
	return (
		<RACPopover
			offset={offset}
			{...props}
			className={composeRenderProps(className, (cls) => popoverStyles({ className: cls }))}
		/>
	);
}

export interface PopoverDialogProps extends RACPopoverProps {
	/** Accessible name of the dialog inside the popover. */
	"aria-label"?: string;
}

/** A popover holding free content (help text, a small form), as a non-modal dialog. */
export function PopoverDialog({ children, "aria-label": ariaLabel, ...props }: PopoverDialogProps) {
	return (
		<Popover {...props} className="max-w-sm">
			<RACDialog aria-label={ariaLabel} className="p-4 text-body outline-none">
				{children as React.ReactNode}
			</RACDialog>
		</Popover>
	);
}
