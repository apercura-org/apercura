"use client";

import { Button } from "@apercura/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "~/i18n/navigation";
import { authClient } from "~/lib/auth-client";
import { PRO_ROUTES } from "~/lib/pro-routes";

export function SignOutButton({ intent = "cover" }: { intent?: "cover" | "ink" }) {
	const t = useTranslations("auth.common");
	const router = useRouter();
	const [pending, setPending] = useState(false);
	return (
		<Button
			intent={intent}
			isPending={pending}
			pendingLabel={t("signingOut")}
			onPress={async () => {
				setPending(true);
				await authClient.signOut();
				router.replace(PRO_ROUTES.signIn);
				router.refresh();
			}}
		>
			{t("signOut")}
		</Button>
	);
}
