import { Badge, BrandLogo, linkStyles } from "@apercura/ui";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookletPage } from "~/components/booklet-page";
import { InstitutionalCover } from "~/components/institutional";
import { JsonLd } from "~/components/json-ld";
import { type LanguageOffer, LanguageSuggestion } from "~/components/language-suggestion";
import { ThemeSwitch } from "~/components/theme-switch";
import { serverEnv } from "~/env";
import { LOCALE_TAGS, LOCALES, marketOf, OG_LOCALES } from "~/i18n/locales";
import { getPathname, type Href } from "~/i18n/navigation";
import { LINKS } from "~/lib/links";
import { INTERNATIONAL_LOCALE, MARKETS, type Market } from "~/lib/markets";

/** The other languages a market's pages are read in (France: en, de, es, it; Austria: none). */
function languagesOf(market: Extract<Market, { status: "open" }>) {
	return LOCALES.filter(
		(locale) => locale !== market.locale && marketOf(locale) === market.country,
	);
}

import { BRAND, documentMetadata, homeAlternates, siteVerification } from "~/lib/seo";
import { apercuraSiteNodes } from "~/lib/site-entities";
import { siteOrigin } from "~/lib/site-url";
import { graph, webPageNode } from "~/lib/structured-data";

/** The pages about Apercura itself, in English (they describe it as it runs in France). */
const ABOUT_LINKS = [
	{ href: "/a-propos", key: "about" },
	{ href: "/open-source", key: "openSource" },
	{ href: "/donnees", key: "data" },
	{ href: "/accessibilite", key: "accessibility" },
	{ href: "/confidentialite", key: "privacy" },
	{ href: "/mentions-legales", key: "legal" },
	{ href: "/conditions", key: "terms" },
] as const satisfies readonly { href: Href; key: string }[];

const link = `${linkStyles()} inline-flex min-h-11 items-center text-body`;
const footerLink =
	"inline-flex min-h-11 items-center text-meta text-ink underline decoration-1 underline-offset-[0.25em] hover:decoration-2";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations({ locale: INTERNATIONAL_LOCALE, namespace: "International" });
	return {
		metadataBase: new URL(siteOrigin()),
		applicationName: BRAND,
		verification: siteVerification(serverEnv),
		...(await documentMetadata({
			url: `${siteOrigin()}/`,
			ogLocale: OG_LOCALES[INTERNATIONAL_LOCALE],
			title: t("metaTitle"),
			description: t("metaDescription"),
			robots: { index: true, follow: true },
			languages: homeAlternates(),
		})),
	};
}

/**
 * The international home: what Apercura is, the countries (France open, the others to come,
 * as plain text), and the pages about Apercura. The `x-default` of the homes' hreflang.
 */
export default async function InternationalHome() {
	setRequestLocale(INTERNATIONAL_LOCALE);
	const t = await getTranslations({ locale: INTERNATIONAL_LOCALE, namespace: "International" });
	const tSite = await getTranslations({ locale: INTERNATIONAL_LOCALE, namespace: "Site" });
	const tLocale = await getTranslations({
		locale: INTERNATIONAL_LOCALE,
		namespace: "LocaleSwitcher",
	});
	const regions = new Intl.DisplayNames([LOCALE_TAGS[INTERNATIONAL_LOCALE]], { type: "region" });
	const countryName = (code: string) => regions.of(code) ?? code;

	// The France pages in the visitor's language, offered to a browser that prefers it.
	const offers: LanguageOffer[] = await Promise.all(
		// France's interface languages; Austria (`at`, German) is linked from its country line.
		LOCALES.filter((locale) => locale !== INTERNATIONAL_LOCALE && marketOf(locale) === "FR").map(
			async (locale) => {
				const tOffer = await getTranslations({ locale, namespace: "International" });
				return {
					language: locale,
					label: tOffer("suggestion"),
					href: getPathname({ href: "/", locale }),
				};
			},
		),
	);
	const open = MARKETS.filter((market) => market.status === "open");
	const planned = MARKETS.filter((market) => market.status === "planned").sort((a, b) =>
		countryName(a.country).localeCompare(countryName(b.country), LOCALE_TAGS[INTERNATIONAL_LOCALE]),
	);

	const origin = siteOrigin();

	return (
		<>
			<JsonLd
				data={graph([
					webPageNode({
						url: `${origin}/`,
						origin,
						name: t("title"),
						description: t("metaDescription"),
						language: LOCALE_TAGS[INTERNATIONAL_LOCALE],
					}),
					// The site's home page: where Google reads the site name and the logo.
					...apercuraSiteNodes(),
				])}
			/>
			<header className="surface-paper rule-b">
				<div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-5 py-2 sm:px-8">
					<a
						href="/"
						aria-current="page"
						aria-label={tSite("wordmark")}
						className="-ms-1 inline-flex min-h-11 items-center rounded-field px-1 text-ink no-underline"
					>
						<BrandLogo height={24} />
					</a>
					<LanguageSuggestion
						offers={offers}
						pageLanguage={INTERNATIONAL_LOCALE}
						className={footerLink}
					/>
				</div>
			</header>
			<main id="main" tabIndex={-1} className="flex-1 outline-none">
				<InstitutionalCover title={t("title")} lead={t("lead")} />
				<BookletPage>
					<section aria-labelledby="countries-heading" className="flex flex-col gap-5">
						<div className="flex max-w-[65ch] flex-col gap-2">
							<h2 id="countries-heading" className="type-title text-ink">
								{t("countries.heading")}
							</h2>
							<p className="text-body text-ink">{t("countries.intro")}</p>
						</div>
						<ul className="flex flex-col border-t border-rule-soft">
							{open.map((market) => (
								<li
									key={market.country}
									className="flex flex-col gap-1 border-b border-rule-soft py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
								>
									<div className="flex flex-wrap items-baseline gap-3">
										<a
											href={getPathname({ href: "/", locale: market.locale })}
											hrefLang={LOCALE_TAGS[market.locale]}
											className={`${linkStyles()} inline-flex min-h-11 items-center type-subtitle`}
										>
											{t("countries.enter", { country: countryName(market.country) })}
										</a>
										<Badge tone="ink">{t("countries.open")}</Badge>
									</div>
									{languagesOf(market).length > 0 ? (
										<p className="text-meta text-ink-muted">
											{t("countries.alsoIn")}{" "}
											{languagesOf(market).map((locale, index) => (
												<span key={locale}>
													{index > 0 ? ", " : null}
													<a
														href={getPathname({ href: "/", locale })}
														lang={locale}
														hrefLang={locale}
														className={footerLink}
													>
														{tLocale("locale", { locale })}
													</a>
												</span>
											))}
										</p>
									) : null}
								</li>
							))}
							{planned.map((market) => (
								<li
									key={market.country}
									className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-rule-soft py-4"
								>
									<span className="type-subtitle text-ink">{countryName(market.country)}</span>
									<span className="text-meta text-ink-muted">{t("countries.soon")}</span>
								</li>
							))}
						</ul>
					</section>

					<section aria-labelledby="principles-heading" className="flex flex-col gap-4">
						<h2 id="principles-heading" className="type-title text-ink">
							{t("principles.heading")}
						</h2>
						<ul className="flex max-w-[65ch] list-disc flex-col gap-2 ps-5 text-body text-ink">
							{(t.raw("principles.list") as string[]).map((item) => (
								<li key={item}>{item}</li>
							))}
						</ul>
					</section>

					<section aria-labelledby="more-heading" className="flex flex-col gap-4">
						<div className="flex max-w-[65ch] flex-col gap-2">
							<h2 id="more-heading" className="type-title text-ink">
								{t("more.heading")}
							</h2>
							<p className="text-body text-ink">{t("more.intro")}</p>
						</div>
						<ul className="grid grid-cols-1 gap-x-6 min-[420px]:grid-cols-2 md:grid-cols-3">
							{ABOUT_LINKS.map((item) => (
								<li key={item.key}>
									<a
										href={getPathname({ href: item.href, locale: INTERNATIONAL_LOCALE })}
										className={link}
									>
										{tSite(`footerNav.${item.key}`)}
									</a>
								</li>
							))}
						</ul>
					</section>
				</BookletPage>
			</main>
			<footer className="surface-paper rule-t mt-auto">
				<div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:px-8">
					<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
						<div className="flex flex-col gap-1">
							<p className="type-wordmark">{tSite("wordmark")}</p>
							<p className="text-meta text-ink-muted">{tSite("footer.free")}</p>
							<p className="text-meta text-ink-muted">{tSite("footer.noAds")}</p>
						</div>
						<a href={LINKS.repository} className={footerLink}>
							{tSite("footer.license")}
							<span className="sr-only"> ({tSite("externalLink")})</span>
						</a>
					</div>
					<ThemeSwitch
						label={tSite("theme.label")}
						names={{
							light: tSite("theme.light"),
							dark: tSite("theme.dark"),
							system: tSite("theme.system"),
						}}
						className="border-t border-rule-soft pt-4"
					/>
				</div>
			</footer>
		</>
	);
}
