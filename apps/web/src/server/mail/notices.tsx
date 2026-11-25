import "server-only";
import { createTranslator } from "next-intl";
import { NoticeEmail } from "~/emails/notice-email";
import { messagesFor } from "~/i18n/catalogs";
import type { Locale } from "~/i18n/locales";
import { emailLocale } from "./auth-emails";
import { sendMail } from "./index";

/** Messages of `emails.{kind}` that every notice reads. */
export type NoticeKind =
	| "claimRegistryLink"
	| "claimReceived"
	| "claimVerified"
	| "claimRejected"
	| "claimSuperseded"
	| "removalReceived"
	| "removalConfirmed"
	| "removalRejected"
	| "teamInvitation"
	| "contactReceived"
	| "adminClaims"
	| "adminContactRequests";

/**
 * Sends one of the platform's short notices in the recipient's locale.
 * `values` fill the ICU placeholders; `action` adds the stamped link.
 */
export async function sendNotice(options: {
	to: string;
	locale: unknown;
	kind: NoticeKind;
	/** ICU values: strings, or numbers for plurals (`{count, plural, …}`). */
	values?: Record<string, string | number>;
	actionUrl?: string;
}) {
	const locale: Locale = emailLocale(options.locale);
	const messages = messagesFor(locale);
	const common = createTranslator({ locale, messages, namespace: "auth.email" });
	const t = createTranslator({ locale, messages, namespace: "emails" });
	const values = options.values ?? {};
	const key = options.kind;
	// Notices share one shape: subject, title, paragraphs, optional action and notes.
	// Optional parts (`notes`, `action`) are simply absent from some notices.
	const raw = (path: string) =>
		t.has(`${key}.${path}` as never) ? (t.raw(`${key}.${path}` as never) as unknown) : null;
	const format = (path: string) => t(`${key}.${path}` as never, values as never) as string;
	const list = (path: string) => {
		const value = raw(path);
		if (!Array.isArray(value)) return [];
		return value.map((_, index) => format(`${path}.${index}`));
	};
	await sendMail({
		to: options.to,
		subject: format("subject"),
		react: (
			<NoticeEmail
				lang={locale}
				preview={format("subject")}
				wordmark={common("wordmark")}
				runningHead={common("runningHead")}
				footer={common("footer")}
				title={format("title")}
				paragraphs={list("body")}
				action={
					options.actionUrl
						? { label: format("action"), url: options.actionUrl, fallback: t("fallback") }
						: undefined
				}
				notes={list("notes")}
			/>
		),
	});
}
