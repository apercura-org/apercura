import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { NotFoundPage } from "~/components/not-found-page";
import { resolveLocale } from "~/lib/locale";

/*
 * The 404 of every page under a locale: an unknown address (the catch-all listing routes call
 * notFound()) or a page that does not exist (an unknown, withheld or removed practitioner). The
 * status is decided before anything streams, so it is a real 404; Next.js adds the `noindex`
 * robots tag to every not-found answer itself.
 */

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations({
		locale: resolveLocale(await getLocale()),
		namespace: "ErrorPages.notFound",
	});
	return { title: t("metaTitle") };
}

export default async function LocaleNotFound() {
	// The layout above set the request's locale from the URL.
	return <NotFoundPage locale={resolveLocale(await getLocale())} />;
}
