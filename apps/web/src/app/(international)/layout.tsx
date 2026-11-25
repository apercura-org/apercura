import type { Viewport } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { SkipLink } from "~/components/skip-link";
import { INTERNATIONAL_LOCALE } from "~/lib/markets";
import { SITE_VIEWPORT } from "~/lib/seo";
import { fontVariables } from "../fonts";
import "../globals.css";

export const viewport: Viewport = SITE_VIEWPORT;

/**
 * Root layout of the international home (`/`), the one page outside the locales: every market
 * lives under its own segment (`/fr`…), this page lets a visitor choose one. In English.
 */
export default async function InternationalLayout({ children }: { children: ReactNode }) {
	setRequestLocale(INTERNATIONAL_LOCALE);
	const t = await getTranslations({ locale: INTERNATIONAL_LOCALE, namespace: "Site" });
	return (
		// /theme.js sets `data-theme` and `data-js` on <html> before React hydrates it.
		<html lang={INTERNATIONAL_LOCALE} className={fontVariables} suppressHydrationWarning>
			<head>
				{/* Applies the stored colour theme before the first paint (~/lib/theme). */}
				<script src="/theme.js" />
			</head>
			<body className="flex min-h-dvh flex-col">
				<SkipLink label={t("skipLink")} />
				{children}
			</body>
		</html>
	);
}
