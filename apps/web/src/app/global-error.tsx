"use client";

import { usePathname } from "next/navigation";
import { lazy, Suspense, useLayoutEffect } from "react";
import { globalErrorDocument } from "~/lib/global-error-locale";
import { THEME_STORAGE_KEY } from "~/lib/theme";
import { fontVariables } from "./fonts";
import "./globals.css";

/*
 * Next.js loads this boundary with every page: its view, with the text of every language, is
 * fetched only when a root layout fails. Should that fetch fail too (the site redeployed under
 * the visitor), the page still links home.
 */
const GlobalErrorView = lazy(() =>
	import("~/components/global-error-view").catch(() => ({
		default: ({ home }: { home: string }) => (
			<main id="main" className="p-8">
				<a href={home} className="link-base text-body">
					Apercura
				</a>
			</main>
		),
	})),
);

/**
 * The stored theme, applied again: this page replaces the root layout's <html>, and with it
 * the `data-theme` that /theme.js set there.
 */
function useStoredTheme() {
	useLayoutEffect(() => {
		try {
			const theme = localStorage.getItem(THEME_STORAGE_KEY);
			if (theme === "light" || theme === "dark") {
				document.documentElement.setAttribute("data-theme", theme);
			}
		} catch {
			// Storage disabled: the system's theme applies.
		}
	}, []);
}

/**
 * What a visitor sees when a root layout itself fails: a document of its own, with the site's
 * styles and font, and nothing from the layout (no messages provider, no header). Its text is
 * the catalogs' `ErrorPages.error` (~/lib/global-error-text), in the language of the URL.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
	const { lang, language, home } = globalErrorDocument(usePathname());
	useStoredTheme();

	return (
		<html
			lang={lang}
			className={fontVariables}
			data-astryx-theme="apercura"
			suppressHydrationWarning
		>
			<head>
				<meta name="robots" content="noindex" />
			</head>
			<body className="flex min-h-dvh flex-col">
				<Suspense>
					<GlobalErrorView language={language} home={home} error={error} retry={retry} />
				</Suspense>
			</body>
		</html>
	);
}
