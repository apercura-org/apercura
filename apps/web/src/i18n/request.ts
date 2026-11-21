import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import en from "../../messages/en.json";
import { routing } from "./routing";

type Messages = Record<string, unknown>;

const isObject = (value: unknown): value is Messages =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** Recursively overlays `override` on `base`, so missing keys fall back to `base`. */
function mergeMessages(base: Messages, override: Messages): Messages {
	const result: Messages = { ...base };
	for (const [key, value] of Object.entries(override)) {
		const baseValue = base[key];
		result[key] = isObject(baseValue) && isObject(value) ? mergeMessages(baseValue, value) : value;
	}
	return result;
}

export default getRequestConfig(async ({ requestLocale }) => {
	const requested = await requestLocale;
	const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

	// English is the source catalog and the fallback for keys missing in other locales.
	const messages =
		locale === "en"
			? en
			: mergeMessages(en, (await import(`../../messages/${locale}.json`)).default as Messages);

	return { locale, messages };
});
