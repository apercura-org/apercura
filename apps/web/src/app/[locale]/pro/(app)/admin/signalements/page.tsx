import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { AdminReports } from "~/components/pro/admin-reports";
import { ProShell } from "~/components/pro/pro-shell";
import { ProShellFallback } from "~/components/pro/pro-shell-fallback";
import type { Locale } from "~/i18n/routing";
import { NO_INDEX, resolveLocale } from "~/lib/locale";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { requirePlatformAdminPage } from "~/server/auth/admin-guard";
import { HydrateClient, prefetch, trpc } from "~/trpc/server";

export const instant = false;

type Props = PageProps<"/[locale]/pro/admin/signalements">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const locale = resolveLocale((await params).locale);
	const t = await getTranslations({ locale, namespace: "Admin" });
	return { title: t("reports.metaTitle"), robots: NO_INDEX };
}

async function Reports({ locale }: { locale: Locale }) {
	await requirePlatformAdminPage(locale);
	const t = await getTranslations({ locale, namespace: "Admin" });
	prefetch(trpc.admin.removals.queue.queryOptions());
	prefetch(trpc.admin.reports.queue.queryOptions({ status: "open" }));
	return (
		<ProShell
			locale={locale}
			current={PRO_ROUTES.adminReports}
			title={t("reports.title")}
			lead={t("reports.lead")}
		>
			<HydrateClient>
				<AdminReports />
			</HydrateClient>
		</ProShell>
	);
}

export default async function AdminReportsPage({ params }: Props) {
	const locale = resolveLocale((await params).locale);
	setRequestLocale(locale);
	return (
		<Suspense fallback={<ProShellFallback locale={locale} />}>
			<Reports locale={locale} />
		</Suspense>
	);
}
