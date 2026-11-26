"use client";

import { useLocale, useMessages } from "next-intl";
import { ErrorView, errorDigest } from "~/components/error-view";
import type { Messages } from "~/i18n/catalogs";
import { LOCALE_PREFIXES, type Locale } from "~/i18n/locales";

/**
 * A page that failed to render, under its locale's layout (which stays: its <html>, theme and
 * messages). The strings come from the layout's messages (`ErrorPages.error`), read as they
 * are: this boundary loads with every page, so it leaves the message formatter out.
 */
export default function LocaleError({ error, retry }: { error: unknown; retry: () => void }) {
	const messages = useMessages() as Pick<Messages, "ErrorPages" | "Site">;
	const locale = useLocale() as Locale;
	return (
		<ErrorView
			text={messages.ErrorPages.error}
			retry={retry}
			digest={errorDigest(error)}
			home={LOCALE_PREFIXES[locale]}
			homeLabel={messages.Site.homeLink}
		/>
	);
}
