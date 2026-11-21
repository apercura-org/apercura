import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { AuthColumns, AuthFrame } from "~/components/pro/auth-frame";
import { ChallengeForm } from "~/components/pro/challenge-form";
import type { Locale } from "~/i18n/routing";
import { NO_INDEX, resolveLocale } from "~/lib/locale";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { requireProAccess } from "~/server/auth/guard";
import { secondFactors } from "~/server/auth/membership";
import { getDb } from "~/server/db";

// Personal, per-request pages: they read the session and may redirect, so they
// are never part of an instant (prefetched) navigation.
export const instant = false;

type Props = PageProps<"/[locale]/pro/connexion/verification">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const locale = resolveLocale((await params).locale);
	const t = await getTranslations({ locale, namespace: "auth.metadata" });
	return { title: t("challenge"), robots: NO_INDEX };
}

async function Challenge({ locale }: { locale: Locale }) {
	const access = await requireProAccess(locale, ["challenge"]);
	const factors = await secondFactors(getDb(), access.session.user.id);
	return <ChallengeForm totp={factors.totp} passkeys={factors.passkeys > 0} />;
}

export default async function ChallengePage({ params }: Props) {
	const locale = resolveLocale((await params).locale);
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "auth.challenge" });
	return (
		<AuthFrame locale={locale} pathname={PRO_ROUTES.challenge} title={t("title")} lead={t("lead")}>
			<AuthColumns aside={<p>{t("aside")}</p>}>
				<Suspense fallback={null}>
					<Challenge locale={locale} />
				</Suspense>
			</AuthColumns>
		</AuthFrame>
	);
}
