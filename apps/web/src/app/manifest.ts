import type { MetadataRoute } from "next";
import { getTranslations } from "next-intl/server";
import { routing } from "~/i18n/routing";
import { PAPER_COLOR, THEME_COLOR } from "~/lib/seo";

/** Web app manifest: name, colours and icons (the site is French first). */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
	const t = await getTranslations({ locale: routing.defaultLocale, namespace: "Metadata" });
	return {
		name: t("homeTitle"),
		short_name: t("title"),
		description: t("description"),
		lang: "fr-FR",
		start_url: "/",
		display: "browser",
		background_color: PAPER_COLOR,
		theme_color: THEME_COLOR,
		icons: [
			{ src: "/icon/192", sizes: "192x192", type: "image/png" },
			{ src: "/icon/512", sizes: "512x512", type: "image/png" },
		],
	};
}
