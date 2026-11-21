import type { VariantProps } from "tailwind-variants";
import { cn, skeletonStyles } from "../recipes";

export interface SkeletonProps extends VariantProps<typeof skeletonStyles> {
	className?: string;
}

/** Placeholder block while content loads. Decorative: pair it with a status message for screen readers. */
export function Skeleton({ shape, className }: SkeletonProps) {
	return <span aria-hidden="true" className={skeletonStyles({ shape, className })} />;
}

export interface SkeletonTextProps {
	lines?: number;
	className?: string;
	/** Text announced to assistive technology while loading, e.g. "Loading the page". */
	label: string;
}

/** A few ruled lines standing in for a paragraph, with an announced loading label. */
export function SkeletonText({ lines = 3, className, label }: SkeletonTextProps) {
	return (
		<div role="status" className={cn("flex flex-col gap-2.5", className)}>
			<span className="sr-only">{label}</span>
			{Array.from({ length: lines }, (_, index) => (
				<Skeleton
					// biome-ignore lint/suspicious/noArrayIndexKey: static placeholder lines
					key={index}
					className={index === lines - 1 ? "w-3/5" : undefined}
				/>
			))}
		</div>
	);
}
