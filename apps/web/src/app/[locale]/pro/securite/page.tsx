import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { ProShell } from "~/components/pro/pro-shell";
import { ProShellFallback } from "~/components/pro/pro-shell-fallback";
import { SecuritySettings } from "~/components/pro/security-settings";
import type { Locale } from "~/i18n/routing";
import { NO_INDEX, resolveLocale } from "~/lib/locale";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { requireProAccess } from "~/server/auth/guard";

// Personal, per-request pages: they read the session and may redirect, so they
// are never part of an instant (prefetched) navigation.
export const instant = false;

type Props = PageProps<"/[locale]/pro/securite">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const locale = resolveLocale((await params).locale);
	const t = await getTranslations({ locale, namespace: "auth.metadata" });
	return { title: t("security"), robots: NO_INDEX };
}

/**
 * Outside the `(app)` group on purpose: an account without a second factor
 * must reach this page to enrol one.
 */
async function Security({ locale }: { locale: Locale }) {
	const access = await requireProAccess(locale, ["enrol", "ready"]);
	const t = await getTranslations({ locale, namespace: "auth.security" });
	const ready = access.state === "ready";
	return (
		<ProShell
			locale={locale}
			current={PRO_ROUTES.security}
			title={t("title")}
			lead={ready ? t("lead") : t("enrolLead")}
			showNav={ready}
		>
			<SecuritySettings
				totpEnabled={access.session.user.twoFactorEnabled === true}
				mfaVerified={ready}
				enrolling={!ready}
			/>
		</ProShell>
	);
}

export default async function SecurityPage({ params }: Props) {
	const locale = resolveLocale((await params).locale);
	setRequestLocale(locale);
	return (
		<Suspense fallback={<ProShellFallback locale={locale} />}>
			<Security locale={locale} />
		</Suspense>
	);
}
