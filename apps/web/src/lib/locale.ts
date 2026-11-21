import { hasLocale } from "next-intl";
import { type Locale, routing } from "~/i18n/routing";

/** The route's locale, or the default one for anything unknown. */
export function resolveLocale(requested: string): Locale {
	return hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
}

/** Practitioner-space pages are personal: never indexed, never followed. */
export const NO_INDEX = { index: false, follow: false } as const;
