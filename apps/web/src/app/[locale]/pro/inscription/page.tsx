import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthColumns, AuthFrame } from "~/components/pro/auth-frame";
import { PerRequest } from "~/components/pro/per-request";
import { SignUpForm } from "~/components/pro/sign-up-form";
import { NO_INDEX, resolveLocale } from "~/lib/locale";
import { PRO_ROUTES } from "~/lib/pro-routes";

export async function generateMetadata({
	params,
}: PageProps<"/[locale]/pro/inscription">): Promise<Metadata> {
	const locale = resolveLocale((await params).locale);
	const t = await getTranslations({ locale, namespace: "auth.metadata" });
	return { title: t("signUp"), robots: NO_INDEX };
}

export default async function SignUpPage({ params }: PageProps<"/[locale]/pro/inscription">) {
	const locale = resolveLocale((await params).locale);
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "auth.signUp" });
	return (
		<AuthFrame locale={locale} pathname={PRO_ROUTES.signUp} title={t("title")} lead={t("lead")}>
			<AuthColumns
				aside={
					<>
						<p>{t("asideSteps")}</p>
						<p className="text-meta text-ink-muted">{t("asideFree")}</p>
					</>
				}
			>
				<SignUpForm />
				<PerRequest />
			</AuthColumns>
		</AuthFrame>
	);
}
