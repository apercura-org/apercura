"use client";

import type { ReactNode } from "react";
import {
	FileTrigger as RACFileTrigger,
	type FileTriggerProps as RACFileTriggerProps,
} from "react-aria-components";
import { Button, type ButtonProps } from "./button";

export interface FileTriggerProps extends Omit<RACFileTriggerProps, "children"> {
	/** Label of the button that opens the file picker. */
	children: ReactNode;
	intent?: ButtonProps["intent"];
	isDisabled?: boolean;
	isPending?: boolean;
	pendingLabel?: string;
}

/**
 * A button that opens the system file picker (React Aria FileTrigger): the
 * native input stays hidden but keyboard and screen readers reach the button.
 */
export function FileTrigger({
	children,
	intent = "ink",
	isDisabled,
	isPending,
	pendingLabel,
	...props
}: FileTriggerProps) {
	return (
		<RACFileTrigger {...props}>
			<Button
				intent={intent}
				isDisabled={isDisabled}
				isPending={isPending}
				pendingLabel={pendingLabel}
			>
				{children}
			</Button>
		</RACFileTrigger>
	);
}
