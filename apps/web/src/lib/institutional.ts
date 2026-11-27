import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { ProseContent } from "~/components/institutional";
import { type MarketCountry, marketOf } from "~/i18n/locales";
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
	| "TermsPage"
	| "ImpressumAt"
	| "PrivacyAt"
	| "TermsAt"
	| "AccessibilityAt"
	| "DataAt"
	| "LegalNoticeGb"
	| "PrivacyGb"
	| "TermsGb"
	| "AccessibilityGb"
	| "DataGb"
	| "LegalNoticeCz"
	| "PrivacyCz"
	| "TermsCz"
	| "AccessibilityCz"
	| "DataCz"
	| "LegalNoticeEs"
	| "PrivacyEs"
	| "TermsEs"
	| "AccessibilityEs"
	| "DataEs"
	| "LegalNoticeIt"
	| "PrivacyIt"
	| "TermsIt"
	| "AccessibilityIt"
	| "DataIt"
	| "ImpressumDe"
	| "PrivacyDe"
	| "TermsDe"
	| "AccessibilityDe"
	| "DataDe"
	| "LegalNoticeCh"
	| "PrivacyCh"
	| "TermsCh"
	| "AccessibilityCh"
	| "DataCh"
	| "LegalNoticeEe"
	| "PrivacyEe"
	| "TermsEe"
	| "AccessibilityEe"
	| "DataEe"
	| "LegalNoticePl"
	| "PrivacyPl"
	| "TermsPl"
	| "AccessibilityPl"
	| "DataPl"
	| "LegalNoticeNo"
	| "PrivacyNo"
	| "TermsNo"
	| "AccessibilityNo"
	| "DataNo"
	| "LegalNoticeIe"
	| "PrivacyIe"
	| "TermsIe"
	| "AccessibilityIe"
	| "DataIe"
	| "LegalNoticeFi"
	| "PrivacyFi"
	| "TermsFi"
	| "AccessibilityFi"
	| "DataFi"
	| "LegalNoticeLt"
	| "PrivacyLt"
	| "TermsLt"
	| "AccessibilityLt"
	| "DataLt";

/**
 * The namespace of a page in the locale's market: Austria's pages (`/at/impressum`…), the
 * UK's (`/gb/privacy`…), Czechia's (`/cz/ochrana-osobnich-udaju`…), Spain's (`/es/privacidad`…),
 * Italy's (`/it/privacy`…), Germany's (`/de/datenschutz`…), Switzerland's, Estonia's
 * (`/ee/privaatsus`…) , Norway's (`/no/personvern`…) and Ireland's (`/ie/privacy`…) and Lithuania's (`/lt/privatumas`…) have texts of their own, written for
 * their law, under the same routes as France's.
 */
export function marketNamespace(
	locale: Locale,
	namespaces: Record<MarketCountry, InstitutionalNamespace>,
): InstitutionalNamespace {
	return namespaces[marketOf(locale)];
}

/** Metadata of an institutional page whose texts depend on the market (see `marketNamespace`). */
export async function marketInstitutionalMetadata(
	params: Promise<{ locale: string }>,
	namespaces: Record<MarketCountry, InstitutionalNamespace>,
	href: Href,
): Promise<Metadata> {
	return institutionalMetadata(params, marketNamespace(await localeOf(params), namespaces), href);
}

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
