"use client";

import { Button, Form, linkStyles, Notice, OtpField, TextField } from "@apercura/ui";
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useRouter } from "~/i18n/navigation";
import { authClient } from "~/lib/auth-client";
import { type AuthErrorKey, authErrorKey } from "~/lib/auth-errors";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { currentReturnTo, withReturnTo } from "~/lib/return-to";

type Step = "password" | "totp" | "backup";

const headingClass = "type-title text-ink outline-none";

/** Password first, then the second factor Better Auth asks for (TOTP or a backup code); or a passkey alone. */
export function SignInForm() {
	const t = useTranslations("auth");
	const router = useRouter();
	const [step, setStep] = useState<Step>("password");
	const [error, setError] = useState<AuthErrorKey | null>(null);
	const [pending, setPending] = useState(false);
	const [code, setCode] = useState("");
	const headingRef = useRef<HTMLHeadingElement>(null);
	const shownStep = useRef<Step>("password");
	const [returnTo, setReturnTo] = useState<ReturnType<typeof currentReturnTo>>(null);
	useEffect(() => setReturnTo(currentReturnTo()), []);

	useEffect(() => {
		// Move focus to the new step's heading so screen readers hear where they are.
		if (shownStep.current !== step) {
			shownStep.current = step;
			headingRef.current?.focus();
		}
	}, [step]);

	const goIn = () => {
		// Back to the claim the visitor came for, else their space.
		router.replace(currentReturnTo() ?? PRO_ROUTES.home);
		router.refresh();
	};

	const run = async (action: () => Promise<{ error?: unknown } | undefined>) => {
		setPending(true);
		setError(null);
		try {
			const result = await action();
			const failure = result && "error" in result ? result.error : null;
			if (failure) {
				setError(authErrorKey(failure as { code?: string; status?: number }));
			}
		} catch {
			setError("generic");
		} finally {
			setPending(false);
		}
	};

	const onPassword = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const data = new FormData(event.currentTarget);
		void run(async () => {
			const result = await authClient.signIn.email({
				email: String(data.get("email") ?? ""),
				password: String(data.get("password") ?? ""),
			});
			if (result.error) {
				return result;
			}
			if (result.data && "twoFactorRedirect" in result.data && result.data.twoFactorRedirect) {
				setCode("");
				setStep("totp");
				return;
			}
			// No TOTP: the space sends the person to confirm with a passkey or to enrol a factor.
			goIn();
		});
	};

	const onCode = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const data = new FormData(event.currentTarget);
		void run(async () => {
			const result =
				step === "totp"
					? await authClient.twoFactor.verifyTotp({ code })
					: await authClient.twoFactor.verifyBackupCode({
							code: String(data.get("backupCode") ?? "").trim(),
						});
			if (!result.error) {
				goIn();
			}
			return result;
		});
	};

	const onPasskey = () =>
		void run(async () => {
			const result = await authClient.signIn.passkey();
			if (!result?.error) {
				goIn();
			}
			return result ?? undefined;
		});

	const errorNotice = error ? <Notice tone="error" title={t(`errors.${error}`)} /> : null;

	if (step === "password") {
		return (
			<div className="flex flex-col gap-8">
				<section aria-labelledby="sign-in-password" className="flex flex-col gap-5">
					<h2 id="sign-in-password" ref={headingRef} tabIndex={-1} className={headingClass}>
						{t("signIn.passwordHeading")}
					</h2>
					{errorNotice}
					<Form onSubmit={onPassword}>
						<TextField
							name="email"
							type="email"
							label={t("common.email")}
							autoComplete="username webauthn"
							isRequired
						/>
						<TextField
							name="password"
							type="password"
							label={t("common.password")}
							autoComplete="current-password"
							isRequired
						/>
						<div>
							<Button
								intent="stamp"
								type="submit"
								isPending={pending}
								pendingLabel={t("common.pending")}
							>
								{t("signIn.submit")}
							</Button>
						</div>
					</Form>
				</section>
				<section
					aria-labelledby="sign-in-passkey"
					className="flex flex-col gap-3 border-t border-rule-soft pt-6"
				>
					<h2 id="sign-in-passkey" className="type-subtitle text-ink">
						{t("signIn.passkeyHeading")}
					</h2>
					<p className="text-meta text-ink-muted">{t("signIn.passkeyHint")}</p>
					<div>
						<Button intent="ink" onPress={onPasskey} isDisabled={pending}>
							{t("signIn.passkey")}
						</Button>
					</div>
				</section>
				<p className="text-body text-ink">
					{t("signIn.noAccount")}{" "}
					<Link href={withReturnTo(PRO_ROUTES.signUp, returnTo)} className={linkStyles()}>
						{t("signIn.signUpLink")}
					</Link>
				</p>
			</div>
		);
	}

	return (
		<section aria-labelledby="sign-in-factor" className="flex flex-col gap-5">
			<h2 id="sign-in-factor" ref={headingRef} tabIndex={-1} className={headingClass}>
				{step === "totp" ? t("signIn.totpHeading") : t("signIn.backupHeading")}
			</h2>
			<p className="max-w-[60ch] text-body text-ink">
				{step === "totp" ? t("signIn.totpLead") : t("signIn.backupLead")}
			</p>
			{errorNotice}
			<Form onSubmit={onCode}>
				{step === "totp" ? (
					<OtpField
						name="code"
						label={t("common.totpCode")}
						value={code}
						onChange={setCode}
						isRequired
						autoFocus
					/>
				) : (
					<TextField
						name="backupCode"
						label={t("signIn.backupCode")}
						autoComplete="off"
						isRequired
						autoFocus
					/>
				)}
				<div className="flex flex-wrap items-center gap-4">
					<Button
						intent="stamp"
						type="submit"
						isPending={pending}
						pendingLabel={t("common.pending")}
					>
						{t("signIn.verify")}
					</Button>
					<Button
						intent="quiet"
						onPress={() => {
							setError(null);
							setStep(step === "totp" ? "backup" : "totp");
						}}
					>
						{step === "totp" ? t("signIn.useBackupCode") : t("signIn.useTotp")}
					</Button>
				</div>
			</Form>
		</section>
	);
}
