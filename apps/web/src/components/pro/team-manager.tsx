"use client";

import {
	Badge,
	Button,
	Dialog,
	Form,
	ListBoxItem,
	Notice,
	Select,
	SkeletonText,
	TextField,
	tableStyles,
} from "@apercura/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { useTRPC } from "~/trpc/client";

const table = tableStyles();
const sectionHeading = "font-display text-title font-bold text-ink font-stretch-semi-expanded";
const ROLES = ["practitioner", "assistant"] as const;
type Role = (typeof ROLES)[number];

type Result = { tone: "success" | "error"; text: string } | null;

/**
 * The owner's team page: what each role can do, the invitation form, the members (with whether
 * they set up a second factor) and the open invitations. Every change is checked again on the
 * server against the membership read from the database.
 */
export function TeamManager({
	organizationId,
	userId,
}: {
	organizationId: string;
	userId: string;
}) {
	const t = useTranslations("Team");
	const tRoles = useTranslations("auth.roles");
	const tCommon = useTranslations("Agenda.common");
	const format = useFormatter();
	const locale = useLocale() === "en" ? "en" : "fr";
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const team = useQuery(trpc.team.list.queryOptions({ organizationId }));
	const invite = useMutation(trpc.team.invite.mutationOptions());
	const cancel = useMutation(trpc.team.cancelInvitation.mutationOptions());
	const updateRole = useMutation(trpc.team.updateRole.mutationOptions());
	const remove = useMutation(trpc.team.remove.mutationOptions());
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<Role>("assistant");
	const [submitted, setSubmitted] = useState(false);
	const [result, setResult] = useState<Result>(null);
	const [roles, setRoles] = useState<Record<string, Role>>({});
	const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
	const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.team.pathKey() });
	const emailInvalid = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

	const send = (address: string, chosen: Role) =>
		invite.mutate(
			{ organizationId, email: address, role: chosen, locale },
			{
				onSuccess: (created) => {
					setResult({ tone: "success", text: t("invite.sent", { email: created.email }) });
					setEmail("");
					setSubmitted(false);
					void refresh();
				},
				onError: (error) =>
					setResult({
						tone: "error",
						text:
							error.message === "ALREADY_MEMBER"
								? t("invite.alreadyMember")
								: error.data?.code === "TOO_MANY_REQUESTS"
									? t("invite.rateLimited")
									: tCommon("failed"),
					}),
			},
		);

	const onInvite = (event: FormEvent) => {
		event.preventDefault();
		setSubmitted(true);
		setResult(null);
		if (emailInvalid) return;
		send(email.trim(), role);
	};

	return (
		<div className="flex flex-col gap-12">
			<section aria-labelledby="team-roles" className="flex flex-col gap-4">
				<h2 id="team-roles" className={sectionHeading}>
					{t("roles.heading")}
				</h2>
				<dl className="grid max-w-3xl border-t-[1.5px] border-ink sm:grid-cols-[10rem_1fr]">
					{(["owner", "practitioner", "assistant"] as const).map((item) => (
						<div key={item} className="contents">
							<dt className="pt-3 font-display text-meta font-semibold text-ink font-stretch-semi-condensed sm:border-b sm:border-rule-soft sm:pb-3">
								{tRoles(item)}
							</dt>
							<dd className="border-b border-rule-soft pb-3 text-body text-ink sm:pt-3">
								{t(`roles.${item}`)}
							</dd>
						</div>
					))}
				</dl>
			</section>

			<section aria-labelledby="team-invite" className="flex flex-col gap-4">
				<h2 id="team-invite" className={sectionHeading}>
					{t("invite.heading")}
				</h2>
				<p className="max-w-[65ch] text-meta text-ink-muted">{t("invite.note")}</p>
				<Form onSubmit={onInvite} className="flex flex-col gap-4" validationBehavior="aria">
					<div className="grid max-w-3xl gap-4 sm:grid-cols-[2fr_1fr]">
						<TextField
							label={t("invite.email")}
							type="email"
							value={email}
							onChange={setEmail}
							isRequired
							maxLength={254}
							autoComplete="off"
							isInvalid={submitted && emailInvalid}
							errorMessage={t("invite.invalidEmail")}
						/>
						<Select
							label={t("invite.role")}
							selectedKey={role}
							onSelectionChange={(key) => key !== null && setRole(key as Role)}
						>
							{ROLES.map((item) => (
								<ListBoxItem key={item} id={item}>
									{tRoles(item)}
								</ListBoxItem>
							))}
						</Select>
					</div>
					{result ? (
						<Notice tone={result.tone} className="max-w-3xl">
							{result.text}
						</Notice>
					) : null}
					<div>
						<Button type="submit" isPending={invite.isPending} pendingLabel={t("invite.pending")}>
							{t("invite.submit")}
						</Button>
					</div>
				</Form>
			</section>

			<section aria-labelledby="team-members" className="flex flex-col gap-4">
				<h2 id="team-members" className={sectionHeading}>
					{t("members.heading")}
				</h2>
				{team.isPending ? (
					<SkeletonText lines={3} label={t("members.heading")} />
				) : team.isError ? (
					<Notice tone="error">{tCommon("loadFailed")}</Notice>
				) : (
					<div className="overflow-x-auto">
						<table className={table.table()}>
							<thead className={table.head()}>
								<tr>
									<th scope="col" className={table.column()}>
										{t("members.columns.name")}
									</th>
									<th scope="col" className={table.column()}>
										{t("members.columns.role")}
									</th>
									<th scope="col" className={table.column()}>
										{t("members.columns.factor")}
									</th>
									<th scope="col" className={table.column()}>
										{t("members.columns.actions")}
									</th>
								</tr>
							</thead>
							<tbody>
								{team.data.members.map((person) => {
									const self = person.userId === userId;
									const current = (ROLES as readonly string[]).includes(person.role)
										? (person.role as Role)
										: "assistant";
									const chosen = roles[person.id] ?? current;
									return (
										<tr key={person.id} className={table.row()}>
											<td className={table.cell()}>
												<span className="flex flex-col">
													<span className="font-semibold">
														{person.name}
														{self ? (
															<span className="ms-2 align-middle">
																<Badge>{t("members.you")}</Badge>
															</span>
														) : null}
													</span>
													<span className="text-meta text-ink-muted">{person.email}</span>
												</span>
											</td>
											<td className={table.cell()}>
												{person.owner ? (
													tRoles("owner")
												) : (
													<Select
														aria-label={t("members.roleOf", { name: person.name })}
														label={
															<span className="sr-only">
																{t("members.roleOf", { name: person.name })}
															</span>
														}
														selectedKey={chosen}
														onSelectionChange={(key) =>
															key !== null &&
															setRoles((all) => ({ ...all, [person.id]: key as Role }))
														}
														className="min-w-40"
													>
														{ROLES.map((item) => (
															<ListBoxItem key={item} id={item}>
																{tRoles(item)}
															</ListBoxItem>
														))}
													</Select>
												)}
											</td>
											<td className={table.cell()}>
												{person.secondFactor ? t("members.factorYes") : t("members.factorNo")}
											</td>
											<td className={table.cell()}>
												{person.owner || self ? null : (
													<span className="flex flex-wrap gap-x-1">
														{chosen !== current ? (
															<Button
																intent="quiet"
																isPending={
																	updateRole.isPending &&
																	updateRole.variables?.memberId === person.id
																}
																onPress={() =>
																	updateRole.mutate(
																		{ organizationId, memberId: person.id, role: chosen },
																		{
																			onSuccess: () => {
																				setResult({
																					tone: "success",
																					text: t("members.roleChanged"),
																				});
																				void refresh();
																			},
																			onError: () =>
																				setResult({ tone: "error", text: tCommon("failed") }),
																		},
																	)
																}
															>
																{t("members.saveRole")}
															</Button>
														) : null}
														<Button
															intent="quiet"
															aria-label={t("members.removeLabel", { name: person.name })}
															onPress={() => setRemoving({ id: person.id, name: person.name })}
														>
															{t("members.remove")}
														</Button>
													</span>
												)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</section>

			<section aria-labelledby="team-invitations" className="flex flex-col gap-4">
				<h2 id="team-invitations" className={sectionHeading}>
					{t("invitations.heading")}
				</h2>
				{team.data && team.data.invitations.length === 0 ? (
					<p className="text-body text-ink">{t("invitations.empty")}</p>
				) : team.data ? (
					<div className="overflow-x-auto">
						<table className={table.table()}>
							<thead className={table.head()}>
								<tr>
									<th scope="col" className={table.column()}>
										{t("invitations.columns.email")}
									</th>
									<th scope="col" className={table.column()}>
										{t("invitations.columns.role")}
									</th>
									<th scope="col" className={table.column()}>
										{t("invitations.columns.expires")}
									</th>
									<th scope="col" className={table.column()}>
										{t("invitations.columns.actions")}
									</th>
								</tr>
							</thead>
							<tbody>
								{team.data.invitations.map((item) => {
									const itemRole = (ROLES as readonly string[]).includes(item.role ?? "")
										? (item.role as Role)
										: "assistant";
									return (
										<tr key={item.id} className={table.row()}>
											<td className={table.cell()}>{item.email}</td>
											<td className={table.cell()}>{tRoles(itemRole)}</td>
											<td className={`${table.cell()} tabular`}>
												{item.expired
													? t("invitations.expired")
													: format.dateTime(item.expiresAt, {
															dateStyle: "medium",
															timeStyle: "short",
														})}
											</td>
											<td className={table.cell()}>
												<span className="flex flex-wrap gap-x-1">
													<Button
														intent="quiet"
														aria-label={t("invitations.resendLabel", { email: item.email })}
														isPending={invite.isPending && invite.variables?.email === item.email}
														onPress={() => send(item.email, itemRole)}
													>
														{t("invitations.resend")}
													</Button>
													<Button
														intent="quiet"
														aria-label={t("invitations.cancelLabel", { email: item.email })}
														isPending={
															cancel.isPending && cancel.variables?.invitationId === item.id
														}
														onPress={() =>
															cancel.mutate(
																{ organizationId, invitationId: item.id },
																{
																	onSuccess: () => {
																		setResult({
																			tone: "success",
																			text: t("invitations.cancelled"),
																		});
																		void refresh();
																	},
																	onError: () =>
																		setResult({ tone: "error", text: tCommon("failed") }),
																},
															)
														}
													>
														{t("invitations.cancel")}
													</Button>
												</span>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				) : null}
			</section>

			{removing ? (
				<Dialog
					role="alertdialog"
					title={t("members.removeTitle", { name: removing.name })}
					closeLabel={tCommon("close")}
					isOpen
					onOpenChange={(open) => {
						if (!open) setRemoving(null);
					}}
				>
					{({ close }) => (
						<div className="flex flex-col gap-4">
							<p className="text-body text-ink">{t("members.removeBody")}</p>
							<div className="flex flex-wrap gap-3">
								<Button
									isPending={remove.isPending}
									onPress={() =>
										remove.mutate(
											{ organizationId, memberId: removing.id },
											{
												onSuccess: () => {
													setResult({
														tone: "success",
														text: t("members.removed", { name: removing.name }),
													});
													void refresh();
													close();
												},
												onError: () => setResult({ tone: "error", text: tCommon("failed") }),
											},
										)
									}
								>
									{t("members.confirmRemove")}
								</Button>
								<Button intent="ink" onPress={close}>
									{tCommon("keep")}
								</Button>
							</div>
						</div>
					)}
				</Dialog>
			) : null}
		</div>
	);
}
