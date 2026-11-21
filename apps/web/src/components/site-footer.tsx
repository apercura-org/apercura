import { getTranslations } from "next-intl/server";
import type { Locale } from "~/i18n/routing";

const REPOSITORY_URL = "https://github.com/maxgfr/apercura";

/** Back cover: a closing band with the commitments that hold for every page. */
export async function SiteFooter({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "Site" });
	return (
		<footer className="surface-cover mt-auto">
			<div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-end sm:justify-between sm:px-8">
				<div className="flex flex-col gap-1">
					<p className="font-display text-title font-extrabold font-stretch-expanded">
						{t("wordmark")}
					</p>
					<p className="text-meta text-cover-muted">{t("footer.free")}</p>
					<p className="text-meta text-cover-muted">{t("footer.noAds")}</p>
				</div>
				<a
					href={REPOSITORY_URL}
					className="inline-flex min-h-11 items-center text-meta text-cover-ink underline decoration-1 underline-offset-[0.25em] hover:decoration-2"
				>
					{t("footer.license")}
					<span className="sr-only"> ({t("externalLink")})</span>
				</a>
			</div>
		</footer>
	);
}
