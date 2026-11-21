import { buttonStyles, EmptyState } from "@apercura/ui";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { PageEditor } from "~/components/pro/page-editor";
import { ProShell } from "~/components/pro/pro-shell";
import { ProShellFallback } from "~/components/pro/pro-shell-fallback";
import { Link } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { NO_INDEX, resolveLocale } from "~/lib/locale";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { requireProAccess } from "~/server/auth/guard";
import { ownedPage } from "~/server/owned-page";

export const instant = false;

type Props = PageProps<"/[locale]/pro/page">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const locale = resolveLocale((await params).locale);
	const t = await getTranslations({ locale, namespace: "Editor" });
	return { title: t("metaTitle"), robots: NO_INDEX };
}

async function Editor({ locale }: { locale: Locale }) {
	const access = await requireProAccess(locale, ["ready"]);
	const t = await getTranslations({ locale, namespace: "Editor" });
	const page = await ownedPage(access.session.user.id, locale);
	return (
		<ProShell
			locale={locale}
			current={PRO_ROUTES.pageEditor}
			title={t("title")}
			lead={page ? t("lead", { name: page.identity.name }) : undefined}
		>
			{page ? (
				<PageEditor
					organizationId={page.organizationId}
					data={page.data}
					identity={page.identity}
					canRemovePage={page.isOwner}
				/>
			) : (
				<EmptyState
					title={t("empty.title")}
					description={t("empty.body")}
					action={
						<Link href={PRO_ROUTES.claimStart} className={buttonStyles({ intent: "ink" })}>
							{t("empty.action")}
						</Link>
					}
				/>
			)}
		</ProShell>
	);
}

export default async function PageEditorPage({ params }: Props) {
	const locale = resolveLocale((await params).locale);
	setRequestLocale(locale);
	return (
		<Suspense fallback={<ProShellFallback locale={locale} />}>
			<Editor locale={locale} />
		</Suspense>
	);
}
