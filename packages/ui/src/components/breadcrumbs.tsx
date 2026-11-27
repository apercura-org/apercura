"use client";

import "../astryx/styles";
import { Breadcrumbs as AstryxBreadcrumbs, BreadcrumbItem } from "@astryxdesign/core/Breadcrumbs";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { AstryxIntl } from "../astryx/intl";
import { ChevronRightIcon } from "../icons";
import { cn, linkStyles } from "../recipes";

export interface BreadcrumbsProps {
	/** Accessible name of the navigation landmark. */
	label: string;
	/** `Breadcrumb`s; the last one is the current page. */
	children: ReactNode;
	className?: string;
}

export interface BreadcrumbProps {
	href?: string;
	children: ReactNode;
}

/** One step of the trail: a description `Breadcrumbs` renders. */
export function Breadcrumb(_props: BreadcrumbProps): null {
	return null;
}

/**
 * Wayfinding trail, built on Astryx's breadcrumbs: small, ruled, current page unlinked
 * (`aria-current="page"`). Public pages print their own trail on the server.
 */
export function Breadcrumbs({ label, children, className }: BreadcrumbsProps) {
	const steps = Children.toArray(children).filter(
		(child): child is ReactElement<BreadcrumbProps> =>
			isValidElement(child) && child.type === Breadcrumb,
	);
	return (
		<AstryxIntl>
			<AstryxBreadcrumbs
				label={label}
				separator={<ChevronRightIcon className="size-4 text-ink-muted" />}
				className={cn("text-meta", className)}
			>
				{steps.map(({ props }, index) => {
					const current = index === steps.length - 1;
					return (
						<BreadcrumbItem
							// biome-ignore lint/suspicious/noArrayIndexKey: a trail's steps are its order.
							key={index}
							href={current ? undefined : props.href}
							isCurrent={current}
							className={cn(
								current ? "font-semibold text-ink" : linkStyles({ tone: "muted" }),
								"inline-flex min-h-11 items-center",
							)}
						>
							{props.children}
						</BreadcrumbItem>
					);
				})}
			</AstryxBreadcrumbs>
		</AstryxIntl>
	);
}
