import { getTranslations } from "next-intl/server";
import { type Href, Link } from "~/i18n/navigation";
import { type Locale, routing } from "~/i18n/routing";
import { LocaleSwitchLink } from "./locale-switch-link";

interface SiteHeaderProps {
	locale: Locale;
	/** The current page, so the language switch stays on it (with its query and, on `/rdv`, its fragment). */
	href: Href;
	/** The home page prints the wordmark large in the band; other pages print it here. */
	showWordmark?: boolean;
}

const navLink =
	"inline-flex min-h-11 items-center rounded-field px-1 text-meta text-cover-ink underline decoration-1 underline-offset-[0.25em] hover:decoration-2";

/** Running head printed at the top of every cover band: wordmark or title line, navigation, language. */
export async function SiteHeader({ locale, href, showWordmark = true }: SiteHeaderProps) {
	const t = await getTranslations({ locale, namespace: "Site" });
	const tLocale = await getTranslations({ locale, namespace: "LocaleSwitcher" });
	const isPro = typeof href === "string" && (href === "/pro" || href.startsWith("/pro/"));

	return (
		<header className="border-b border-cover-rule">
			<div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-5 py-1.5 sm:px-8">
				{showWordmark ? (
					<Link
						href="/"
						aria-label={t("homeLink")}
						className="inline-flex min-h-11 items-center font-display text-lead font-extrabold tracking-[-0.01em] text-cover-ink no-underline font-stretch-expanded"
					>
						{t("wordmark")}
					</Link>
				) : (
					// The home page prints the wordmark in the band; the running head lives on the booklet page.
					<span />
				)}
				<div className="flex flex-wrap items-center gap-x-5">
					<nav aria-label={t("navLabel")}>
						<Link href={isPro ? "/" : "/pro"} className={navLink}>
							{isPro ? t("navPatients") : t("navPro")}
						</Link>
					</nav>
					<nav aria-label={tLocale("label")}>
						<ul className="flex items-center gap-1">
							{routing.locales.map((other) => (
								<li key={other}>
									<LocaleSwitchLink
										href={href}
										locale={other}
										// The appointment page keeps its token, which lives in the fragment.
										keepHash={href === "/rdv"}
										hrefLang={other}
										lang={other}
										aria-current={other === locale ? "true" : undefined}
										className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-field px-2 text-meta text-cover-ink no-underline hover:underline aria-[current]:font-bold aria-[current]:underline aria-[current]:decoration-2 aria-[current]:underline-offset-[0.25em]"
									>
										{tLocale("locale", { locale: other })}
									</LocaleSwitchLink>
								</li>
							))}
						</ul>
					</nav>
				</div>
			</div>
		</header>
	);
}
