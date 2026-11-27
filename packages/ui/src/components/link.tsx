"use client";

import "../astryx/styles";
import { Link as AstryxLink, type LinkProps as AstryxLinkProps } from "@astryxdesign/core/Link";
import type { VariantProps } from "tailwind-variants";
import { ArrowOutIcon } from "../icons";
import { cn, linkStyles } from "../recipes";

export interface LinkProps
	extends Pick<
			AstryxLinkProps,
			"href" | "target" | "rel" | "download" | "onClick" | "ref" | "children" | "id"
		>,
		VariantProps<typeof linkStyles> {
	className?: string;
	/**
	 * Marks a link that leaves Apercura. Shows an arrow and, when given, appends
	 * this text for screen readers (for example "opens another site").
	 */
	externalLabel?: string;
}

/** Inline text link, built on Astryx's, always underlined so it never relies on colour. */
export function Link({ tone, className, externalLabel, children, ...props }: LinkProps) {
	return (
		<AstryxLink
			{...props}
			type="inherit"
			color="inherit"
			hasUnderline
			className={cn(linkStyles({ tone }), className)}
		>
			{children}
			{externalLabel ? (
				<>
					<ArrowOutIcon className="ms-1 inline size-[0.85em] align-[-0.05em]" />
					<span className="sr-only"> ({externalLabel})</span>
				</>
			) : null}
		</AstryxLink>
	);
}
