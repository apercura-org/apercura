"use client";

import { Button, linkStyles, Notice } from "@apercura/ui";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link } from "~/i18n/navigation";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { useTRPC } from "~/trpc/client";

/**
 * Confirms a registry email link. The token is read from the URL fragment
 * (never sent to a server with the page request) and only sent when the
 * person presses the button, so mail scanners that open links confirm nothing.
 */
export function ClaimEmailConfirm() {
	const t = useTranslations("Claim.emailLink");
	const trpc = useTRPC();
	const [token, setToken] = useState<string | null | undefined>(undefined);
	const confirm = useMutation(trpc.claims.confirmEmail.mutationOptions());

	useEffect(() => {
		const match = /(?:^|&)jeton=([A-Za-z0-9_-]+)/.exec(window.location.hash.slice(1));
		setToken(match?.[1] ?? null);
	}, []);

	if (token === undefined) return <p className="text-body text-ink-muted">{t("reading")}</p>;
	if (token === null || confirm.isError) {
		const tooMany = confirm.error?.data?.code === "TOO_MANY_REQUESTS";
		return (
			<Notice tone="error" title={tooMany ? t("tooMany") : t("invalidTitle")}>
				{tooMany ? null : t("invalidBody")}
			</Notice>
		);
	}
	if (confirm.isSuccess) {
		return (
			<Notice tone="success" title={t("doneTitle")} role="status">
				<span className="flex flex-col gap-2">
					<span>{t("doneBody")}</span>
					<Link href={PRO_ROUTES.home} className={linkStyles()}>
						{t("goToSpace")}
					</Link>
				</span>
			</Notice>
		);
	}
	return (
		<div className="flex flex-col gap-4">
			<p className="max-w-[60ch] text-body text-ink">{t("body")}</p>
			<div>
				<Button
					intent="stamp"
					size="lg"
					isPending={confirm.isPending}
					pendingLabel={t("pending")}
					onPress={() => confirm.mutate({ token })}
				>
					{t("confirm")}
				</Button>
			</div>
		</div>
	);
}
