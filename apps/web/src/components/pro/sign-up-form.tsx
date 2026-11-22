"use client";

import { Button, Form, linkStyles, Notice, TextField } from "@apercura/ui";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { getPathname, Link } from "~/i18n/navigation";
import { authClient } from "~/lib/auth-client";
import { type AuthErrorKey, authErrorKey } from "~/lib/auth-errors";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { currentReturnTo, withReturnTo } from "~/lib/return-to";

export const MIN_PASSWORD_LENGTH = 12;

/** Creates the account and sends the confirmation link; nothing opens until the address is confirmed. */
export function SignUpForm() {
	const t = useTranslations("auth");
	const locale = useLocale();
	const [sentTo, setSentTo] = useState<string | null>(null);
	const [error, setError] = useState<AuthErrorKey | null>(null);
	const [pending, setPending] = useState(false);
	const sentRef = useRef<HTMLHeadingElement>(null);
	const [returnTo, setReturnTo] = useState<ReturnType<typeof currentReturnTo>>(null);
	useEffect(() => setReturnTo(currentReturnTo()), []);

	useEffect(() => {
		if (sentTo) {
			sentRef.current?.focus();
		}
	}, [sentTo]);

	const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const data = new FormData(event.currentTarget);
		const email = String(data.get("email") ?? "").trim();
		setPending(true);
		setError(null);
		try {
			const result = await authClient.signUp.email({
				name: String(data.get("name") ?? "").trim(),
				email,
				password: String(data.get("password") ?? ""),
				locale,
				// The confirmation link brings the visitor back to the claim they started.
				callbackURL: getPathname({
					href: withReturnTo(PRO_ROUTES.verifyEmail, currentReturnTo()),
					locale,
				}),
			});
			if (result.error) {
				setError(authErrorKey(result.error));
			} else {
				setSentTo(email);
			}
		} catch {
			setError("generic");
		} finally {
			setPending(false);
		}
	};

	if (sentTo) {
		return (
			<section aria-labelledby="sign-up-sent" className="flex flex-col gap-4">
				<h2
					id="sign-up-sent"
					ref={sentRef}
					tabIndex={-1}
					className="type-title text-ink outline-none"
				>
					{t("signUp.sentHeading")}
				</h2>
				<Notice tone="success" title={t("signUp.sentTitle", { email: sentTo })}>
					{t("signUp.sentBody")}
				</Notice>
				<p className="text-meta text-ink-muted">{t("signUp.sentHint")}</p>
			</section>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			{error ? <Notice tone="error" title={t(`errors.${error}`)} /> : null}
			<Form onSubmit={onSubmit}>
				<TextField name="name" label={t("signUp.name")} autoComplete="name" isRequired />
				<TextField
					name="email"
					type="email"
					label={t("common.email")}
					description={t("signUp.emailHint")}
					autoComplete="email"
					isRequired
				/>
				<TextField
					name="password"
					type="password"
					label={t("common.password")}
					description={t("signUp.passwordHint", { min: MIN_PASSWORD_LENGTH })}
					autoComplete="new-password"
					minLength={MIN_PASSWORD_LENGTH}
					maxLength={128}
					isRequired
				/>
				<div>
					<Button type="submit" isPending={pending} pendingLabel={t("common.pending")}>
						{t("signUp.submit")}
					</Button>
				</div>
			</Form>
			<p className="text-body text-ink">
				{t("signUp.haveAccount")}{" "}
				<Link href={withReturnTo(PRO_ROUTES.signIn, returnTo)} className={linkStyles()}>
					{t("signUp.signInLink")}
				</Link>
			</p>
		</div>
	);
}
