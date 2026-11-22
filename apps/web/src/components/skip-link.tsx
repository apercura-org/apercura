"use client";

import type { MouseEvent } from "react";

/**
 * The main region the page shows. With Cache Components, the previous route
 * stays mounted in a hidden React Activity after a client-side navigation, so
 * the document can hold more than one `<main id="main">`: only a rendered one
 * is the target.
 */
function visibleMain(): HTMLElement | null {
	for (const main of document.querySelectorAll<HTMLElement>("main")) {
		if (main.checkVisibility()) return main;
	}
	return null;
}

/**
 * Skip link: visually hidden until focused, then printed at the top of the page.
 * Hidden with `sr-only` rather than moved off-screen, so neither the box nor its
 * focus ring can leak into the layout (or into full-page captures) when unfocused.
 * It is a plain `#main` link; once hydrated, when the first `#main` of the
 * document is a hidden one, it moves the focus to the visible main region instead.
 */
export function SkipLink({ label }: { label: string }) {
	const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
		const main = visibleMain();
		// The browser's own jump is right when the first `#main` is the visible one.
		if (!main || main === document.getElementById("main")) return;
		event.preventDefault();
		main.focus();
	};
	return (
		// biome-ignore lint/a11y/useValidAnchor: a real `#main` link; the handler only picks the visible target.
		<a
			href="#main"
			onClick={onClick}
			className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[100] focus:bg-paper focus:px-4 focus:py-3 focus:font-display focus:text-body focus:font-bold focus:text-ink focus:outline-3 focus:outline-offset-2 focus:outline-stamp"
		>
			{label}
		</a>
	);
}
