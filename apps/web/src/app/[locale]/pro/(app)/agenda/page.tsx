import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { NoPractice } from "~/components/pro/agenda/no-practice";
import { WeekView } from "~/components/pro/agenda/week-view";
import { ProShell } from "~/components/pro/pro-shell";
import { ProShellFallback } from "~/components/pro/pro-shell-fallback";
import type { Locale } from "~/i18n/routing";
import { NO_INDEX, resolveLocale } from "~/lib/locale";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { requireProAccess } from "~/server/auth/guard";
import { getProContext } from "~/server/pro-context";

export const instant = false;

type Props = PageProps<"/[locale]/pro/agenda">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const locale = resolveLocale((await params).locale);
	const t = await getTranslations({ locale, namespace: "Agenda.week" });
	return { title: t("metaTitle"), robots: NO_INDEX };
}

async function Week({ locale }: { locale: Locale }) {
	const access = await requireProAccess(locale, ["ready"]);
	const t = await getTranslations({ locale, namespace: "Agenda.week" });
	const { practice } = await getProContext(access.session.user.id);
	return (
		<ProShell locale={locale} current={PRO_ROUTES.agenda} title={t("title")}>
			{practice ? (
				<WeekView organizationId={practice.organizationId} isOwner={practice.isOwner} />
			) : (
				<NoPractice locale={locale} />
			)}
		</ProShell>
	);
}

export default async function AgendaPage({ params }: Props) {
	const locale = resolveLocale((await params).locale);
	setRequestLocale(locale);
	return (
		<Suspense fallback={<ProShellFallback locale={locale} />}>
			<Week locale={locale} />
		</Suspense>
	);
}
