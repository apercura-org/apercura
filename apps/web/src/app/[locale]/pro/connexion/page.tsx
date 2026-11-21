import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthColumns, AuthFrame } from "~/components/pro/auth-frame";
import { SignInForm } from "~/components/pro/sign-in-form";
import { NO_INDEX, resolveLocale } from "~/lib/locale";
import { PRO_ROUTES } from "~/lib/pro-routes";

export async function generateMetadata({
	params,
}: PageProps<"/[locale]/pro/connexion">): Promise<Metadata> {
	const locale = resolveLocale((await params).locale);
	const t = await getTranslations({ locale, namespace: "auth.metadata" });
	return { title: t("signIn"), robots: NO_INDEX };
}

export default async function SignInPage({ params }: PageProps<"/[locale]/pro/connexion">) {
	const locale = resolveLocale((await params).locale);
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "auth.signIn" });
	return (
		<AuthFrame locale={locale} pathname={PRO_ROUTES.signIn} title={t("title")} lead={t("lead")}>
			<AuthColumns
				aside={
					<>
						<p>{t("asideFactor")}</p>
						<p className="text-meta text-ink-muted">{t("asidePasskey")}</p>
					</>
				}
			>
				<SignInForm />
			</AuthColumns>
		</AuthFrame>
	);
}
