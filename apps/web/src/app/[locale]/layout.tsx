import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SkipLink } from "~/components/skip-link";
import { routing } from "~/i18n/routing";
import { siteOrigin } from "~/lib/site-url";
import { TRPCReactProvider } from "~/trpc/client";
import "../globals.css";

export function generateStaticParams() {
	return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
	themeColor: "#003851",
	colorScheme: "light",
};

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
	const { locale } = await params;
	if (!hasLocale(routing.locales, locale)) {
		return {};
	}
	const t = await getTranslations({ locale, namespace: "Metadata" });
	return {
		// Canonical URLs, Open Graph images and JSON-LD are absolute on this origin.
		metadataBase: new URL(siteOrigin()),
		title: t("title"),
		description: t("description"),
	};
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
	const { locale } = await params;
	if (!hasLocale(routing.locales, locale)) {
		notFound();
	}
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "Site" });

	return (
		<html lang={locale}>
			<body className="flex min-h-dvh flex-col">
				<SkipLink label={t("skipLink")} />
				<NextIntlClientProvider>
					<TRPCReactProvider>{children}</TRPCReactProvider>
				</NextIntlClientProvider>
			</body>
		</html>
	);
}
