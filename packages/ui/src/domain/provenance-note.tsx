import { cn } from "../recipes";

export interface ProvenanceNoteProps {
	/** "Source", in the page language. */
	sourceLabel: string;
	/** Name of the data source, e.g. "Annuaire Santé (ANS)". */
	source: string;
	/** Link to the source dataset, when public. */
	sourceHref?: string;
	/** "Updated", in the page language. */
	updatedLabel: string;
	/** ISO date (YYYY-MM-DD) of the last refresh from the source. */
	updatedAt: string;
	/** BCP 47 locale used to print the date. */
	locale: string;
	/** Screen-reader suffix for the external source link, e.g. "opens another site". */
	externalLabel?: string;
	className?: string;
}

/** Where a page's facts come from and when they were last refreshed, set as a printer's imprint. */
export function ProvenanceNote({
	sourceLabel,
	source,
	sourceHref,
	updatedLabel,
	updatedAt,
	locale,
	externalLabel,
	className,
}: ProvenanceNoteProps) {
	const date = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(
		new Date(`${updatedAt}T00:00:00Z`),
	);
	return (
		<p
			className={cn(
				"flex flex-wrap gap-x-4 gap-y-1 border-t border-rule-soft pt-3 text-meta text-ink-muted",
				className,
			)}
		>
			<span>
				<span className="type-caption me-1.5 text-ink">{sourceLabel}</span>
				{sourceHref ? (
					<a
						href={sourceHref}
						className="text-ink-muted underline decoration-1 underline-offset-[0.2em] hover:decoration-2"
					>
						{source}
						{externalLabel ? <span className="sr-only"> ({externalLabel})</span> : null}
					</a>
				) : (
					source
				)}
			</span>
			<span>
				<span className="type-caption me-1.5 text-ink">{updatedLabel}</span>
				<time dateTime={updatedAt}>{date}</time>
			</span>
		</p>
	);
}
