"use client";

import {
	OverlayArrow,
	Tooltip as RACTooltip,
	type TooltipProps as RACTooltipProps,
	TooltipTrigger as RACTooltipTrigger,
	type TooltipTriggerComponentProps,
} from "react-aria-components";
import { cn } from "../recipes";

export function TooltipTrigger({ delay = 400, ...props }: TooltipTriggerComponentProps) {
	return <RACTooltipTrigger delay={delay} {...props} />;
}

/** Short supplementary hint. Never the only place essential information lives. */
export function Tooltip({ className, children, offset = 8, ...props }: RACTooltipProps) {
	return (
		<RACTooltip
			offset={offset}
			{...props}
			className={cn(
				"max-w-xs rounded-field bg-ink px-3 py-1.5 text-meta text-paper data-entering:animate-slip-in forced-colors:border forced-colors:border-[CanvasText]",
				typeof className === "string" ? className : undefined,
			)}
		>
			{(renderProps) => (
				<>
					<OverlayArrow className="group">
						<svg
							width={12}
							height={12}
							viewBox="0 0 12 12"
							className="fill-ink group-data-[placement=bottom]:rotate-180"
							aria-hidden="true"
						>
							<path d="M0 0 6 6 12 0" />
						</svg>
					</OverlayArrow>
					{typeof children === "function" ? children(renderProps) : children}
				</>
			)}
		</RACTooltip>
	);
}
