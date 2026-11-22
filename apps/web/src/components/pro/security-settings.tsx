"use client";

import {
	Badge,
	Button,
	buttonStyles,
	Form,
	linkStyles,
	Notice,
	OtpField,
	Radio,
	RadioGroup,
	TextField,
	tableStyles,
} from "@apercura/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Link, useRouter } from "~/i18n/navigation";
import { authClient } from "~/lib/auth-client";
import { type AuthErrorKey, authErrorKey } from "~/lib/auth-errors";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { currentReturnTo, type ReturnTo } from "~/lib/return-to";
import { useTRPC } from "~/trpc/client";
import { QrCode } from "./qr-code";

const table = tableStyles();
const sectionHeading = "type-title text-ink";

interface SecuritySettingsProps {
	totpEnabled: boolean;
	/** This session proved a second factor (sessions can then be listed and revoked). */
	mfaVerified: boolean;
	/** The account has no second factor yet. */
	enrolling: boolean;
}

function Section({
	id,
	title,
	lead,
	children,
}: {
	id: string;
	title: string;
	lead?: string;
	children: ReactNode;
}) {
	return (
		<section aria-labelledby={id} className="grid gap-6 md:grid-cols-12">
			<div className="flex flex-col gap-2 md:col-span-5">
				<h2 id={id} className={sectionHeading}>
					{title}
				</h2>
				{lead ? <p className="max-w-[60ch] text-body text-ink">{lead}</p> : null}
			</div>
			<div className="flex min-w-0 flex-col gap-5 md:col-span-7">{children}</div>
		</section>
	);
}

function useAction() {
	const [error, setError] = useState<AuthErrorKey | null>(null);
	const [pending, setPending] = useState(false);
	const run = async (action: () => Promise<{ error?: unknown } | null | undefined>) => {
		setPending(true);
		setError(null);
		try {
			const result = await action();
			if (result?.error) {
				setError(authErrorKey(result.error as { code?: string; status?: number }));
				return false;
			}
			return true;
		} catch {
			setError("generic");
			return false;
		} finally {
			setPending(false);
		}
	};
	return { error, pending, run, setError };
}

/** Reads the base32 secret out of an otpauth:// URI, for manual entry. */
function secretOf(totpURI: string) {
	try {
		return new URL(totpURI).searchParams.get("secret") ?? "";
	} catch {
		return "";
	}
}

/** Where "Continue" goes once a factor is enrolled: the claim the visitor came for, else the space. */
function useContinueTo(): ReturnTo | typeof PRO_ROUTES.home {
	const [target, setTarget] = useState<ReturnTo | null>(null);
	useEffect(() => setTarget(currentReturnTo()), []);
	return target ?? PRO_ROUTES.home;
}

function TotpSection({ enabled, enrolling }: { enabled: boolean; enrolling: boolean }) {
	const t = useTranslations("auth");
	const continueTo = useContinueTo();
	const router = useRouter();
	const { error, pending, run } = useAction();
	const [setup, setSetup] = useState<{ totpURI: string; backupCodes: string[] } | null>(null);
	const [code, setCode] = useState("");
	const [justEnabled, setJustEnabled] = useState(false);

	const onStart = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const password = String(new FormData(event.currentTarget).get("password") ?? "");
		void run(async () => {
			const result = await authClient.twoFactor.enable({ password, issuer: "Apercura" });
			if (result.data && "totpURI" in result.data && result.data.totpURI) {
				setSetup({ totpURI: result.data.totpURI, backupCodes: result.data.backupCodes ?? [] });
			}
			return result;
		});
	};

	const onVerify = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		void run(async () => {
			const result = await authClient.twoFactor.verifyTotp({ code });
			if (!result.error) {
				setSetup(null);
				setJustEnabled(true);
				router.refresh();
			}
			return result;
		});
	};

	const errorNotice = error ? <Notice tone="error" title={t(`errors.${error}`)} /> : null;

	let body: ReactNode;
	if (enabled || justEnabled) {
		body = (
			<Notice tone="success" title={t("security.totp.enabledTitle")}>
				{justEnabled && enrolling ? (
					<Link href={continueTo} className={linkStyles()}>
						{t("security.continue")}
					</Link>
				) : (
					t("security.totp.enabledBody")
				)}
			</Notice>
		);
	} else if (setup) {
		const secret = secretOf(setup.totpURI);
		body = (
			<ol className="flex flex-col gap-8">
				<li className="flex flex-col gap-3">
					<h3 className="type-subtitle text-ink">{t("security.totp.scanHeading")}</h3>
					<p className="text-body text-ink">{t("security.totp.scanLead")}</p>
					<QrCode value={setup.totpURI} label={t("security.totp.qrLabel")} />
					<dl className="flex flex-col gap-1">
						<dt className="font-display text-meta font-semibold text-ink font-stretch-semi-condensed">
							{t("security.totp.manualKey")}
						</dt>
						<dd>
							<code
								data-testid="totp-secret"
								className="block break-all font-body text-lead tracking-[0.08em] text-ink tabular"
							>
								{secret}
							</code>
						</dd>
					</dl>
				</li>
				<li className="flex flex-col gap-3">
					<h3 className="type-subtitle text-ink">{t("security.totp.codesHeading")}</h3>
					<p className="text-body text-ink">{t("security.totp.codesLead")}</p>
					<ol
						aria-label={t("security.totp.codesHeading")}
						className="grid grid-cols-2 gap-x-6 gap-y-1 border-y border-ink py-3 sm:grid-cols-3"
					>
						{setup.backupCodes.map((backupCode) => (
							<li key={backupCode} className="font-body text-body text-ink tabular">
								{backupCode}
							</li>
						))}
					</ol>
				</li>
				<li className="flex flex-col gap-3">
					<h3 className="type-subtitle text-ink">{t("security.totp.confirmHeading")}</h3>
					{errorNotice}
					<Form onSubmit={onVerify}>
						<OtpField
							name="code"
							label={t("common.totpCode")}
							value={code}
							onChange={setCode}
							isRequired
						/>
						<div>
							<Button
								intent="stamp"
								type="submit"
								isPending={pending}
								pendingLabel={t("common.pending")}
							>
								{t("security.totp.confirm")}
							</Button>
						</div>
					</Form>
				</li>
			</ol>
		);
	} else {
		body = (
			<>
				{errorNotice}
				<Form onSubmit={onStart}>
					<TextField
						name="password"
						type="password"
						label={t("security.totp.password")}
						description={t("security.totp.passwordHint")}
						autoComplete="current-password"
						isRequired
					/>
					<div>
						<Button
							intent="stamp"
							type="submit"
							isPending={pending}
							pendingLabel={t("common.pending")}
						>
							{t("security.totp.start")}
						</Button>
					</div>
				</Form>
			</>
		);
	}

	return (
		<Section id="security-totp" title={t("security.totp.heading")} lead={t("security.totp.lead")}>
			{body}
		</Section>
	);
}

function PasskeySection({ enrolling }: { enrolling: boolean }) {
	const t = useTranslations("auth");
	const continueTo = useContinueTo();
	const format = useFormatter();
	const router = useRouter();
	const { error, pending, run } = useAction();
	const passkeys = authClient.useListPasskeys();
	const [name, setName] = useState("");
	const [added, setAdded] = useState(false);

	const onAdd = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		void run(async () => {
			const result = await authClient.passkey.addPasskey({ name: name.trim() || undefined });
			if (!result?.error) {
				setName("");
				setAdded(true);
				await passkeys.refetch();
				router.refresh();
			}
			return result ?? null;
		});
	};

	const list = passkeys.data ?? [];

	return (
		<Section
			id="security-passkeys"
			title={t("security.passkeys.heading")}
			lead={t("security.passkeys.lead")}
		>
			{error ? <Notice tone="error" title={t(`errors.${error}`)} /> : null}
			{added ? (
				<Notice tone="success" title={t("security.passkeys.addedTitle")}>
					{enrolling ? (
						<Link href={continueTo} className={linkStyles()}>
							{t("security.continue")}
						</Link>
					) : null}
				</Notice>
			) : null}
			{list.length > 0 ? (
				<table className={table.table()} aria-labelledby="security-passkeys">
					<thead className={table.head()}>
						<tr>
							<th scope="col" className={table.column()}>
								{t("security.passkeys.name")}
							</th>
							<th scope="col" className={table.column()}>
								{t("security.passkeys.added")}
							</th>
							<th scope="col" className={table.column()}>
								<span className="sr-only">{t("security.actions")}</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{list.map((item) => (
							<tr key={item.id} className={table.row()}>
								<td className={table.cell()}>{item.name || t("security.passkeys.unnamed")}</td>
								<td className={table.cell({ className: "tabular" })}>
									{item.createdAt
										? format.dateTime(new Date(item.createdAt), { dateStyle: "medium" })
										: "—"}
								</td>
								<td className={table.cell({ className: "text-right" })}>
									<Button
										intent="quiet"
										isDisabled={pending}
										aria-label={t("security.passkeys.removeNamed", {
											name: item.name || t("security.passkeys.unnamed"),
										})}
										onPress={() =>
											void run(async () => {
												const result = await authClient.passkey.deletePasskey({ id: item.id });
												if (!result.error) {
													await passkeys.refetch();
												}
												return result;
											})
										}
									>
										{t("security.passkeys.remove")}
									</Button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			) : (
				<p className="text-body text-ink-muted">{t("security.passkeys.none")}</p>
			)}
			<Form onSubmit={onAdd}>
				<TextField
					name="passkeyName"
					label={t("security.passkeys.nameLabel")}
					description={t("security.passkeys.nameHint")}
					value={name}
					onChange={setName}
					maxLength={60}
				/>
				<div>
					<Button
						type="submit"
						intent={enrolling ? "stamp" : "ink"}
						isPending={pending}
						pendingLabel={t("common.pending")}
					>
						{t("security.passkeys.add")}
					</Button>
				</div>
			</Form>
		</Section>
	);
}

function SessionsSection() {
	const t = useTranslations("auth");
	const format = useFormatter();
	const router = useRouter();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const sessions = useQuery(trpc.account.sessions.queryOptions());
	const revoke = useMutation(
		trpc.account.revokeSession.mutationOptions({
			onSuccess: () =>
				queryClient.invalidateQueries({ queryKey: trpc.account.sessions.queryKey() }),
		}),
	);
	const everywhere = useAction();

	return (
		<Section
			id="security-sessions"
			title={t("security.sessions.heading")}
			lead={t("security.sessions.lead")}
		>
			{revoke.isError || sessions.isError ? (
				<Notice tone="error" title={t("errors.generic")} />
			) : null}
			{everywhere.error ? <Notice tone="error" title={t(`errors.${everywhere.error}`)} /> : null}
			{sessions.data ? (
				<table className={table.table()} aria-labelledby="security-sessions">
					<thead className={table.head()}>
						<tr>
							<th scope="col" className={table.column()}>
								{t("security.sessions.device")}
							</th>
							<th scope="col" className={table.column()}>
								{t("security.sessions.lastActive")}
							</th>
							<th scope="col" className={table.column()}>
								<span className="sr-only">{t("security.actions")}</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{sessions.data.map((item) => (
							<tr key={item.id} className={table.row()}>
								<td className={table.cell({ className: "max-w-[24ch] break-words text-meta" })}>
									{item.userAgent || t("security.sessions.unknownDevice")}
								</td>
								<td className={table.cell({ className: "tabular text-meta" })}>
									{format.dateTime(item.updatedAt, { dateStyle: "medium", timeStyle: "short" })}
								</td>
								<td className={table.cell({ className: "text-right" })}>
									{item.current ? (
										<Badge>{t("security.sessions.current")}</Badge>
									) : (
										<Button
											intent="quiet"
											isDisabled={revoke.isPending}
											onPress={() => revoke.mutate({ id: item.id })}
										>
											{t("security.sessions.revoke")}
										</Button>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			) : (
				<p className="text-body text-ink-muted" role="status">
					{t("common.loading")}
				</p>
			)}
			<div className="flex flex-col gap-2">
				<p className="text-meta text-ink-muted">{t("security.sessions.everywhereHint")}</p>
				<div>
					<Button
						intent="ink"
						isPending={everywhere.pending}
						pendingLabel={t("common.pending")}
						onPress={() =>
							void everywhere.run(async () => {
								const result = await authClient.revokeSessions();
								if (!result.error) {
									router.replace(PRO_ROUTES.signIn);
									router.refresh();
								}
								return result;
							})
						}
					>
						{t("security.sessions.everywhere")}
					</Button>
				</div>
			</div>
		</Section>
	);
}

type PracticeChoice = { kind: "close" } | { kind: "transfer"; memberUserId: string };

/** GDPR tools of the account: a JSON copy of its data, and deleting it. */
function DataSection() {
	const t = useTranslations("auth.security.data");
	const tCommon = useTranslations("auth.common");
	const router = useRouter();
	const trpc = useTRPC();
	const plan = useQuery(trpc.account.deletionPlan.queryOptions());
	const [confirmEmail, setConfirmEmail] = useState("");
	const [choices, setChoices] = useState<Record<string, PracticeChoice>>({});
	const remove = useMutation(
		trpc.account.delete.mutationOptions({
			onSuccess: () => {
				router.replace("/");
				router.refresh();
			},
		}),
	);
	const onDelete = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		remove.mutate({ confirmEmail, practices: choices });
	};
	const failure = remove.error?.message;
	return (
		<Section id="security-data" title={t("heading")} lead={t("lead")}>
			<div className="flex flex-col gap-2">
				<h3 className="type-subtitle text-ink">{t("exportHeading")}</h3>
				<p className="text-body text-ink">{t("exportBody")}</p>
				<div>
					<a href="/api/pro/account-export" download className={buttonStyles({ intent: "ink" })}>
						{t("export")}
					</a>
				</div>
			</div>
			<Form
				onSubmit={onDelete}
				className="flex flex-col gap-5 border-t border-rule-soft pt-5"
				aria-labelledby="security-delete"
			>
				<h3 id="security-delete" className="type-subtitle text-ink">
					{t("deleteHeading")}
				</h3>
				<p className="text-body text-ink">{t("deleteBody")}</p>
				{(plan.data ?? []).length > 0 ? (
					<p className="text-body text-ink">{t("closeEffect")}</p>
				) : null}
				{(plan.data ?? []).map((practice) =>
					practice.others > 0 ? (
						<RadioGroup
							key={practice.organizationId}
							label={t("practiceChoice", { name: practice.name })}
							value={
								choices[practice.organizationId]?.kind === "transfer"
									? `transfer:${(choices[practice.organizationId] as { memberUserId: string }).memberUserId}`
									: choices[practice.organizationId]
										? "close"
										: null
							}
							onChange={(value) =>
								setChoices((current) => ({
									...current,
									[practice.organizationId]: value.startsWith("transfer:")
										? { kind: "transfer", memberUserId: value.slice("transfer:".length) }
										: { kind: "close" },
								}))
							}
							isRequired
						>
							<Radio value="close">{t("close")}</Radio>
							{practice.members.map((person) => (
								<Radio key={person.userId} value={`transfer:${person.userId}`}>
									{t("transfer", { name: person.name, email: person.email })}
								</Radio>
							))}
						</RadioGroup>
					) : (
						<p key={practice.organizationId} className="text-meta text-ink-muted">
							{t("practiceAlone", { name: practice.name })}
						</p>
					),
				)}
				<TextField
					label={t("confirmEmail")}
					description={t("confirmEmailHint")}
					type="email"
					autoComplete="off"
					value={confirmEmail}
					onChange={setConfirmEmail}
					isRequired
				/>
				{failure ? (
					<Notice
						tone="error"
						title={
							failure === "CONFIRMATION_MISMATCH"
								? t("mismatch")
								: failure === "HAS_TEAM"
									? t("hasTeam")
									: failure === "LAST_ADMIN"
										? t("lastAdmin")
										: t("failed")
						}
					/>
				) : null}
				<div>
					<Button
						type="submit"
						intent="ink"
						isPending={remove.isPending}
						pendingLabel={tCommon("pending")}
					>
						{t("delete")}
					</Button>
				</div>
			</Form>
		</Section>
	);
}

/** Second factors (TOTP, passkeys) and open sessions. */
export function SecuritySettings({ totpEnabled, mfaVerified, enrolling }: SecuritySettingsProps) {
	const t = useTranslations("auth");
	// Kept from the first render: after enrolment the page refreshes with
	// `enrolling` false, and the "continue" link must stay.
	const [startedEnrolling] = useState(enrolling);
	return (
		<div className="flex flex-col gap-14">
			{enrolling ? (
				<Notice tone="info" title={t("security.enrolTitle")} role="none">
					{t("security.enrolBody")}
				</Notice>
			) : null}
			<TotpSection enabled={totpEnabled} enrolling={startedEnrolling} />
			<PasskeySection enrolling={startedEnrolling} />
			{mfaVerified ? <SessionsSection /> : null}
			{mfaVerified ? <DataSection /> : null}
		</div>
	);
}
