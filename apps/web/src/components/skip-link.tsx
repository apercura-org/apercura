/**
 * Skip link: visually hidden until focused, then printed at the top of the page.
 * Hidden with `sr-only` rather than moved off-screen, so neither the box nor its
 * focus ring can leak into the layout (or into full-page captures) when unfocused.
 */
export function SkipLink({ label }: { label: string }) {
	return (
		<a
			href="#main"
			className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[100] focus:bg-paper focus:px-4 focus:py-3 focus:font-display focus:text-body focus:font-bold focus:text-ink focus:outline-3 focus:outline-offset-2 focus:outline-stamp"
		>
			{label}
		</a>
	);
}
