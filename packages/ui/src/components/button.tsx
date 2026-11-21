"use client";

import {
	composeRenderProps,
	ProgressBar,
	Button as RACButton,
	type ButtonProps as RACButtonProps,
	Link as RACLink,
	type LinkProps as RACLinkProps,
} from "react-aria-components";
import type { VariantProps } from "tailwind-variants";
import { buttonStyles } from "../recipes";

type ButtonVariants = VariantProps<typeof buttonStyles>;

export interface ButtonProps extends RACButtonProps, ButtonVariants {
	/** Accessible label announced while `isPending` is true. Required when the button can be pending. */
	pendingLabel?: string;
}

/**
 * Button. `intent="stamp"` is the violet stamp, reserved for the action that
 * moves the visitor forward (search, book, claim, confirm). Use `ink` for
 * secondary actions and `quiet` inside dense rows.
 */
export function Button({ intent, size, pendingLabel, className, children, ...props }: ButtonProps) {
	return (
		<RACButton
			{...props}
			className={composeRenderProps(className, (cls) =>
				buttonStyles({ intent, size, className: cls }),
			)}
		>
			{composeRenderProps(children, (content, { isPending }) => (
				<>
					{isPending ? (
						<ProgressBar
							isIndeterminate
							aria-label={pendingLabel}
							className="size-[1.1em] animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
						/>
					) : null}
					{content}
				</>
			))}
		</RACButton>
	);
}

export interface LinkButtonProps extends RACLinkProps, ButtonVariants {}

/** A link that looks like a button (navigation, `tel:` links, external booking). */
export function LinkButton({ intent, size, className, ...props }: LinkButtonProps) {
	return (
		<RACLink
			{...props}
			className={composeRenderProps(className, (cls) =>
				buttonStyles({ intent, size, className: cls }),
			)}
		/>
	);
}
