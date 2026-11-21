import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { AuthColumns, AuthFrame } from "~/components/pro/auth-frame";
import { PscSignIn } from "~/components/pro/psc-sign-in";
import { SignInForm } from "~/components/pro/sign-in-form";
import { NO_INDEX, resolveLocale } from "~/lib/locale";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { pscConfigured } from "~/server/features";

type Props = PageProps<"/[locale]/pro/connexion">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const locale = resolveLocale((await params).locale);
	const t = await getTranslations({ locale, namespace: "auth.metadata" });
	return { title: t("signIn"), robots: NO_INDEX };
}

/** Pro Santé Connect is offered when the running server has it configured (read at request time). */
async function PscOption({ searchParams }: { searchParams: Props["searchParams"] }) {
	await connection();
	if (!pscConfigured()) return null;
	const failed = (await searchParams).psc !== undefined;
	return <PscSignIn failed={failed} />;
}

export default async function SignInPage({ params, searchParams }: Props) {
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
				<Suspense fallback={null}>
					<PscOption searchParams={searchParams} />
				</Suspense>
			</AuthColumns>
		</AuthFrame>
	);
}
