import type { ReactNode } from "react";
import { cn } from "../recipes";

export interface FieldListProps {
	children: ReactNode;
	className?: string;
}

/**
 * A list of facts (`<dl>`), ruled like a printed form: an ink rule above, a form hairline under
 * each row. Rows stack label over value in narrow containers.
 */
export function FieldList({ children, className }: FieldListProps) {
	return <dl className={cn("@container border-t border-ink", className)}>{children}</dl>;
}

export interface FieldRowProps {
	label: ReactNode;
	/** The filled value. `null`, `undefined` or an empty string reads as not provided. */
	value?: ReactNode;
	/** Text shown when the field is empty, e.g. "Not provided". Required: empty fields always say so. */
	emptyLabel: string;
	className?: string;
}

const isEmpty = (value: ReactNode) =>
	value === null ||
	value === undefined ||
	value === false ||
	(typeof value === "string" && value.trim() === "");

/**
 * One fact: label, then value, in two columns from 28 rem. An empty field is honest: it says
 * "not provided" in muted ink instead of disappearing.
 */
export function FieldRow({ label, value, emptyLabel, className }: FieldRowProps) {
	const empty = isEmpty(value);
	return (
		<div
			data-empty={empty || undefined}
			className={cn(
				"grid min-h-12 gap-0.5 border-b border-rule-soft py-3 @md:grid-cols-[minmax(9rem,2fr)_3fr] @md:items-baseline @md:gap-6",
				className,
			)}
		>
			<dt className="font-display text-meta font-medium text-ink-muted">{label}</dt>
			<dd className={cn("min-w-0 text-body", empty ? "text-ink-muted" : "text-ink")}>
				{empty ? (
					<>
						<span aria-hidden="true" className="me-1.5">
							—
						</span>
						{emptyLabel}
					</>
				) : (
					value
				)}
			</dd>
		</div>
	);
}
