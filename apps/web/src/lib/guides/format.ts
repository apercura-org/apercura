import { LOCALE_TAGS, type Locale } from "~/i18n/locales";

/** A YYYY-MM-DD date in long form, in the page's language ("25 novembre 2026"). */
export function formatGuideDate(locale: Locale, iso: string): string {
	return new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
		dateStyle: "long",
		timeZone: "UTC",
	}).format(new Date(`${iso}T00:00:00Z`));
}

/** Minutes to read a guide, at about 200 words a minute (never less than one). */
export function readingMinutes(wordCount: number): number {
	return Math.max(1, Math.round(wordCount / 200));
}
