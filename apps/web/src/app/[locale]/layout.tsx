import { AstryxStringsProvider } from "@apercura/ui/astryx-strings";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { SkipLink } from "~/components/skip-link";
import { serverEnv } from "~/env";
import { CATALOG_LANGUAGES, LOCALE_TAGS, type Locale } from "~/i18n/locales";
import { routing } from "~/i18n/routing";
import { pickMessages } from "~/lib/client-messages";
import { BRAND, OG_LOCALES, ogImageUrl, SITE_VIEWPORT, siteVerification } from "~/lib/seo";
import { siteOrigin } from "~/lib/site-url";
import { fontVariables } from "../fonts";
import "../globals.css";

/** The `lang` of a locale's pages: its code when it is a language, else its tag (`at` → `de-AT`). */
function htmlLang(locale: Locale): string {
	return CATALOG_LANGUAGES[locale] === locale ? locale : LOCALE_TAGS[locale];
}

export function generateStaticParams() {
	return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = SITE_VIEWPORT;

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
	// carries the whole catalogue. `ErrorPages.error` is for ./error.tsx, which has no other
	// way to get its text once a page has failed.
	const catalog = await getMessages({ locale });
	const messages = pickMessages(catalog, ["Site", "LocaleSwitcher", "ErrorPages.error"]);

	return (
		// /theme.js sets `data-theme` and `data-js` on <html> before React hydrates it.
		<html
			lang={htmlLang(locale)}
			className={fontVariables}
			data-astryx-theme="apercura"
			suppressHydrationWarning
		>
			<head>
				{/* Applies the stored colour theme before the first paint (~/lib/theme). */}
				<script src="/theme.js" />
			</head>
			<body className="flex min-h-dvh flex-col">
				<SkipLink label={t("skipLink")} />
				{/* The words Astryx's components say themselves, in the page's language. */}
				<AstryxStringsProvider locale={htmlLang(locale)} messages={catalog.Astryx}>
					<NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
				</AstryxStringsProvider>
			</body>
		</html>
	);
}
