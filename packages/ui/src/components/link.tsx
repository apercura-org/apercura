"use client";

import {
	composeRenderProps,
	Link as RACLink,
	type LinkProps as RACLinkProps,
} from "react-aria-components";
import type { VariantProps } from "tailwind-variants";
import { ArrowOutIcon } from "../icons";
import { linkStyles } from "../recipes";

export interface LinkProps extends RACLinkProps, VariantProps<typeof linkStyles> {
	/**
	 * Marks a link that leaves Apercura. Shows an arrow and, when given, appends
	 * this text for screen readers (for example "opens another site").
	 */
	externalLabel?: string;
}

/** Inline text link, always underlined so it never relies on colour. */
export function Link({ tone, className, externalLabel, children, ...props }: LinkProps) {
	return (
		<RACLink
			{...props}
			className={composeRenderProps(className, (cls) => linkStyles({ tone, className: cls }))}
		>
			{composeRenderProps(children, (content) => (
				<>
					{content}
					{externalLabel ? (
						<>
							<ArrowOutIcon className="ms-1 inline size-[0.85em] align-[-0.05em]" />
							<span className="sr-only"> ({externalLabel})</span>
						</>
					) : null}
				</>
			))}
		</RACLink>
	);
}
