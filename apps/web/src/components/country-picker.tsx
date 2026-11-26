import { CheckIcon } from "@apercura/ui";
import { getTranslations } from "next-intl/server";
import { type MarketCountry, marketOf } from "~/i18n/locales";
import type { Locale } from "~/i18n/routing";
import { marketHomes } from "~/lib/market-homes";
import { HeaderMenu } from "./header-menu";
import { HEADER_MENU_ITEM } from "./header-menu-item";

/**
 * The country menu of the header: the open markets, each a plain link to its home, in the
 * visitor's language where that market offers it (`marketLocaleFor`). A choice of its own beside
 * the language menu: a market's pages list its own practitioners, in whatever language. Printed
 * by the server; it only borrows the header menu's disclosure.
 */
export async function CountryPicker({
	locale,
	align,
	className,
}: {
	locale: Locale;
	/** "start": the menu opens under the toggle's start edge on a phone (the header's first menu there). */
	align?: "start" | "end";
	className?: string;
}) {
	const t = await getTranslations({ locale, namespace: "CountrySwitcher" });
	const tSearch = await getTranslations({ locale, namespace: "Search" });
	const here = marketOf(locale);
	const name = (country: MarketCountry) => tSearch(`markets.${country}`);

	return (
		<HeaderMenu
			label={t("label")}
			toggleLabel={t("current", { country: name(here) })}
			caption={t("label")}
			current={name(here)}
			align={align}
			className={className}
		>
			{marketHomes(locale).map((market) => (
				<li key={market.country}>
					<a
						href={market.href}
						hrefLang={market.locale}
						aria-current={market.country === here ? "true" : undefined}
						className={HEADER_MENU_ITEM}
					>
						{name(market.country)}
						{market.country === here ? <CheckIcon className="size-4 text-stamp" /> : null}
					</a>
				</li>
			))}
		</HeaderMenu>
	);
}
