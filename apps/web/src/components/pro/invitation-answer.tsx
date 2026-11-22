"use client";

import { Button, Notice } from "@apercura/ui";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "~/i18n/navigation";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { useTRPC } from "~/trpc/client";

const KNOWN = new Set(["EMAIL_NOT_VERIFIED", "NO_SECOND_FACTOR", "ALREADY_MEMBER", "EXPIRED"]);

/** Join or decline: joining needs this session's second factor (checked again on the server). */
export function InvitationAnswer({ invitationId }: { invitationId: string }) {
	const t = useTranslations("Invitation");
	const trpc = useTRPC();
	const router = useRouter();
	const accept = useMutation(trpc.team.accept.mutationOptions());
	const decline = useMutation(trpc.team.decline.mutationOptions());
	const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);

	return (
		<div className="flex flex-col gap-4">
			{result ? <Notice tone={result.tone}>{result.text}</Notice> : null}
			<div className="flex flex-wrap gap-3">
				<Button
					isPending={accept.isPending}
					pendingLabel={t("open.pending")}
					isDisabled={decline.isSuccess}
					onPress={() => {
						setResult(null);
						accept.mutate(
							{ invitationId },
							{
								onSuccess: () => {
									router.replace(PRO_ROUTES.today);
									router.refresh();
								},
								onError: (error) =>
									setResult({
										tone: "error",
										text: KNOWN.has(error.message)
											? t(`errors.${error.message as "EXPIRED"}`)
											: t("errors.failed"),
									}),
							},
						);
					}}
				>
					{t("open.accept")}
				</Button>
				<Button
					intent="ink"
					isPending={decline.isPending}
					isDisabled={decline.isSuccess}
					onPress={() => {
						setResult(null);
						decline.mutate(
							{ invitationId },
							{
								onSuccess: () => setResult({ tone: "success", text: t("declined") }),
								onError: () => setResult({ tone: "error", text: t("errors.failed") }),
							},
						);
					}}
				>
					{t("open.decline")}
				</Button>
			</div>
		</div>
	);
}
