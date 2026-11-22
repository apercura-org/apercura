"use client";

import { Button, Notice } from "@apercura/ui";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { getPathname } from "~/i18n/navigation";
import { authClient } from "~/lib/auth-client";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { currentReturnTo } from "~/lib/return-to";

/**
 * Sign in with Pro Santé Connect (e-CPS or CPS card), once it is linked to the
 * account from a claim. Strong authentication on its own: no second factor
 * is asked after it.
 */
export function PscSignIn({ failed }: { failed: boolean }) {
	const t = useTranslations("auth.signIn");
	const tCommon = useTranslations("auth.common");
	const locale = useLocale();
	const [pending, setPending] = useState(false);
	const [error, setError] = useState(failed);
	const onPress = async () => {
		setPending(true);
		setError(false);
		const result = await authClient.signIn.social({
			provider: "psc" as never,
			callbackURL: getPathname({ href: currentReturnTo() ?? PRO_ROUTES.home, locale }),
			errorCallbackURL: `${getPathname({ href: PRO_ROUTES.signIn, locale })}?psc=erreur`,
		});
		if (result.error) {
			setPending(false);
			setError(true);
		}
	};
	return (
		<section
			aria-labelledby="sign-in-psc"
			className="flex flex-col gap-3 border-t border-rule-soft pt-6"
		>
			<h2 id="sign-in-psc" className="type-subtitle text-ink">
				{t("pscHeading")}
			</h2>
			<p className="text-meta text-ink-muted">{t("pscHint")}</p>
			{error ? <Notice tone="error" title={t("pscFailed")} /> : null}
			<div>
				<Button
					intent="ink"
					isPending={pending}
					pendingLabel={tCommon("pending")}
					onPress={() => void onPress()}
				>
					{t("psc")}
				</Button>
			</div>
		</section>
	);
}
