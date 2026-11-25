import { linkStyles } from "@apercura/ui";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { PrintButton } from "~/components/pro/print-button";
import { ProShellFallback } from "~/components/pro/pro-shell-fallback";
import { QrCode } from "~/components/pro/qr-code";
import { Link, redirect } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { NO_INDEX, resolveLocale } from "~/lib/locale";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { publicPageUrl } from "~/lib/share";
import { requireProAccess } from "~/server/auth/guard";
import { ownedPage } from "~/server/owned-page";
import { caller } from "~/trpc/server";

export const instant = false;

type Props = PageProps<"/[locale]/pro/partager/affiche">;

const FORMATS = ["a4", "a5"] as const;
type Format = (typeof FORMATS)[number];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const locale = resolveLocale((await params).locale);
	const t = await getTranslations({ locale, namespace: "Share.poster" });
	return { title: t("metaTitle"), robots: NO_INDEX };
}

/**
 * The waiting-room poster: the practitioner's name, what patients can do (book online when the
 * agenda is open, otherwise find the page), the QR code and the address. Printed by the browser
 * (A4 or A5 print stylesheet in globals.css): no PDF service, nothing leaves the server. In
 * French, the language of the patients who read it, whatever the space's own language.
 */
async function Poster({ locale, format }: { locale: Locale; format: Format }) {
	const access = await requireProAccess(locale, ["ready"]);
	const t = await getTranslations({ locale, namespace: "Share.poster" });
	const tPrint = await getTranslations({ locale: "fr", namespace: "Share.poster.sheet" });
	const page = await ownedPage(access.session.user.id, locale);
	if (!page) return redirect({ href: PRO_ROUTES.share, locale });
	const stats = await caller.stats.page({ organizationId: page.organizationId });
	const bookingOpen = stats.completion.items.some((item) => item.key === "booking" && item.done);
	const url = publicPageUrl(page.data.practitioner.slug);
	const shown = url.replace(/^https?:\/\//, "");
	const identity = await ownedPage(access.session.user.id, "fr");

	return (
		<main
			id="main"
			tabIndex={-1}
			className="poster-page flex-1 bg-paper-shade px-5 py-8 outline-none sm:px-8"
		>
			<div className="mx-auto flex max-w-3xl flex-col gap-6">
				<div className="flex flex-col gap-4 print:hidden">
					<h1 className="type-headline text-ink">{t("title")}</h1>
					<p className="max-w-[60ch] text-body text-ink">{t("lead")}</p>
					<nav aria-label={t("formatsLabel")}>
						<ul className="flex flex-wrap gap-x-5">
							{FORMATS.map((item) => (
								<li key={item}>
									<Link
										href={{ pathname: PRO_ROUTES.sharePoster, query: { format: item } }}
										aria-current={item === format ? "page" : undefined}
										className={`${linkStyles()} inline-flex min-h-11 items-center aria-[current=page]:font-semibold aria-[current=page]:decoration-2`}
									>
										{t(item)}
									</Link>
								</li>
							))}
						</ul>
					</nav>
					<div className="flex flex-wrap items-center gap-4">
						<PrintButton label={t("print")} />
						<Link
							href={PRO_ROUTES.share}
							className={`${linkStyles()} inline-flex min-h-11 items-center`}
						>
							{t("back")}
						</Link>
					</div>
					<p className="max-w-[60ch] text-meta text-ink-muted">{t("printHint")}</p>
				</div>

				{/* The sheet itself, in French: patients read it in the waiting room. */}
				<article
					lang="fr"
					aria-label={t("sheetLabel")}
					className={`poster-sheet poster-${format} @container mx-auto flex aspect-[210/297] w-full max-w-[32rem] flex-col items-center justify-between border border-ink bg-paper text-center text-ink`}
				>
					<div className="flex w-full flex-col items-center gap-[2cqw] border-b border-ink px-[8cqw] pt-[6cqw] pb-[5cqw]">
						<p className="font-display text-[4.2cqw] font-semibold tracking-[0.045em] uppercase">
							{tPrint("wordmark")}
						</p>
						<h2 className="font-display text-[7.5cqw] leading-[1.05] font-semibold">
							{bookingOpen ? tPrint("headlineBooking") : tPrint("headlineFind")}
						</h2>
					</div>
					<div className="flex flex-col items-center gap-[1.5cqw] px-[8cqw] pt-[5cqw]">
						<p className="font-display text-[6.5cqw] leading-tight font-semibold">
							{identity?.identity.name ?? page.identity.name}
						</p>
						<p className="text-[4.2cqw] leading-snug">
							{identity?.identity.profession ?? page.identity.profession}
						</p>
					</div>
					<QrCode
						value={url}
						label={tPrint("qrLabel")}
						size="40cqw"
						className="shrink-0 border-0"
					/>
					<div className="flex w-full flex-col items-center gap-[1.5cqw] border-t border-ink px-[8cqw] pt-[4cqw] pb-[5cqw]">
						<p className="text-[3.8cqw] leading-snug">{tPrint("scan")}</p>
						<p className="text-[3.2cqw] break-all tabular">{shown}</p>
						<p className="text-[3.4cqw] leading-snug text-ink-muted">
							{bookingOpen ? tPrint("footBooking") : tPrint("footFind")}
						</p>
					</div>
				</article>
			</div>
		</main>
	);
}

export default async function PosterPage({ params, searchParams }: Props) {
	const locale = resolveLocale((await params).locale);
	setRequestLocale(locale);
	return (
		<Suspense fallback={<ProShellFallback locale={locale} />}>
			<WithFormat locale={locale} searchParams={searchParams} />
		</Suspense>
	);
}

async function WithFormat({
	locale,
	searchParams,
}: {
	locale: Locale;
	searchParams: Props["searchParams"];
}) {
	const value = (await searchParams).format;
	const format: Format = value === "a5" ? "a5" : "a4";
	return <Poster locale={locale} format={format} />;
}
