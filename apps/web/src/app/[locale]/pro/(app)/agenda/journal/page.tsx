import { EmptyState } from "@apercura/ui";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { AccessLog } from "~/components/pro/agenda/access-log";
import { NoPractice } from "~/components/pro/agenda/no-practice";
import { ProShell } from "~/components/pro/pro-shell";
import { ProShellFallback } from "~/components/pro/pro-shell-fallback";
import type { Locale } from "~/i18n/routing";
import { NO_INDEX, resolveLocale } from "~/lib/locale";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { requireProAccess } from "~/server/auth/guard";
import { getProContext } from "~/server/pro-context";

export const instant = false;

type Props = PageProps<"/[locale]/pro/agenda/journal">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const locale = resolveLocale((await params).locale);
	const t = await getTranslations({ locale, namespace: "Agenda.log" });
	return { title: t("metaTitle"), robots: NO_INDEX };
}

async function Log({ locale }: { locale: Locale }) {
	const access = await requireProAccess(locale, ["ready"]);
	const t = await getTranslations({ locale, namespace: "Agenda.log" });
	const { practice } = await getProContext(access.session.user.id);
	return (
		<ProShell locale={locale} current={PRO_ROUTES.accessLog} title={t("title")} lead={t("lead")}>
			{!practice ? (
				<NoPractice locale={locale} />
			) : practice.isOwner ? (
				<AccessLog organizationId={practice.organizationId} />
			) : (
				<EmptyState title={t("ownerOnly.title")} description={t("ownerOnly.body")} />
			)}
		</ProShell>
	);
}

export default async function AccessLogPage({ params }: Props) {
	const locale = resolveLocale((await params).locale);
	setRequestLocale(locale);
	return (
		<Suspense fallback={<ProShellFallback locale={locale} />}>
			<Log locale={locale} />
		</Suspense>
	);
}
