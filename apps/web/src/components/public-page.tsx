import type { ReactNode } from "react";
import type { Href } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

/**
 * The frame of every public page: the white running head with its navigation,
 * the page's main content, and the closing footer on the quiet shade.
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
			<SiteHeader locale={locale} href={href} />
			<main id="main" tabIndex={-1} className="flex-1 outline-none">
				{children}
			</main>
			<SiteFooter locale={locale} />
		</>
	);
}
