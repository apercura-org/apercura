"use client";

import "../astryx/styles";
import { Button as AstryxButton } from "@astryxdesign/core/Button";
import {
	type ButtonHTMLAttributes,
	type CSSProperties,
	type MouseEvent,
	type ReactNode,
	type Ref,
	useLayoutEffect,
	useMemo,
	useRef,
} from "react";
import type { VariantProps } from "tailwind-variants";
import { AstryxIntl } from "../astryx/intl";
import { textOf } from "../astryx/text";
import { useMergedRef } from "../astryx/use-merged-ref";
import { buttonStyles, cn } from "../recipes";

type ButtonVariants = VariantProps<typeof buttonStyles>;

/**
 * What Astryx paints that the booklet does not: the hover and press tint (a background image
 * over the fill), the vertical padding, the fixed height and the one-line, cut-short label. The
 * recipe sets the fill, the edge, the height and the press itself, and a long label wraps
 * ("Appeler le 01 99 00 01 01" on a phone, at 400 % zoom) instead of losing its end.
 */
const astryxReset =
	"h-auto bg-none py-0 whitespace-normal *:min-w-0 [&_span]:overflow-visible [&_span]:whitespace-normal";

/** The variant Astryx draws under the recipe: it picks the focus ring's colour and the spinner's. */
const VARIANT = { stamp: "primary", ink: "secondary", quiet: "ghost" } as const;

interface SharedProps extends ButtonVariants {
	children?: ReactNode;
	className?: string;
	style?: CSSProperties;
	/** The accessible name, when the visible content is not text (an icon) or says less. */
	"aria-label"?: string;
	"aria-describedby"?: string;
	"aria-pressed"?: boolean;
	"aria-expanded"?: boolean;
	"aria-controls"?: string;
	"aria-haspopup"?: boolean | "dialog" | "menu" | "listbox";
	id?: string;
}

export interface ButtonProps
	extends SharedProps,
		Omit<
			ButtonHTMLAttributes<HTMLButtonElement>,
			keyof SharedProps | "type" | "disabled" | "onClick" | "color"
		> {
	/** Native click, composed with `onPress` (a trigger's `Pressable` hands its press here). */
	onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
	/** Called on a click, a tap, Enter or Space. */
	onPress?: () => void;
	isDisabled?: boolean;
	/**
	 * The action is running: a spinner replaces the label, the button stays focusable and in
	 * place (`aria-busy`, `aria-disabled`) and ignores presses, and `pendingLabel` is announced.
	 */
	isPending?: boolean;
	/** Announced (politely) while `isPending` is true. Required when the button can be pending. */
	pendingLabel?: string;
	type?: "button" | "submit" | "reset";
	form?: string;
	name?: string;
	value?: string;
	autoFocus?: boolean;
	ref?: Ref<HTMLButtonElement>;
}

/**
 * Button, built on Astryx's. `intent="stamp"` is the violet stamp, reserved for the action that
 * moves the visitor forward (search, book, claim, confirm). Use `ink` for secondary actions and
 * `quiet` inside dense rows.
 *
 * A disabled or pending button keeps its Tab stop and says why it does nothing
 * (`aria-disabled`), as Astryx does everywhere.
 */
export function Button({
	intent = "ink",
	size,
	pendingLabel,
	className,
	children,
	onPress,
	onClick,
	isDisabled,
	isPending,
	"aria-label": ariaLabel,
	ref,
	...props
}: ButtonProps) {
	const element = useRef<HTMLButtonElement>(null);
	usePendingRegion(element, isPending === true);
	const extra = useMemo(
		() => (pendingLabel ? { "@astryx.button.loading": pendingLabel } : undefined),
		[pendingLabel],
	);
	return (
		<AstryxIntl extra={extra}>
			<AstryxButton
				{...props}
				ref={useMergedRef(ref, element)}
				label={ariaLabel ?? textOf(children)}
				variant={VARIANT[intent]}
				isDisabled={isDisabled}
				isLoading={isPending}
				onClick={
					onPress || onClick
						? (event: MouseEvent<HTMLButtonElement>) => {
								onClick?.(event);
								onPress?.();
							}
						: undefined
				}
				className={cn(buttonStyles({ intent, size }), astryxReset, className)}
			>
				{children}
			</AstryxButton>
		</AstryxIntl>
	);
}

/**
 * Astryx keeps a polite live region (`role="status"`) inside every button, for the word it says
 * while the button is pending. An empty one in each of a page's buttons is noise: one more
 * status to a screen reader's list of regions, inside a button, whose content is
 * presentational. Here it is a plain polite live region, and only while the button is pending,
 * the only time it speaks; Astryx writes the word a render after, once the region is in place.
 */
function usePendingRegion(button: { current: HTMLButtonElement | null }, isPending: boolean) {
	useLayoutEffect(() => {
		const region = button.current?.querySelector<HTMLElement>(
			':scope > [role="status"], :scope > [data-pending-region]',
		);
		if (!region) return;
		region.setAttribute("data-pending-region", "");
		region.removeAttribute("role");
		if (isPending) region.setAttribute("aria-live", "polite");
		else region.removeAttribute("aria-live");
	}, [button, isPending]);
}

export interface LinkButtonProps extends SharedProps {
	href: string;
	target?: string;
	rel?: string;
	ref?: Ref<HTMLButtonElement>;
}

/** A link that looks like a button (navigation, `tel:` links, external booking). */
export function LinkButton({
	intent = "ink",
	size,
	className,
	children,
	"aria-label": ariaLabel,
	...props
}: LinkButtonProps) {
	return (
		<AstryxButton
			{...props}
			label={ariaLabel ?? textOf(children)}
			variant={VARIANT[intent]}
			className={cn(buttonStyles({ intent, size }), astryxReset, className)}
		>
			{children}
		</AstryxButton>
	);
}
