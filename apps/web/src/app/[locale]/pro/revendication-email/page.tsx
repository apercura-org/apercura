import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthFrame } from "~/components/pro/auth-frame";
import { ClaimEmailConfirm } from "~/components/pro/claim-email-confirm";
import { NO_INDEX, resolveLocale } from "~/lib/locale";
import { PRO_ROUTES } from "~/lib/pro-routes";

type Props = PageProps<"/[locale]/pro/revendication-email">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const locale = resolveLocale((await params).locale);
	const t = await getTranslations({ locale, namespace: "Claim.metadata" });
	return { title: t("emailLink"), robots: NO_INDEX };
}

/** Landing page of the link sent to the practice's registry email. No session needed. */
export default async function ClaimEmailPage({ params }: Props) {
	const locale = resolveLocale((await params).locale);
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "Claim.emailLink" });
	return (
		<AuthFrame locale={locale} pathname={PRO_ROUTES.claimEmail} title={t("title")} lead={t("lead")}>
			<ClaimEmailConfirm />
		</AuthFrame>
	);
}
