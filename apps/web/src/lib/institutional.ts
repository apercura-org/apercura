import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { ProseContent } from "~/components/institutional";
import type { Href } from "~/i18n/navigation";
import { type Locale, routing } from "~/i18n/routing";
import { pageMetadata } from "./seo";

export type InstitutionalNamespace =
	| "AboutPage"
	| "OpenSourcePage"
	| "DataPage"
	| "AccessibilityPage"
	| "PrivacyPage"
	| "LegalPage"
	| "TermsPage";

/** The page locale from the route params, falling back to the default locale. */
export async function localeOf(params: Promise<{ locale: string }>): Promise<Locale> {
	const { locale } = await params;
	return hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
}

/** Title, description, robots (English stays noindex) and canonical of an institutional page. */
export async function institutionalMetadata(
	params: Promise<{ locale: string }>,
	namespace: InstitutionalNamespace,
	href: Href,
): Promise<Metadata> {
	const locale = await localeOf(params);
	// Every institutional namespace carries `metaTitle` and `metaDescription`.
	const t = (await getTranslations({ locale, namespace: namespace as "AboutPage" })) as (
		key: "metaTitle" | "metaDescription",
	) => string;
	return pageMetadata({
		locale,
		href,
		title: t("metaTitle"),
		description: t("metaDescription"),
		indexable: true,
	});
}

/**
 * Reads the prose sections of an institutional page. Section text is plain
 * (no ICU arguments), so it is read raw to keep the paragraph arrays.
 */
export async function proseSections(
	locale: Locale,
	namespace: InstitutionalNamespace,
): Promise<(key: string) => ProseContent> {
	const t = await getTranslations({ locale, namespace: namespace as "AboutPage" });
	// `raw` is typed for leaf keys; the sections object is read whole on purpose.
	const raw = t.raw as (key: string) => unknown;
	const sections = raw("sections") as Record<string, ProseContent>;
	return (key) => sections[key] ?? { heading: key };
}
