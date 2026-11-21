import "server-only";
import { createTranslator } from "next-intl";
import { VerifyEmail } from "~/emails/verify-email";
import { type Locale, routing } from "~/i18n/routing";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import { sendMail } from "./index";

const catalogs = { en, fr } as const;

/** Users store their locale; anything unknown falls back to the default (French). */
export function emailLocale(value: unknown): Locale {
	return routing.locales.includes(value as Locale) ? (value as Locale) : routing.defaultLocale;
}

export async function sendVerificationEmail(options: {
	to: string;
	name: string;
	url: string;
	locale: unknown;
}) {
	const locale = emailLocale(options.locale);
	const t = createTranslator({ locale, messages: catalogs[locale], namespace: "auth.email" });
	const strings = {
		preview: t("verify.preview"),
		wordmark: t("wordmark"),
		runningHead: t("runningHead"),
		title: t("verify.title"),
		greeting: t("verify.greeting", { name: options.name }),
		body: t("verify.body"),
		action: t("verify.action"),
		fallback: t("verify.fallback"),
		expiry: t("verify.expiry"),
		ignore: t("verify.ignore"),
		footer: t("footer"),
	};
	await sendMail({
		to: options.to,
		subject: t("verify.subject"),
		react: <VerifyEmail lang={locale} url={options.url} strings={strings} />,
	});
}
