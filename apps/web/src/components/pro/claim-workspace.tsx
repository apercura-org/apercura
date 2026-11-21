"use client";

import {
	Badge,
	Button,
	buttonStyles,
	CheckIcon,
	Dialog,
	DialogTrigger,
	FileTrigger,
	Notice,
	Radio,
	RadioGroup,
	Seal,
} from "@apercura/ui";
import { useMutation } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { useFormatter, useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { getPathname, Link, useRouter } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { authClient } from "~/lib/auth-client";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { useTRPC } from "~/trpc/client";
import type { AppRouter } from "~/trpc/routers/_app";

type ClaimData = inferRouterOutputs<AppRouter>["claims"]["get"];
type CheckStatus = "pending" | "passed" | "failed" | undefined;

const sectionHeading = "font-display text-title font-bold text-ink font-stretch-semi-expanded";

function Section({
	id,
	title,
	status,
	lead,
	children,
}: {
	id: string;
	title: string;
	status?: ReactNode;
	lead?: ReactNode;
	children?: ReactNode;
}) {
	return (
		<section aria-labelledby={id} className="grid gap-6 border-t-2 border-ink pt-6 md:grid-cols-12">
			<div className="flex flex-col gap-3 md:col-span-5">
				<h2 id={id} className={sectionHeading}>
					{title}
				</h2>
				{status ? <div className="flex">{status}</div> : null}
				{lead ? <div className="max-w-[60ch] text-body text-ink">{lead}</div> : null}
			</div>
			<div className="flex min-w-0 flex-col gap-5 md:col-span-7">{children}</div>
		</section>
	);
}

function CheckBadge({ status }: { status: CheckStatus }) {
	const t = useTranslations("Claim.check");
	if (status === "passed") return <Badge tone="stamp">{t("passed")}</Badge>;
	if (status === "failed") return <Badge tone="error">{t("failed")}</Badge>;
	if (status === "pending") return <Badge>{t("pending")}</Badge>;
	return <Badge>{t("notStarted")}</Badge>;
}

const errorKeys = new Set([
	"NOT_OPEN",
	"METHOD_UNAVAILABLE",
	"TOO_MANY_ATTEMPTS",
	"NOT_SUBMITTABLE",
	"BAD_DOCUMENT",
	"PSC_MISSING",
	"FROZEN",
]);

/**
 * The claimant's side of a claim: Pro Santé Connect, the registry email link,
 * or documents plus the registry phone callback, then the review.
 */
export function ClaimWorkspace({
	data,
	pscOutcome,
	locale,
}: {
	data: ClaimData;
	pscOutcome: "verified" | "passed" | "mismatch" | "linkedElsewhere" | "error" | null;
	locale: Locale;
}) {
	const t = useTranslations("Claim");
	const format = useFormatter();
	const router = useRouter();
	const trpc = useTRPC();
	const { claim, checks } = data;
	const live = claim.status === "open" || claim.status === "in_review";
	const [error, setError] = useState<string | null>(null);
	const [code, setCode] = useState<string | null>(null);
	const [kind, setKind] = useState<"cps_card" | "ordre_attestation">("cps_card");
	const [uploading, setUploading] = useState(false);
	const [pscPending, setPscPending] = useState(false);

	const onError = (cause: { message?: string; data?: { code?: string } | null }) => {
		const key = cause.data?.code === "TOO_MANY_REQUESTS" ? "TOO_MANY" : (cause.message ?? "");
		setError(errorKeys.has(key) || key === "TOO_MANY" ? key : "generic");
	};
	const refresh = () => {
		setError(null);
		router.refresh();
	};
	const sendEmail = useMutation(
		trpc.claims.sendRegistryEmail.mutationOptions({ onSuccess: refresh, onError }),
	);
	const phoneCode = useMutation(
		trpc.claims.phoneCode.mutationOptions({
			onSuccess: (result) => {
				setCode(result.code);
				setError(null);
				// The check is now pending: refresh its badge (the code stays in local state).
				router.refresh();
			},
			onError,
		}),
	);
	const submit = useMutation(trpc.claims.submit.mutationOptions({ onSuccess: refresh, onError }));
	const withdraw = useMutation(
		trpc.claims.withdraw.mutationOptions({ onSuccess: refresh, onError }),
	);

	const claimPath = getPathname({
		href: { pathname: "/pro/revendiquer/[id]", params: { id: claim.id } },
		locale,
	});

	const startPsc = async () => {
		setPscPending(true);
		setError(null);
		const result = await authClient.linkSocial({
			provider: "psc" as never,
			callbackURL: `/api/pro/claims/${claim.id}/psc?locale=${locale}`,
			errorCallbackURL: `${claimPath}?psc=error`,
		});
		if (result.error) {
			setPscPending(false);
			setError("generic");
		}
	};

	const upload = async (files: FileList | null) => {
		const file = files?.[0];
		if (!file) return;
		setUploading(true);
		setError(null);
		const body = new FormData();
		body.set("kind", kind);
		body.set("file", file);
		try {
			const response = await fetch(`/api/pro/claims/${claim.id}/documents`, {
				method: "POST",
				body,
			});
			if (!response.ok) {
				const { error: code } = (await response.json().catch(() => ({}))) as { error?: string };
				setError(
					errorKeys.has(code ?? "")
						? (code as string)
						: response.status === 413
							? "BAD_DOCUMENT"
							: "generic",
				);
			} else {
				router.refresh();
			}
		} catch {
			setError("generic");
		} finally {
			setUploading(false);
		}
	};

	const has = (method: string) => data.methods.includes(method as never);
	const errorNotice = error ? <Notice tone="error" title={t(`errors.${error}` as never)} /> : null;

	return (
		<div className="flex flex-col gap-12">
			<ClaimStatus data={data} />
			{/* A verified outcome is the verified status below: say it once. */}
			{pscOutcome && pscOutcome !== "verified" ? (
				<Notice
					tone={pscOutcome === "passed" ? "success" : "error"}
					title={t(`psc.outcome.${pscOutcome}`)}
				/>
			) : null}
			{errorNotice}

			{live && has("psc") ? (
				<Section
					id="claim-psc"
					title={t("methods.psc.title")}
					status={<CheckBadge status={checks.psc} />}
					lead={t("methods.psc.lead")}
				>
					{checks.psc === "passed" ? (
						<p className="text-body text-ink">{t("methods.psc.done")}</p>
					) : (
						<div className="flex flex-col gap-3">
							<div>
								<Button
									size="lg"
									isPending={pscPending}
									pendingLabel={t("pending")}
									onPress={() => void startPsc()}
								>
									{t("methods.psc.action")}
								</Button>
							</div>
							<p className="text-meta text-ink-muted">{t("methods.psc.hint")}</p>
						</div>
					)}
				</Section>
			) : null}

			{live && has("registry_email") ? (
				<Section
					id="claim-email"
					title={t("methods.registry_email.title")}
					status={<CheckBadge status={checks.registry_email} />}
					lead={t("methods.registry_email.lead", { email: data.registryEmails.join(", ") })}
				>
					{checks.registry_email === "passed" ? (
						<p className="text-body text-ink">{t("methods.registry_email.done")}</p>
					) : (
						<div className="flex flex-col gap-3">
							{checks.registry_email === "pending" ? (
								<Notice tone="info" title={t("methods.registry_email.sent")} role="status" />
							) : null}
							<div>
								<Button
									intent={has("psc") ? "ink" : "stamp"}
									isPending={sendEmail.isPending}
									pendingLabel={t("pending")}
									onPress={() => sendEmail.mutate({ claimId: claim.id })}
								>
									{checks.registry_email === "pending"
										? t("methods.registry_email.resend")
										: t("methods.registry_email.action")}
								</Button>
							</div>
						</div>
					)}
				</Section>
			) : null}

			{live && has("document") ? (
				<Section
					id="claim-documents"
					title={t("methods.document.title")}
					status={<CheckBadge status={checks.document} />}
					lead={t("methods.document.lead")}
				>
					{data.documents.length > 0 ? (
						<ul className="flex flex-col border-t-[1.5px] border-ink">
							{data.documents.map((document) => (
								<li
									key={document.id}
									className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule-soft py-2.5"
								>
									<span className="text-body text-ink">
										{t(`documents.kind.${document.kind as "cps_card" | "ordre_attestation"}`)}
									</span>
									<span className="text-meta text-ink-muted tabular">
										{format.dateTime(new Date(document.createdAt), { dateStyle: "medium" })} ·{" "}
										{format.number(document.byteSize / 1024, { maximumFractionDigits: 0 })}{" "}
										{t("documents.kilobytes")}
									</span>
								</li>
							))}
						</ul>
					) : null}
					{claim.status === "open" ? (
						<div className="flex flex-col gap-4">
							<RadioGroup
								label={t("documents.kindLabel")}
								value={kind}
								onChange={(value) => setKind(value as typeof kind)}
							>
								<Radio value="cps_card">{t("documents.kind.cps_card")}</Radio>
								<Radio value="ordre_attestation">{t("documents.kind.ordre_attestation")}</Radio>
							</RadioGroup>
							<div className="flex flex-col gap-2">
								<div>
									<FileTrigger
										acceptedFileTypes={["application/pdf", "image/jpeg", "image/png", "image/webp"]}
										onSelect={(files) => void upload(files)}
										isPending={uploading}
										pendingLabel={t("pending")}
									>
										{t("documents.add")}
									</FileTrigger>
								</div>
								<p className="text-meta text-ink-muted">{t("documents.hint")}</p>
							</div>
						</div>
					) : null}
				</Section>
			) : null}

			{live && has("phone_callback") ? (
				<Section
					id="claim-phone"
					title={t("methods.phone_callback.title")}
					status={<CheckBadge status={checks.phone_callback} />}
					lead={t("methods.phone_callback.lead", { phone: data.registryPhones.join(", ") })}
				>
					{checks.phone_callback === "passed" ? (
						<p className="text-body text-ink">{t("methods.phone_callback.done")}</p>
					) : code ? (
						<div className="flex flex-col gap-3">
							<p className="caps text-ink">{t("methods.phone_callback.codeLabel")}</p>
							<p
								data-testid="callback-code"
								className="w-fit border-y-2 border-ink px-1 py-2 font-body text-headline font-bold tracking-[0.3em] text-ink tabular"
							>
								{code}
							</p>
							<p className="text-meta text-ink-muted">{t("methods.phone_callback.codeHint")}</p>
						</div>
					) : (
						<div className="flex flex-col gap-3">
							<div>
								<Button
									intent="ink"
									isPending={phoneCode.isPending}
									pendingLabel={t("pending")}
									onPress={() => phoneCode.mutate({ claimId: claim.id })}
								>
									{checks.phone_callback === "pending"
										? t("methods.phone_callback.newCode")
										: t("methods.phone_callback.action")}
								</Button>
							</div>
							<p className="text-meta text-ink-muted">{t("methods.phone_callback.hint")}</p>
						</div>
					)}
				</Section>
			) : null}

			{claim.status === "open" ? (
				<Section id="claim-review" title={t("review.title")} lead={t("review.lead")}>
					<div className="flex flex-wrap items-center gap-4">
						<Button
							isDisabled={!data.canSubmit}
							isPending={submit.isPending}
							pendingLabel={t("pending")}
							onPress={() => submit.mutate({ claimId: claim.id })}
						>
							{t("review.submit")}
						</Button>
						{data.canSubmit ? null : (
							<p className="text-meta text-ink-muted">{t("review.notYet")}</p>
						)}
					</div>
				</Section>
			) : null}

			{live ? (
				<div className="border-t border-rule-soft pt-4">
					<DialogTrigger>
						<Button
							intent="quiet"
							className="px-0"
							isPending={withdraw.isPending}
							pendingLabel={t("pending")}
						>
							{t("withdraw")}
						</Button>
						<Dialog
							role="alertdialog"
							title={t("withdrawDialog.title")}
							closeLabel={t("withdrawDialog.cancel")}
						>
							{({ close }) => (
								<div className="flex flex-col gap-5">
									<p className="max-w-[60ch] text-body text-ink">{t("withdrawDialog.body")}</p>
									<div className="flex flex-wrap gap-3">
										<Button
											intent="ink"
											onPress={() => {
												close();
												withdraw.mutate({ claimId: claim.id });
											}}
										>
											{t("withdrawDialog.confirm")}
										</Button>
										<Button intent="quiet" onPress={close}>
											{t("withdrawDialog.cancel")}
										</Button>
									</div>
								</div>
							)}
						</Dialog>
					</DialogTrigger>
				</div>
			) : null}
		</div>
	);
}

function ClaimStatus({ data }: { data: ClaimData }) {
	const t = useTranslations("Claim");
	const format = useFormatter();
	const { claim } = data;
	if (claim.status === "verified") {
		// The stamp law: verified is printed in violet, with the page's seal ringed in stamp ink.
		return (
			<section
				aria-labelledby="claim-verified"
				role="status"
				className="flex flex-col gap-5 border-y-2 border-ink py-6 sm:flex-row sm:items-start sm:gap-6"
			>
				<Seal rpps={data.practitioner.nationalId} verified size={72} />
				<div className="flex min-w-0 flex-col gap-3">
					<div>
						<Badge tone="stamp">
							<CheckIcon className="size-4" strokeWidth={2.5} />
							{t("status.verifiedBadge")}
						</Badge>
					</div>
					<h2
						id="claim-verified"
						className="font-display text-title font-bold text-ink font-stretch-semi-expanded"
					>
						{t("status.verified")}
					</h2>
					{claim.bookingOpensAt && new Date(claim.bookingOpensAt) > new Date() ? (
						<p className="max-w-[60ch] text-body text-ink">
							{t("status.bookingDelay", {
								date: format.dateTime(new Date(claim.bookingOpensAt), { dateStyle: "long" }),
							})}
						</p>
					) : null}
					<div>
						<Link href={PRO_ROUTES.onboarding} className={buttonStyles({ intent: "stamp" })}>
							{t("status.continue")}
						</Link>
					</div>
				</div>
			</section>
		);
	}
	if (claim.status === "in_review") {
		return (
			<Notice tone="info" title={t("status.in_review")} role="status">
				{claim.contest ? t("status.contestReview") : t("status.reviewBody")}
			</Notice>
		);
	}
	if (claim.status === "rejected") {
		return (
			<Notice tone="error" title={t("status.rejected")}>
				{claim.decisionReason ? t("status.reason", { reason: claim.decisionReason }) : null}
			</Notice>
		);
	}
	if (claim.status === "withdrawn" || claim.status === "superseded") {
		return <Notice tone="info" title={t(`status.${claim.status}`)} />;
	}
	return claim.contest ? (
		<Notice tone="info" title={t("status.contestTitle")} role="none">
			{t("status.contestBody")}
		</Notice>
	) : null;
}
