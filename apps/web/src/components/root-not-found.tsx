import { BrandLogo, linkStyles } from "@apercura/ui";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { fontVariables } from "~/app/fonts";
import { LOCALE_PREFIXES, LOCALE_TAGS } from "~/i18n/locales";
import { INTERNATIONAL_LOCALE, MARKETS } from "~/lib/markets";
import "~/app/globals.css";

/*
 * The 404 of an address outside every locale (`/missing.txt`, whose first segment is no
 * locale, so the locales' layout itself answers notFound()): a document of its own, as no
 * layout renders around it. Pages under a locale have theirs (app/[locale]/not-found.tsx), and
 * unprefixed page paths redirect to France's before they get here. In English, the
 * international home's language, with the open markets to choose from. Next.js answers it
 * with 404 and `noindex`. Used by app/not-found.tsx and app/global-not-found.tsx.
 */

export async function rootNotFoundMetadata(): Promise<Metadata> {
	const t = await getTranslations({
		locale: INTERNATIONAL_LOCALE,
		namespace: "ErrorPages.notFound",
	});
	return { title: t("metaTitle") };
}

const row = `${linkStyles()} flex min-h-12 items-center py-2 text-body font-semibold`;

export async function RootNotFound() {
	const t = await getTranslations({
		locale: INTERNATIONAL_LOCALE,
		namespace: "ErrorPages.notFound",
	});
	const tSite = await getTranslations({ locale: INTERNATIONAL_LOCALE, namespace: "Site" });
	const regions = new Intl.DisplayNames([LOCALE_TAGS[INTERNATIONAL_LOCALE]], { type: "region" });
	const open = MARKETS.flatMap((market) => (market.status === "open" ? [market] : []));

	return (
		<html lang={INTERNATIONAL_LOCALE} className={fontVariables} suppressHydrationWarning>
			<body className="flex min-h-dvh flex-col">
				{/*
				 * The stored colour theme (~/lib/theme), hoisted into <head> by React. Async: this 404
				 * is usually rendered by the browser from the page's data, where only a script React
				 * inserts itself runs.
				 */}
				<script async src="/theme.js" />
				<header className="surface-paper rule-b">
					<div className="mx-auto flex min-h-16 max-w-6xl items-center px-5 py-2 sm:px-8">
						<a
							href="/"
							aria-label={tSite("homeLink")}
							className="-ms-1 inline-flex min-h-11 items-center rounded-field px-1 text-ink no-underline"
						>
							<BrandLogo height={24} />
						</a>
					</div>
				</header>
				<main id="main" className="flex-1">
					<div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 pt-10 pb-14 sm:px-8 sm:pt-14 lg:pt-16">
						<div className="flex flex-col gap-4 lg:w-2/3">
							<h1 className="type-display text-balance">{t("title")}</h1>
							<p className="max-w-[52ch] text-lead text-ink-muted">{t("rootBody")}</p>
						</div>
						<ul className="flex flex-col border-t border-ink lg:w-2/3">
							{open.map((market) => (
								<li key={market.country} className="border-b border-rule-soft">
									<a href={LOCALE_PREFIXES[market.locale]} className={row}>
										{regions.of(market.country) ?? market.country}
									</a>
								</li>
							))}
							<li className="border-b border-rule-soft">
								<a href="/" className={row}>
									{t("international")}
								</a>
							</li>
						</ul>
					</div>
				</main>
			</body>
		</html>
	);
}
