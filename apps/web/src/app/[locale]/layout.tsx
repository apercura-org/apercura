import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { SkipLink } from "~/components/skip-link";
import { serverEnv } from "~/env";
import { routing } from "~/i18n/routing";
import { pickMessages } from "~/lib/client-messages";
import { BRAND, OG_LOCALES, ogImageUrl, siteVerification, THEME_COLOR } from "~/lib/seo";
import { siteOrigin } from "~/lib/site-url";
import "../globals.css";

export function generateStaticParams() {
	return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
	themeColor: THEME_COLOR,
	colorScheme: "light",
};

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
	const { locale } = await params;
	if (!hasLocale(routing.locales, locale)) {
		return {};
	}
	const t = await getTranslations({ locale, namespace: "Metadata" });
	// Defaults for the pages that set no metadata of their own (search, forms, the
	// practitioner space); public pages state all of it through `pageMetadata`.
	return {
		// Canonical URLs, Open Graph images and JSON-LD are absolute on this origin.
		metadataBase: new URL(siteOrigin()),
		applicationName: BRAND,
		title: t("title"),
		description: t("description"),
		openGraph: {
			type: "website",
			siteName: BRAND,
			locale: OG_LOCALES[locale],
			images: [{ url: ogImageUrl("annuaire"), width: 1200, height: 630 }],
		},
		twitter: { card: "summary_large_image" },
		// Search Console and Bing Webmaster Tools, when their tokens are configured.
		verification: siteVerification(serverEnv),
	};
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
	const { locale } = await params;
	if (!hasLocale(routing.locales, locale)) {
		notFound();
	}
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "Site" });
	// Only the small shared namespaces reach the client here: interactive parts of a
	// page get their own messages from a <ClientIsland>, so a page's HTML never
	// carries the whole catalogue.
	const messages = pickMessages(await getMessages({ locale }), ["Site", "LocaleSwitcher"]);

	return (
		<html lang={locale}>
			<body className="flex min-h-dvh flex-col">
				<SkipLink label={t("skipLink")} />
				<NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
			</body>
		</html>
	);
}
