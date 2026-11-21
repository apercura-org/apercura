import type { ReactNode } from "react";
import { cn } from "../recipes";

export interface FieldListProps {
	children: ReactNode;
	className?: string;
}

/** A list of printed form fields (`<dl>`). Rows stack label over value in narrow containers. */
export function FieldList({ children, className }: FieldListProps) {
	return <dl className={cn("@container border-t-[1.5px] border-ink", className)}>{children}</dl>;
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
 * One printed field: label, dotted leader, value. An empty field is honest:
 * it says "not provided" in muted ink instead of disappearing.
 */
export function FieldRow({ label, value, emptyLabel, className }: FieldRowProps) {
	const empty = isEmpty(value);
	return (
		<div
			data-empty={empty || undefined}
			className={cn(
				"flex flex-col gap-0.5 border-b border-rule-soft py-2.5 @md:flex-row @md:items-baseline @md:gap-3",
				className,
			)}
		>
			<dt className="shrink-0 font-display text-meta font-semibold text-ink font-stretch-semi-condensed">
				{label}
			</dt>
			<span aria-hidden="true" className="leader hidden @md:block" />
			<dd className={cn("min-w-0 text-body @md:text-end", empty ? "text-ink-muted" : "text-ink")}>
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
