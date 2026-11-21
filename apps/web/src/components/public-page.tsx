import type { ReactNode } from "react";
import type { Href } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

/**
 * The frame of every public page: the cover band with the running head and
 * navigation, the page's main content, and the closing band.
 */
export function PublicPage({
	locale,
	href,
	children,
}: {
	locale: Locale;
	/** This page, so the language switch stays on it. */
	href: Href;
	children: ReactNode;
}) {
	return (
		<>
			<div className="surface-cover">
				<SiteHeader locale={locale} href={href} />
			</div>
			<main id="main" tabIndex={-1} className="flex-1 outline-none">
				{children}
			</main>
			<SiteFooter locale={locale} />
		</>
	);
}
