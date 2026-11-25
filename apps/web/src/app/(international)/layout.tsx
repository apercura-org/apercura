import type { Viewport } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { SkipLink } from "~/components/skip-link";
import { INTERNATIONAL_LOCALE } from "~/lib/markets";
import { THEME_COLOR } from "~/lib/seo";
import "../globals.css";

export const viewport: Viewport = {
	themeColor: THEME_COLOR,
	colorScheme: "light",
};

/**
 * Root layout of the international home (`/`), the one page outside the locales: every market
 * lives under its own segment (`/fr`…), this page lets a visitor choose one. In English.
 */
export default async function InternationalLayout({ children }: { children: ReactNode }) {
	setRequestLocale(INTERNATIONAL_LOCALE);
	const t = await getTranslations({ locale: INTERNATIONAL_LOCALE, namespace: "Site" });
	return (
		<html lang={INTERNATIONAL_LOCALE}>
			<body className="flex min-h-dvh flex-col">
				<SkipLink label={t("skipLink")} />
				{children}
			</body>
		</html>
	);
}
