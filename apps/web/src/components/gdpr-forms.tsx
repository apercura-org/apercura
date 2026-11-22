"use client";

import {
	Button,
	Checkbox,
	Form,
	Notice,
	Radio,
	RadioGroup,
	TextAreaField,
	TextField,
} from "@apercura/ui";
import { useMutation } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { useTRPC } from "~/trpc/client";

const KINDS = ["wrong_info", "retired", "deceased", "impersonation"] as const;

function errorKey(error: { message?: string; data?: { code?: string } | null } | null) {
	if (!error) return null;
	if (error.data?.code === "TOO_MANY_REQUESTS") return "tooMany";
	if (error.message === "NOT_FOUND") return "notFound";
	if (error.message === "CLAIMED") return "claimed";
	if (error.data?.code === "BAD_REQUEST") return "invalid";
	return "generic";
}

/** RPPS field for the forms of /donnees, where no page is selected yet. */
function RppsField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
	const t = useTranslations("Gdpr");
	return (
		<TextField
			label={t("rpps")}
			description={t("rppsHint")}
			value={value}
			onChange={onChange}
			inputMode="numeric"
			pattern="\d{11}"
			maxLength={11}
			isRequired
			autoComplete="off"
			inputClassName="tabular"
		/>
	);
}

/** "Report an error": wrong information, retired, deceased, impersonation. Stored encrypted. */
export function ReportForm({ rpps: fixedRpps }: { rpps?: string }) {
	const t = useTranslations("Gdpr.report");
	const tCommon = useTranslations("Gdpr");
	const trpc = useTRPC();
	const [rpps, setRpps] = useState(fixedRpps ?? "");
	const [kind, setKind] = useState<(typeof KINDS)[number]>("wrong_info");
	const [message, setMessage] = useState("");
	const [contact, setContact] = useState("");
	const report = useMutation(trpc.gdpr.report.mutationOptions());

	if (report.isSuccess) {
		return (
			<Notice tone="success" title={t("doneTitle")} role="status">
				{t("doneBody")}
			</Notice>
		);
	}
	const onSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		report.mutate({
			rpps: rpps.trim() || null,
			kind,
			message,
			contact: contact.trim() || null,
		});
	};
	const failure = errorKey(report.error);
	return (
		<Form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-6">
			{failure ? <Notice tone="error" title={tCommon(`errors.${failure}` as never)} /> : null}
			{fixedRpps ? null : <RppsField value={rpps} onChange={setRpps} />}
			<RadioGroup
				label={t("kind")}
				value={kind}
				onChange={(value) => setKind(value as typeof kind)}
			>
				{KINDS.map((item) => (
					<Radio key={item} value={item}>
						{t(`kinds.${item}`)}
					</Radio>
				))}
			</RadioGroup>
			<TextAreaField
				label={t("message")}
				description={t("messageHint")}
				value={message}
				onChange={setMessage}
				rows={5}
				minLength={5}
				maxLength={2000}
				isRequired
			/>
			<TextField
				label={t("contact")}
				description={t("contactHint")}
				type="email"
				autoComplete="email"
				value={contact}
				onChange={setContact}
				maxLength={254}
			/>
			<p className="text-meta text-ink-muted">{t("privacy")}</p>
			<div>
				<Button
					intent="stamp"
					type="submit"
					isPending={report.isPending}
					pendingLabel={tCommon("pending")}
				>
					{t("submit")}
				</Button>
			</div>
		</Form>
	);
}

/**
 * GDPR art. 21 objection. An unclaimed page is hidden as soon as the request
 * is received, then deleted once an administrator has checked it.
 */
export function RemovalForm({ rpps: fixedRpps }: { rpps?: string }) {
	const t = useTranslations("Gdpr.removal");
	const tCommon = useTranslations("Gdpr");
	const locale = useLocale();
	const trpc = useTRPC();
	const [rpps, setRpps] = useState(fixedRpps ?? "");
	const [contact, setContact] = useState("");
	const [message, setMessage] = useState("");
	const [confirmed, setConfirmed] = useState(false);
	const request = useMutation(trpc.gdpr.requestRemoval.mutationOptions());

	if (request.isSuccess) {
		return (
			<Notice tone="success" title={t("doneTitle")} role="status">
				{t("doneBody")}
			</Notice>
		);
	}
	const onSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!confirmed) return;
		request.mutate({
			rpps: rpps.trim(),
			contact,
			message: message.trim() || undefined,
			isPractitioner: true,
			locale,
		});
	};
	const failure = errorKey(request.error);
	return (
		<Form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-6">
			{failure ? <Notice tone="error" title={tCommon(`errors.${failure}` as never)} /> : null}
			{fixedRpps ? null : <RppsField value={rpps} onChange={setRpps} />}
			<TextField
				label={t("contact")}
				description={t("contactHint")}
				type="email"
				autoComplete="email"
				value={contact}
				onChange={setContact}
				maxLength={254}
				isRequired
			/>
			<TextAreaField
				label={t("message")}
				description={t("messageHint")}
				value={message}
				onChange={setMessage}
				rows={4}
				maxLength={1000}
			/>
			<Checkbox isSelected={confirmed} onChange={setConfirmed} isRequired>
				{t("confirm")}
			</Checkbox>
			<p className="text-meta text-ink-muted">{t("privacy")}</p>
			<div>
				<Button
					intent="stamp"
					type="submit"
					isDisabled={!confirmed}
					isPending={request.isPending}
					pendingLabel={tCommon("pending")}
				>
					{t("submit")}
				</Button>
			</div>
		</Form>
	);
}
