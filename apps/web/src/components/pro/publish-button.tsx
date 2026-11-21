"use client";

import { Button, Notice } from "@apercura/ui";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "~/i18n/navigation";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { useTRPC } from "~/trpc/client";

/** The last onboarding step: the public page starts showing the owner's content. */
export function PublishButton({ organizationId }: { organizationId: string }) {
	const t = useTranslations("Onboarding");
	const router = useRouter();
	const trpc = useTRPC();
	const publish = useMutation(
		trpc.profile.publish.mutationOptions({
			onSuccess: () => {
				router.push(PRO_ROUTES.pageEditor);
				router.refresh();
			},
		}),
	);
	return (
		<div className="flex flex-col gap-4">
			{publish.isError ? <Notice tone="error" title={t("publishFailed")} /> : null}
			<div>
				<Button
					size="lg"
					isPending={publish.isPending || publish.isSuccess}
					pendingLabel={t("pending")}
					onPress={() => publish.mutate({ organizationId })}
				>
					{t("steps.publish.action")}
				</Button>
			</div>
		</div>
	);
}
