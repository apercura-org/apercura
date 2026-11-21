"use client";

import {
	Breadcrumb as RACBreadcrumb,
	type BreadcrumbProps as RACBreadcrumbProps,
	Breadcrumbs as RACBreadcrumbs,
	type BreadcrumbsProps as RACBreadcrumbsProps,
	Link as RACLink,
} from "react-aria-components";
import { ChevronRightIcon } from "../icons";
import { cn, linkStyles } from "../recipes";

export interface BreadcrumbsProps<T extends object> extends RACBreadcrumbsProps<T> {
	/** Accessible name of the navigation landmark. */
	label: string;
}

/** Wayfinding trail. Reads like a running head: small, ruled, current page unlinked. */
export function Breadcrumbs<T extends object>({ label, className, ...props }: BreadcrumbsProps<T>) {
	return (
		<nav aria-label={label}>
			<RACBreadcrumbs
				{...props}
				className={cn(
					"flex flex-wrap items-center gap-x-1 gap-y-1 text-meta",
					typeof className === "string" ? className : undefined,
				)}
			/>
		</nav>
	);
}

export interface BreadcrumbProps extends Omit<RACBreadcrumbProps, "children"> {
	href?: string;
	children: React.ReactNode;
}

export function Breadcrumb({ href, children, className, ...props }: BreadcrumbProps) {
	return (
		<RACBreadcrumb
			{...props}
			className={cn(
				"group flex items-center gap-1",
				typeof className === "string" ? className : undefined,
			)}
		>
			<RACLink
				href={href}
				className={cn(
					linkStyles({ tone: "muted" }),
					"inline-flex min-h-11 items-center",
					"data-current:cursor-default data-current:font-semibold data-current:text-ink data-current:no-underline",
				)}
			>
				{children}
			</RACLink>
			<ChevronRightIcon className="size-4 text-ink-muted group-last:hidden" />
		</RACBreadcrumb>
	);
}
