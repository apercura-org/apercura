import { getTranslations } from "next-intl/server";
import { type Href, Link } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { LINKS } from "~/lib/links";

/** Pages listed on the back cover, in reading order. */
const FOOTER_LINKS = [
	{ href: "/annuaire", key: "directory" },
	{ href: "/a-propos", key: "about" },
	{ href: "/open-source", key: "openSource" },
	{ href: "/donnees", key: "data" },
	{ href: "/accessibilite", key: "accessibility" },
	{ href: "/confidentialite", key: "privacy" },
	{ href: "/mentions-legales", key: "legal" },
	{ href: "/conditions", key: "terms" },
] as const satisfies readonly { href: Href; key: string }[];

const coverLink =
	"inline-flex min-h-11 items-center text-meta text-cover-ink underline decoration-1 underline-offset-[0.25em] hover:decoration-2";

/** Back cover: a closing band with the commitments that hold for every page, and the site's pages. */
export async function SiteFooter({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "Site" });
	return (
		<footer className="surface-cover mt-auto">
			<div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
					<div className="flex flex-col gap-1">
						<p className="font-display text-title font-extrabold font-stretch-expanded">
							{t("wordmark")}
						</p>
						<p className="text-meta text-cover-muted">{t("footer.free")}</p>
						<p className="text-meta text-cover-muted">{t("footer.noAds")}</p>
					</div>
					<a href={LINKS.repository} className={coverLink}>
						{t("footer.license")}
						<span className="sr-only"> ({t("externalLink")})</span>
					</a>
				</div>
				<nav aria-label={t("footerNav.label")} className="border-t border-cover-rule pt-3">
					<ul className="grid grid-cols-1 gap-x-6 min-[420px]:grid-cols-2 md:flex md:flex-wrap">
						{FOOTER_LINKS.map((item) => (
							<li key={item.key}>
								<Link href={item.href} className={coverLink}>
									{t(`footerNav.${item.key}`)}
								</Link>
							</li>
						))}
					</ul>
				</nav>
			</div>
		</footer>
	);
}
