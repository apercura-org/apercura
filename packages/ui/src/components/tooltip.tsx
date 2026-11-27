"use client";

import "../astryx/styles";
import { Tooltip as AstryxTooltip } from "@astryxdesign/core/Tooltip";
import { Children, isValidElement, type ReactNode } from "react";

export interface TooltipTriggerProps {
	/** The trigger, then the `<Tooltip>` it shows. */
	children: ReactNode;
	/** Milliseconds of hover before the tooltip shows (keyboard focus shows it at once). */
	delay?: number;
	placement?: "above" | "below" | "start" | "end";
}

export interface TooltipProps {
	children: ReactNode;
}

/**
 * Short supplementary hint, built on Astryx's tooltip. Never the only place essential
 * information lives. Only a marker inside `TooltipTrigger`: the trigger renders it.
 */
export function Tooltip(_props: TooltipProps): null {
	return null;
}

/** Shows the `<Tooltip>` among its children on hover and keyboard focus of the other child. */
export function TooltipTrigger({
	children,
	delay = 400,
	placement = "above",
}: TooltipTriggerProps) {
	let content: ReactNode = null;
	const triggers: ReactNode[] = [];
	for (const child of Children.toArray(children)) {
		if (isValidElement<TooltipProps>(child) && child.type === Tooltip)
			content = child.props.children;
		else triggers.push(child);
	}
	return (
		<AstryxTooltip content={content} delay={delay} placement={placement}>
			{triggers}
		</AstryxTooltip>
	);
}
