"use client";

import { Button, linkStyles, Notice } from "@apercura/ui";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "~/i18n/navigation";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { useTRPC } from "~/trpc/client";

const ERRORS = ["ALREADY_OWNER", "FROZEN", "NOT_FOUND", "INVALID_RPPS"] as const;

/** "This is me": opens the claim (or reopens the caller's live one) and goes to it. */
export function ClaimStartButton({ rpps }: { rpps: string }) {
	const t = useTranslations("Claim");
	const router = useRouter();
	const trpc = useTRPC();
	const start = useMutation(
		trpc.claims.start.mutationOptions({
			onSuccess: ({ id }) => router.push({ pathname: "/pro/revendiquer/[id]", params: { id } }),
		}),
	);
	const code = start.error?.data?.code === "TOO_MANY_REQUESTS" ? "TOO_MANY" : start.error?.message;
	const known = (ERRORS as readonly string[]).includes(code ?? "") ? code : null;
	return (
		<div className="flex flex-col gap-4">
			{start.error ? (
				<Notice
					tone="error"
					title={
						code === "TOO_MANY"
							? t("errors.TOO_MANY")
							: known
								? t(`errors.${known as (typeof ERRORS)[number]}`)
								: t("errors.generic")
					}
				>
					{code === "ALREADY_OWNER" ? (
						<Link href={PRO_ROUTES.pageEditor} className={linkStyles()}>
							{t("start.goToPage")}
						</Link>
					) : null}
				</Notice>
			) : null}
			<div>
				<Button
					size="lg"
					isPending={start.isPending || start.isSuccess}
					pendingLabel={t("pending")}
					onPress={() => start.mutate({ rpps })}
				>
					{t("start.confirm")}
				</Button>
			</div>
		</div>
	);
}
