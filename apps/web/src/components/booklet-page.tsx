import type { ReactNode } from "react";

interface BookletPageProps {
	/** Running head text printed at the top left of the page. */
	runningHead: string;
	/**
	 * Folio printed at the top right, only where it means something: the home page is
	 * page 1, search results print their results page, practitioner pages their RPPS.
	 */
	folio?: string;
	children: ReactNode;
	id?: string;
}

/** One page of the booklet: running head (and folio when meaningful), then the page's content on white paper. */
export function BookletPage({ runningHead, folio, children, id }: BookletPageProps) {
	return (
		<div id={id} className="mx-auto w-full max-w-6xl px-5 sm:px-8">
			<div
				className="flex items-baseline justify-between gap-4 border-b border-ink pt-6 pb-2"
				aria-hidden="true"
			>
				<span className="caps text-ink">{runningHead}</span>
				{folio ? <span className="caps tabular whitespace-nowrap text-ink">{folio}</span> : null}
			</div>
			<div className="flex flex-col gap-14 py-10 sm:py-14">{children}</div>
		</div>
	);
}
