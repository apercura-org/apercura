import { BookletSearch, linkStyles, Stamp, StampFoot } from "@apercura/ui";
import { getTranslations } from "next-intl/server";
import { MARKET_COUNTRIES, marketOf, marketSegment } from "~/i18n/locales";
import { getPathname, type Href, Link } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { PublicPage } from "./public-page";

/** Where a lost visitor can start again, in reading order. */
const WAYS_IN = [
	{ href: "/", key: "home" },
	{ href: "/annuaire", key: "directory" },
] as const satisfies readonly { href: Href; key: string }[];

/**
 * The 404 of a market's pages, in its locale: the header and footer of every page, the reason in
 * a sentence, the search (the plain GET form of the home, which ships no JavaScript: Next.js
 * sends a segment's not-found UI with every page under it), an outlined stamp with nothing to
 * claim, and the ways back in as ruled rows.
 */
export async function NotFoundPage({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "ErrorPages.notFound" });
	const tSearch = await getTranslations({ locale, namespace: "Search" });

	return (
		<PublicPage locale={locale} href="/">
			{/*
			 * A 404 decided before the page streams reaches the browser as data and is rendered there,
			 * where the layout's /theme.js never runs: loaded again here (async, so React inserts and
			 * runs it), it applies the stored theme and shows the theme control.
			 */}
			<script async src="/theme.js" />
			<div className="rule-double-b">
				<div className="mx-auto grid w-full max-w-6xl gap-x-8 gap-y-10 px-5 pt-10 pb-12 sm:px-8 sm:pt-14 lg:grid-cols-12 lg:pt-16 lg:pb-16">
					<div className="flex flex-col gap-8 lg:col-span-8">
						<div className="flex flex-col gap-4">
							<h1 className="type-display text-balance">{t("title")}</h1>
							<p className="max-w-[52ch] text-lead text-ink-muted">{t("body")}</p>
						</div>
						<BookletSearch
							idPrefix="not-found-search"
							action={getPathname({ href: "/recherche", locale })}
							label={tSearch("label")}
							submitLabel={tSearch("submit")}
							fields={[
								{ name: "quoi", label: tSearch("who"), hint: tSearch("whoHint") },
								{
									name: "ou",
									label: tSearch("where"),
									hint: tSearch("whereHint"),
									autoComplete: "address-level2",
								},
							]}
							select={{
								name: "pays",
								label: tSearch("market"),
								defaultValue: marketSegment(marketOf(locale)),
								options: MARKET_COUNTRIES.map((country) => ({
									value: marketSegment(country),
									label: tSearch(`markets.${country}`),
								})),
							}}
						/>
					</div>
					<div className="lg:col-span-4 lg:border-s lg:border-rule-soft lg:ps-8">
						<Stamp ink="outlined" className="w-full sm:max-w-[22rem] lg:max-w-none">
							<div className="flex flex-col gap-1 px-4 pt-3 pb-3.5 sm:px-5 sm:pt-4">
								<p className="type-display tabular" aria-hidden="true">
									404
								</p>
								<p className="text-lead text-balance">{t("stamp")}</p>
							</div>
							<StampFoot>
								<span>{t("code")}</span>
							</StampFoot>
						</Stamp>
					</div>
				</div>
			</div>
			<div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
				<section aria-labelledby="ways-in-heading" className="flex flex-col gap-4 lg:w-2/3">
					<h2 id="ways-in-heading" className="type-title text-ink">
						{t("nextHeading")}
					</h2>
					<ul className="flex flex-col border-t border-ink">
						{WAYS_IN.map((item) => (
							<li key={item.key} className="border-b border-rule-soft">
								<Link
									href={item.href}
									className={`${linkStyles()} flex min-h-12 items-center py-2 text-body font-semibold`}
								>
									{t(item.key)}
								</Link>
							</li>
						))}
					</ul>
				</section>
			</div>
		</PublicPage>
	);
}
