import type { ReactNode } from "react";

interface BookletPageProps {
	children: ReactNode;
	id?: string;
}

/** The page column: centred, generous gutters, sections spaced on one rhythm. */
export function BookletPage({ children, id }: BookletPageProps) {
	return (
		<div id={id} className="mx-auto w-full max-w-6xl px-5 sm:px-8">
			<div className="flex flex-col gap-16 py-10 sm:py-14">{children}</div>
		</div>
	);
}
