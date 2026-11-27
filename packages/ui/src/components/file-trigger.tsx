"use client";

import { type ReactNode, useRef } from "react";
import { Button, type ButtonProps } from "./button";

export interface FileTriggerProps {
	/** Label of the button that opens the file picker. */
	children: ReactNode;
	/** MIME types the picker offers (`accept`). */
	acceptedFileTypes?: string[];
	allowsMultiple?: boolean;
	/** Called with the chosen files, or `null` when the picker was dismissed. */
	onSelect?: (files: FileList | null) => void;
	intent?: ButtonProps["intent"];
	isDisabled?: boolean;
	isPending?: boolean;
	pendingLabel?: string;
}

/**
 * A button that opens the system file picker: the native input stays hidden (and out of the
 * Tab order and the accessibility tree) while keyboard and screen readers reach the button.
 */
export function FileTrigger({
	children,
	acceptedFileTypes,
	allowsMultiple,
	onSelect,
	intent = "ink",
	isDisabled,
	isPending,
	pendingLabel,
}: FileTriggerProps) {
	const input = useRef<HTMLInputElement>(null);
	return (
		<>
			<Button
				intent={intent}
				isDisabled={isDisabled}
				isPending={isPending}
				pendingLabel={pendingLabel}
				onPress={() => input.current?.click()}
			>
				{children}
			</Button>
			<input
				ref={input}
				type="file"
				hidden
				tabIndex={-1}
				aria-hidden="true"
				accept={acceptedFileTypes?.join(",")}
				multiple={allowsMultiple}
				onChange={(event) => onSelect?.(event.target.files)}
			/>
		</>
	);
}
