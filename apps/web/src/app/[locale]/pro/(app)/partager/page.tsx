import { slugify } from "@apercura/core";
import { buttonStyles, EmptyState, linkStyles, Notice } from "@apercura/ui";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { ProShell } from "~/components/pro/pro-shell";
import { ProShellFallback } from "~/components/pro/pro-shell-fallback";
import { ShareKit } from "~/components/pro/share-kit";
import { Link } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { BADGE_HEIGHT, BADGE_WIDTH, badgeFile } from "~/lib/badge";
import { NO_INDEX, resolveLocale } from "~/lib/locale";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { publicPageUrl } from "~/lib/share";
import { siteOrigin } from "~/lib/site-url";
import { requireProAccess } from "~/server/auth/guard";
import { ownedPage } from "~/server/owned-page";

export const instant = false;

type Props = PageProps<"/[locale]/pro/partager">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const locale = resolveLocale((await params).locale);
	const t = await getTranslations({ locale, namespace: "Share" });
	return { title: t("metaTitle"), robots: NO_INDEX };
}

async function Share({ locale }: { locale: Locale }) {
	const access = await requireProAccess(locale, ["ready"]);
	const t = await getTranslations({ locale, namespace: "Share" });
	const tEditor = await getTranslations({ locale, namespace: "Editor" });
	const tBadge = await getTranslations({ locale, namespace: "Share.badge" });
	const page = await ownedPage(access.session.user.id, locale);
	if (!page) {
		return (
			<ProShell locale={locale} current={PRO_ROUTES.share} title={t("title")}>
				<EmptyState
					title={tEditor("empty.title")}
					description={tEditor("empty.body")}
					action={
						<Link href={PRO_ROUTES.claimStart} className={buttonStyles({ intent: "ink" })}>
							{tEditor("empty.action")}
						</Link>
					}
				/>
			</ProShell>
		);
	}
	const url = publicPageUrl(page.data.practitioner.slug);
	return (
		<ProShell
			locale={locale}
			current={PRO_ROUTES.share}
			title={t("title")}
			lead={t("lead", { name: page.identity.name })}
		>
			{page.data.removedByOwner ? (
				<Notice tone="info" title={t("removedTitle")} role="none">
					{t("removedBody")}
				</Notice>
			) : page.data.publishedAt ? null : (
				<Notice tone="info" title={t("unpublishedTitle")} role="none">
					<span className="flex flex-col gap-2">
						<span>{t("unpublishedBody")}</span>
						<Link href={PRO_ROUTES.pageEditor} className={linkStyles()}>
							{t("unpublishedLink")}
						</Link>
					</span>
				</Notice>
			)}
			<ShareKit
				url={url}
				badgeUrl={`${siteOrigin()}/badges/${badgeFile(locale)}`}
				badgeAlt={`${tBadge("lead")} ${tBadge("brand")}`}
				badgeWidth={BADGE_WIDTH}
				badgeHeight={BADGE_HEIGHT}
				fileStem={`apercura-${slugify(page.identity.name) || page.identity.rpps}`}
			/>
			<section aria-labelledby="share-poster" className="flex max-w-2xl flex-col gap-4">
				<h2 id="share-poster" className="type-title text-ink">
					{t("posterHeading")}
				</h2>
				<p className="text-body text-ink">{t("posterLead")}</p>
				<ul className="flex flex-wrap gap-3">
					{(["a4", "a5"] as const).map((format) => (
						<li key={format}>
							<Link
								href={{ pathname: PRO_ROUTES.sharePoster, query: { format } }}
								className={buttonStyles({ intent: "ink" })}
							>
								{t(`poster.${format}`)}
							</Link>
						</li>
					))}
				</ul>
			</section>
		</ProShell>
	);
}

export default async function SharePage({ params }: Props) {
	const locale = resolveLocale((await params).locale);
	setRequestLocale(locale);
	return (
		<Suspense fallback={<ProShellFallback locale={locale} />}>
			<Share locale={locale} />
		</Suspense>
	);
}
