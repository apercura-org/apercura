import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { AdminContacts } from "~/components/pro/admin-contacts";
import { ProShell } from "~/components/pro/pro-shell";
import { ProShellFallback } from "~/components/pro/pro-shell-fallback";
import type { Locale } from "~/i18n/routing";
import { NO_INDEX, resolveLocale } from "~/lib/locale";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { requirePlatformAdminPage } from "~/server/auth/admin-guard";
import { HydrateClient, prefetch, trpc } from "~/trpc/server";

export const instant = false;

type Props = PageProps<"/[locale]/pro/admin/contacts">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const locale = resolveLocale((await params).locale);
	const t = await getTranslations({ locale, namespace: "Admin" });
	return { title: t("contacts.metaTitle"), robots: NO_INDEX };
}

async function Contacts({ locale }: { locale: Locale }) {
	await requirePlatformAdminPage(locale);
	const t = await getTranslations({ locale, namespace: "Admin" });
	prefetch(trpc.admin.contacts.queue.queryOptions({ status: "new" }));
	return (
		<ProShell
			locale={locale}
			current={PRO_ROUTES.adminContacts}
			title={t("contacts.title")}
			lead={t("contacts.lead")}
		>
			<HydrateClient>
				<AdminContacts />
			</HydrateClient>
		</ProShell>
	);
}

export default async function AdminContactRequestsPage({ params }: Props) {
	const locale = resolveLocale((await params).locale);
	setRequestLocale(locale);
	return (
		<Suspense fallback={<ProShellFallback locale={locale} />}>
			<Contacts locale={locale} />
		</Suspense>
	);
}
