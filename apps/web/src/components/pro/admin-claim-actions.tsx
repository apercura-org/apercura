"use client";

import { Button, Form, Notice, OtpField, Radio, RadioGroup, TextAreaField } from "@apercura/ui";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { useRouter } from "~/i18n/navigation";
import { formatPhone } from "~/lib/practitioner-view";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { useTRPC } from "~/trpc/client";

/** Registry phone callback: the administrator types the code read out by the practice. */
export function PhoneCallback({
	claimId,
	phones,
}: {
	claimId: string;
	phones: { phone: string; site: string | null }[];
}) {
	const t = useTranslations("Admin.claim");
	const router = useRouter();
	const trpc = useTRPC();
	const [phone, setPhone] = useState(phones[0]?.phone ?? "");
	const [code, setCode] = useState("");
	const verify = useMutation(
		trpc.admin.claims.verifyPhone.mutationOptions({ onSuccess: () => router.refresh() }),
	);
	const onSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		verify.mutate({ id: claimId, phone, code });
	};
	return (
		<Form onSubmit={onSubmit}>
			<RadioGroup label={t("phoneCalled")} value={phone} onChange={setPhone}>
				{phones.map((item) => (
					<Radio key={item.phone} value={item.phone}>
						<span className="tabular">{formatPhone(item.phone)}</span>
						{item.site ? <span className="text-meta text-ink-muted"> · {item.site}</span> : null}
					</Radio>
				))}
			</RadioGroup>
			<OtpField name="code" label={t("codeHeard")} value={code} onChange={setCode} isRequired />
			{verify.isError ? (
				<Notice
					tone="error"
					title={verify.error.message === "TOO_MANY_ATTEMPTS" ? t("codeLocked") : t("codeWrong")}
				/>
			) : null}
			<div>
				<Button type="submit" intent="ink" isPending={verify.isPending} pendingLabel={t("pending")}>
					{t("confirmCode")}
				</Button>
			</div>
		</Form>
	);
}

/** Approve (reason optional) or reject (reason required, sent to the claimant). */
export function ClaimDecision({ claimId, approvable }: { claimId: string; approvable: boolean }) {
	const t = useTranslations("Admin.claim");
	const router = useRouter();
	const trpc = useTRPC();
	// Follows `approvable` (it turns true once the callback succeeds) until the admin picks.
	const [choice, setChoice] = useState<"approve" | "reject" | null>(null);
	const decision = choice ?? (approvable ? "approve" : "reject");
	const [reason, setReason] = useState("");
	const done = () => {
		router.push(PRO_ROUTES.adminClaims);
		router.refresh();
	};
	const approve = useMutation(trpc.admin.claims.approve.mutationOptions({ onSuccess: done }));
	const reject = useMutation(trpc.admin.claims.reject.mutationOptions({ onSuccess: done }));
	const pending = approve.isPending || reject.isPending;
	const failed = approve.isError || reject.isError;
	const onSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (decision === "approve") approve.mutate({ id: claimId, reason: reason.trim() || undefined });
		else reject.mutate({ id: claimId, reason: reason.trim() });
	};
	return (
		<Form onSubmit={onSubmit}>
			<RadioGroup
				label={t("decision")}
				value={decision}
				onChange={(value) => setChoice(value as "approve" | "reject")}
			>
				<Radio value="approve" isDisabled={!approvable}>
					{t("approve")}
				</Radio>
				<Radio value="reject">{t("reject")}</Radio>
			</RadioGroup>
			{approvable ? null : <p className="text-meta text-ink-muted">{t("notApprovable")}</p>}
			<TextAreaField
				label={decision === "reject" ? t("reasonRequired") : t("reasonOptional")}
				description={decision === "reject" ? t("reasonHint") : undefined}
				value={reason}
				onChange={setReason}
				rows={3}
				maxLength={500}
				isRequired={decision === "reject"}
				minLength={decision === "reject" ? 3 : undefined}
			/>
			{failed ? <Notice tone="error" title={t("decisionFailed")} /> : null}
			<div>
				<Button
					type="submit"
					intent={decision === "approve" ? "stamp" : "ink"}
					isPending={pending}
					pendingLabel={t("pending")}
				>
					{decision === "approve" ? t("approveAction") : t("rejectAction")}
				</Button>
			</div>
		</Form>
	);
}
