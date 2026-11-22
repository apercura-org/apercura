import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { messagesFor } from "./catalogs";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
	const requested = await requestLocale;
	const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
	// English is the source catalog and the fallback for keys missing in other locales.
	return { locale, messages: messagesFor(locale) };
});
