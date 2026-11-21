"use client";

import type { ReactNode } from "react";
import {
	composeRenderProps,
	Checkbox as RACCheckbox,
	type CheckboxProps as RACCheckboxProps,
} from "react-aria-components";
import { CheckIcon, MinusIcon } from "../icons";
import { tv } from "../recipes/tv";

const checkbox = tv({
	slots: {
		root: "group flex min-h-11 cursor-pointer items-center gap-3 text-body text-ink data-disabled:cursor-not-allowed data-disabled:text-ink-disabled",
		box: [
			"flex size-6 shrink-0 items-center justify-center rounded-field border-2 border-ink bg-paper text-paper transition-colors duration-100",
			"group-data-selected:bg-ink group-data-indeterminate:bg-ink",
			"group-data-invalid:border-error group-data-disabled:border-ink-disabled",
			"group-data-focus-visible:outline-3 group-data-focus-visible:outline-offset-2 group-data-focus-visible:outline-(--focus-ring)",
			"forced-colors:group-data-selected:bg-[Highlight]",
		],
	},
});

export interface CheckboxProps extends Omit<RACCheckboxProps, "children"> {
	children: ReactNode;
}

/** Checkbox: a printed square ticked in ink. */
export function Checkbox({ className, children, ...props }: CheckboxProps) {
	const styles = checkbox();
	return (
		<RACCheckbox
			{...props}
			className={composeRenderProps(className, (cls) => styles.root({ className: cls }))}
		>
			{({ isSelected, isIndeterminate }) => (
				<>
					<span className={styles.box()}>
						{isIndeterminate ? (
							<MinusIcon className="size-4" strokeWidth={2.5} />
						) : isSelected ? (
							<CheckIcon className="size-4" strokeWidth={2.5} />
						) : null}
					</span>
					<span>{children}</span>
				</>
			)}
		</RACCheckbox>
	);
}
