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
 * Empty state: a ruled entry of the form, opened by a double rule, that says plainly what is
 * missing and what to do next.
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
				"rule-double-t flex flex-col items-start gap-3 border-b border-rule-soft py-6 sm:py-8",
				className,
			)}
		>
			<Heading className="type-subtitle text-ink">{title}</Heading>
			{description ? (
				<div className="max-w-[65ch] text-body text-ink-muted">{description}</div>
			) : null}
			{action ? <div className="mt-2">{action}</div> : null}
		</div>
	);
}
