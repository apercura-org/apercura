import { buttonStyles, EmptyState } from "@apercura/ui";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { AgendaSettings } from "~/components/pro/agenda/agenda-settings";
import { NoPractice } from "~/components/pro/agenda/no-practice";
import { ProShell } from "~/components/pro/pro-shell";
import { ProShellFallback } from "~/components/pro/pro-shell-fallback";
import { Link } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { NO_INDEX, resolveLocale } from "~/lib/locale";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { requireProAccess } from "~/server/auth/guard";
import { getProContext } from "~/server/pro-context";

export const instant = false;

type Props = PageProps<"/[locale]/pro/agenda/reglages">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const locale = resolveLocale((await params).locale);
	const t = await getTranslations({ locale, namespace: "Agenda.settings" });
	return { title: t("metaTitle"), robots: NO_INDEX };
}

async function Settings({ locale }: { locale: Locale }) {
	const access = await requireProAccess(locale, ["ready"]);
	const t = await getTranslations({ locale, namespace: "Agenda.settings" });
	const { practice } = await getProContext(access.session.user.id);
	return (
		<ProShell
			locale={locale}
			current={PRO_ROUTES.agendaSettings}
			title={t("title")}
			lead={t("lead")}
		>
			{!practice ? (
				<NoPractice locale={locale} />
			) : practice.isOwner ? (
				<AgendaSettings organizationId={practice.organizationId} />
			) : (
				<EmptyState
					title={t("ownerOnly.title")}
					description={t("ownerOnly.body")}
					action={
						<Link href={PRO_ROUTES.agenda} className={buttonStyles({ intent: "ink" })}>
							{t("ownerOnly.action")}
						</Link>
					}
				/>
			)}
		</ProShell>
	);
}

export default async function AgendaSettingsPage({ params }: Props) {
	const locale = resolveLocale((await params).locale);
	setRequestLocale(locale);
	return (
		<Suspense fallback={<ProShellFallback locale={locale} />}>
			<Settings locale={locale} />
		</Suspense>
	);
}
