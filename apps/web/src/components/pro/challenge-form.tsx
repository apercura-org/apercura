"use client";

import { Button, Form, Notice, OtpField } from "@apercura/ui";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { useRouter } from "~/i18n/navigation";
import { authClient } from "~/lib/auth-client";
import { type AuthErrorKey, authErrorKey } from "~/lib/auth-errors";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { currentReturnTo } from "~/lib/return-to";
import { SignOutButton } from "./sign-out-button";

/**
 * The session was opened with a password only, but the account has a second
 * factor: confirm it here before reaching the space.
 */
export function ChallengeForm({ totp, passkeys }: { totp: boolean; passkeys: boolean }) {
	const t = useTranslations("auth");
	const router = useRouter();
	const [code, setCode] = useState("");
	const [error, setError] = useState<AuthErrorKey | null>(null);
	const [pending, setPending] = useState(false);

	const finish = async (action: () => Promise<{ error?: unknown } | null | undefined>) => {
		setPending(true);
		setError(null);
		try {
			const result = await action();
			if (result?.error) {
				setError(authErrorKey(result.error as { code?: string; status?: number }));
				return;
			}
			router.replace(currentReturnTo() ?? PRO_ROUTES.home);
			router.refresh();
		} catch {
			setError("generic");
		} finally {
			setPending(false);
		}
	};

	const onTotp = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		void finish(() => authClient.twoFactor.verifyTotp({ code }));
	};

	return (
		<div className="flex flex-col gap-8">
			{error ? <Notice tone="error" title={t(`errors.${error}`)} /> : null}
			{passkeys ? (
				<section aria-labelledby="challenge-passkey" className="flex flex-col gap-3">
					<h2 id="challenge-passkey" className="type-title text-ink">
						{t("challenge.passkeyHeading")}
					</h2>
					<p className="text-body text-ink">{t("challenge.passkeyLead")}</p>
					<div>
						<Button
							isDisabled={pending}
							onPress={() => void finish(async () => (await authClient.signIn.passkey()) ?? null)}
						>
							{t("challenge.passkey")}
						</Button>
					</div>
				</section>
			) : null}
			{totp ? (
				<section aria-labelledby="challenge-totp" className="flex flex-col gap-3">
					<h2 id="challenge-totp" className="type-title text-ink">
						{t("challenge.totpHeading")}
					</h2>
					<Form onSubmit={onTotp}>
						<OtpField
							name="code"
							label={t("common.totpCode")}
							value={code}
							onChange={setCode}
							isRequired
						/>
						<div>
							<Button type="submit" isPending={pending} pendingLabel={t("common.pending")}>
								{t("signIn.verify")}
							</Button>
						</div>
					</Form>
				</section>
			) : null}
			<section
				aria-labelledby="challenge-out"
				className="flex flex-col gap-3 border-t border-rule-soft pt-6"
			>
				<h2 id="challenge-out" className="type-subtitle text-ink">
					{t("challenge.otherHeading")}
				</h2>
				<p className="text-meta text-ink-muted">{t("challenge.otherLead")}</p>
				<div>
					<SignOutButton intent="ink" />
				</div>
			</section>
		</div>
	);
}
