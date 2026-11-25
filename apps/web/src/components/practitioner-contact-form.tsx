"use client";

import { Button, Form, Notice, TextAreaField, TextField } from "@apercura/ui";
import { useMutation } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useRef, useState } from "react";
import { useTRPC } from "~/trpc/client";
import { AltchaCheck, type AltchaHandle } from "./booking/altcha-check";

function errorKey(error: { message?: string; data?: { code?: string } | null } | null) {
	if (!error) return null;
	if (error.data?.code === "TOO_MANY_REQUESTS") return "tooMany";
	if (error.message === "CLAIMED") return "claimed";
	if (error.message === "NOT_FOUND") return "notFound";
	if (error.message === "PROOF") return "proof";
	if (error.data?.code === "BAD_REQUEST") return "invalid";
	return "generic";
}

/**
 * "I am this practitioner, contact me": name, professional email, phone (optional), message;
 * the RPPS is the page's, printed read-only. An ALTCHA proof of work (self-hosted) is solved
 * while the person types. Stored encrypted; the team answers by email.
 */
export function PractitionerContactForm({ reference }: { reference: string }) {
	const t = useTranslations("Gdpr.contact");
	const tCommon = useTranslations("Gdpr");
	const locale = useLocale();
	const trpc = useTRPC();
	const altcha = useRef<AltchaHandle>(null);
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [message, setMessage] = useState("");
	const [website, setWebsite] = useState("");
	const [proofFailed, setProofFailed] = useState(false);
	const submit = useMutation(
		trpc.practitionerContact.submit.mutationOptions({
			onError: () => altcha.current?.reset(),
		}),
	);

	if (submit.isSuccess) {
		return (
			<Notice tone="success" title={t("doneTitle")} role="status">
				<span className="flex flex-col gap-2">
					{(t.raw("doneBody") as string[]).map((line) => (
						<span key={line}>{line}</span>
					))}
				</span>
			</Notice>
		);
	}

	const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setProofFailed(false);
		const proof = await altcha.current?.solve();
		if (!proof) {
			setProofFailed(true);
			return;
		}
		submit.mutate({
			ref: reference,
			name,
			email,
			phone: phone.trim() || null,
			message,
			locale,
			altcha: proof,
			...(website ? { website } : {}),
		});
	};
	const failure = proofFailed ? "proof" : errorKey(submit.error);
	return (
		<Form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-6">
			{failure ? (
				<Notice
					tone="error"
					title={
						failure === "proof" || failure === "claimed"
							? t(`errors.${failure}`)
							: tCommon(`errors.${failure}` as never)
					}
				/>
			) : null}
			<TextField
				label={t("rpps")}
				description={t("rppsHint")}
				value={reference}
				isReadOnly
				inputClassName="tabular"
			/>
			<TextField
				label={t("name")}
				value={name}
				onChange={setName}
				autoComplete="name"
				minLength={2}
				maxLength={120}
				isRequired
			/>
			<TextField
				label={t("email")}
				description={t("emailHint")}
				type="email"
				autoComplete="email"
				value={email}
				onChange={setEmail}
				maxLength={254}
				isRequired
			/>
			<TextField
				label={t("phone")}
				description={t("phoneHint")}
				type="tel"
				autoComplete="tel"
				value={phone}
				onChange={setPhone}
				maxLength={32}
			/>
			<TextAreaField
				label={t("message")}
				description={t("messageHint")}
				value={message}
				onChange={setMessage}
				rows={5}
				minLength={10}
				maxLength={2000}
				isRequired
			/>
			{/* Honeypot: hidden from people and assistive technologies, filled by naive bots. */}
			<div aria-hidden="true" className="hidden">
				<label>
					Website
					<input
						type="text"
						name="website"
						tabIndex={-1}
						autoComplete="off"
						value={website}
						onChange={(event) => setWebsite(event.target.value)}
					/>
				</label>
			</div>
			<AltchaCheck ref={altcha} source="practitionerContact" />
			<p className="text-meta text-ink-muted">{t("privacy")}</p>
			<div>
				<Button
					intent="stamp"
					type="submit"
					isPending={submit.isPending}
					pendingLabel={tCommon("pending")}
				>
					{t("submit")}
				</Button>
			</div>
		</Form>
	);
}
