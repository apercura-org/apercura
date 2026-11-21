import { buttonStyles, Notice } from "@apercura/ui";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { AuthFrame } from "~/components/pro/auth-frame";
import { Link } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { NO_INDEX, resolveLocale } from "~/lib/locale";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { parseReturnTo, RETURN_PARAM, withReturnTo } from "~/lib/return-to";

type Props = PageProps<"/[locale]/pro/verification-email">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const locale = resolveLocale((await params).locale);
	const t = await getTranslations({ locale, namespace: "auth.metadata" });
	return { title: t("verifyEmail"), robots: NO_INDEX };
}

/** Better Auth redirects here after following the link, with `?error=` when it failed. */
async function Outcome({
	locale,
	searchParams,
}: {
	locale: Locale;
	searchParams: Props["searchParams"];
}) {
	const t = await getTranslations({ locale, namespace: "auth.verifyEmail" });
	const query = await searchParams;
	const { error } = query;
	const returnTo = parseReturnTo(query[RETURN_PARAM]);
	const failed = Boolean(error);
	return (
		<div className="flex max-w-2xl flex-col gap-5">
			<Notice
				tone={failed ? "error" : "success"}
				title={failed ? t("errorTitle") : t("successTitle")}
			>
				{failed ? t("errorBody") : t("successBody")}
			</Notice>
			<div>
				<Link
					href={withReturnTo(PRO_ROUTES.signIn, returnTo)}
					className={buttonStyles({ intent: "stamp" })}
				>
					{t("signIn")}
				</Link>
			</div>
		</div>
	);
}

export default async function VerifyEmailPage({ params, searchParams }: Props) {
	const locale = resolveLocale((await params).locale);
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "auth.verifyEmail" });
	return (
		<AuthFrame locale={locale} pathname={PRO_ROUTES.verifyEmail} title={t("title")}>
			<Suspense fallback={null}>
				<Outcome locale={locale} searchParams={searchParams} />
			</Suspense>
		</AuthFrame>
	);
}
