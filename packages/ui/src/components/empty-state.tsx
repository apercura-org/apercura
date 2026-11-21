import type { ReactNode } from "react";
import { cn } from "../recipes";

export interface EmptyStateProps {
	title: string;
	description?: ReactNode;
	/** The next step the visitor can take (a button or link). */
	action?: ReactNode;
	/** Heading level, so the empty state fits the page outline. */
	headingLevel?: 2 | 3 | 4;
	className?: string;
}

/**
 * Empty state as a blank printed form: an unfilled ruled box that says plainly
 * what is missing and what to do next.
 */
export function EmptyState({
	title,
	description,
	action,
	headingLevel = 2,
	className,
}: EmptyStateProps) {
	const Heading = `h${headingLevel}` as const;
	return (
		<div
			className={cn(
				"flex flex-col items-start gap-3 border-[1.5px] border-dashed border-field-edge bg-paper px-5 py-6 sm:px-7 sm:py-8",
				className,
			)}
		>
			<svg
				viewBox="0 0 48 32"
				className="h-8 w-12 text-ink-muted"
				aria-hidden="true"
				focusable="false"
			>
				<path d="M1 1h46v30H1z" fill="none" stroke="currentColor" strokeWidth="1.5" />
				<path
					d="M7 10h20M7 17h34M7 24h26"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeDasharray="2 3"
				/>
			</svg>
			<Heading className="font-display text-lead font-bold text-ink">{title}</Heading>
			{description ? (
				<div className="max-w-[65ch] text-body text-ink-muted">{description}</div>
			) : null}
			{action ? <div className="mt-2">{action}</div> : null}
		</div>
	);
}
