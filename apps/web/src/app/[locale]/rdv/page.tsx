import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { ManageAppointment } from "~/components/booking/manage-appointment";
import { BookletPage } from "~/components/booklet-page";
import { PublicPage } from "~/components/public-page";
import { NO_INDEX, resolveLocale } from "~/lib/locale";

/*
 * `/rdv#t={token}`: a patient manages an appointment from the email link. The token lives in the
 * URL fragment, which browsers never send, so it never reaches the server or its logs; the page
 * reads it in the browser and posts it to `booking.manage.*`. Nothing here changes on GET (mail
 * scanners open links on their own). No referrer leaves the page (meta below, header in
 * next.config.ts) and it loads no third-party script.
 */

export async function generateMetadata({ params }: PageProps<"/[locale]/rdv">): Promise<Metadata> {
	const locale = resolveLocale((await params).locale);
	const t = await getTranslations({ locale, namespace: "booking.manage" });
	return { title: t("metaTitle"), robots: NO_INDEX, referrer: "no-referrer" };
}

/** Rendered per request (personal page, never cached by a CDN). */
async function Dynamic() {
	await connection();
	return <ManageAppointment />;
}

export default async function ManagePage({ params }: PageProps<"/[locale]/rdv">) {
	const locale = resolveLocale((await params).locale);
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "booking.manage" });
	return (
		<PublicPage locale={locale} href="/rdv">
			<BookletPage runningHead={t("runningHead")}>
				<div className="flex max-w-3xl flex-col gap-8">
					<h1 className="type-headline text-ink">{t("title")}</h1>
					<Suspense fallback={<p className="text-body text-ink">{t("loading")}</p>}>
						<Dynamic />
					</Suspense>
				</div>
			</BookletPage>
		</PublicPage>
	);
}
