import { BrandLogo } from "@apercura/ui";
import { getTranslations } from "next-intl/server";
import { marketOf } from "~/i18n/locales";
import { type Href, Link } from "~/i18n/navigation";
import { type Locale, routing } from "~/i18n/routing";
import { CountryPicker } from "./country-picker";
import { LanguagePicker } from "./language-picker";

interface SiteHeaderProps {
	locale: Locale;
	/** The current page, so the language switch stays on it (with its query and, on `/rdv`, its fragment). */
	href: Href;
}

const navLink =
	"inline-flex min-h-11 items-center rounded-field px-2.5 text-meta font-medium text-ink no-underline decoration-1 underline-offset-[0.3em] hover:underline";

/**
 * The head of the form: the logo (to the market's home), navigation, then the country and the
 * language as two separate menus (a market's pages can be read in several languages, and a
 * language is not a country), closed by a hairline.
 */
export async function SiteHeader({ locale, href }: SiteHeaderProps) {
	const t = await getTranslations({ locale, namespace: "Site" });
	const tLocale = await getTranslations({ locale, namespace: "LocaleSwitcher" });
	const languages = routing.locales.filter((other) => marketOf(other) === marketOf(locale));
	const isPro = typeof href === "string" && (href === "/pro" || href.startsWith("/pro/"));
	// The picker offers the languages it is given names for: this market's only.
	const names = Object.fromEntries(
		languages.map((other) => [other, tLocale("locale", { locale: other })]),
	) as Record<Locale, string>;

	return (
		<header className="surface-paper rule-b">
			{/* On a phone the country and the language take a row of their own, under the logo. */}
			<div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center gap-x-2 px-5 py-2 sm:px-8">
				<Link
					href="/"
					aria-label={t("homeLink")}
					className="-ms-1 me-auto inline-flex min-h-11 items-center rounded-field px-1 text-ink no-underline"
				>
					<BrandLogo height={24} />
				</Link>
				<nav aria-label={t("navLabel")} className="-me-2.5 sm:me-0">
					<Link href={isPro ? "/" : "/pro"} className={navLink}>
						{isPro ? t("navPatients") : t("navPro")}
					</Link>
				</nav>
				<div className="flex items-center gap-x-1 max-sm:-ms-2.5 max-sm:basis-full sm:-me-2.5">
					<CountryPicker locale={locale} align="start" />
					{/* The languages of this market's pages only: an Austrian page has no French twin. */}
					{languages.length > 1 ? (
						<LanguagePicker
							locale={locale}
							href={href}
							label={tLocale("label")}
							currentLabel={tLocale("current", { language: names[locale] })}
							names={names}
							// The appointment page keeps its token, which lives in the fragment.
							keepHash={href === "/rdv"}
						/>
					) : null}
				</div>
			</div>
		</header>
	);
}
