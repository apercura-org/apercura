"use client";

import {
	Badge,
	Button,
	EmptyState,
	Notice,
	Tab,
	TabList,
	TabPanel,
	Tabs,
	tableStyles,
} from "@apercura/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { type Key, useState } from "react";
import { Link } from "~/i18n/navigation";
import { useTRPC } from "~/trpc/client";

const table = tableStyles();

const STATUSES = ["new", "contacted", "closed"] as const;
type Status = (typeof STATUSES)[number];

/** What an administrator may move a request to from each status. */
const NEXT: Record<Status, Status[]> = {
	new: ["contacted", "closed"],
	contacted: ["closed", "new"],
	closed: ["new"],
};

type Revealed = {
	id: string;
	name: string;
	email: string;
	phone: string | null;
	message: string;
};

/**
 * "I am this practitioner" contact requests, by status. Each one is decrypted on demand (an
 * audited action); the administrator answers by email from their own mailbox, then records it.
 */
export function AdminContacts() {
	const t = useTranslations("Admin.contacts");
	const format = useFormatter();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [status, setStatus] = useState<Status>("new");
	const queue = useQuery(trpc.admin.contacts.queue.queryOptions({ status }));
	const [revealed, setRevealed] = useState<Revealed | null>(null);
	const read = useMutation(
		trpc.admin.contacts.read.mutationOptions({ onSuccess: (data) => setRevealed(data) }),
	);
	const move = useMutation(
		trpc.admin.contacts.setStatus.mutationOptions({
			onSuccess: () => {
				setRevealed(null);
				void queryClient.invalidateQueries({ queryKey: trpc.admin.contacts.queue.queryKey() });
			},
		}),
	);
	const date = (value: Date) =>
		format.dateTime(new Date(value), { dateStyle: "medium", timeStyle: "short" });
	const counts = queue.data?.counts;

	return (
		<div className="flex flex-col gap-6">
			{read.isError || move.isError ? <Notice tone="error" title={t("failed")} /> : null}
			<p className="max-w-[65ch] text-meta text-ink-muted">{t("auditNote")}</p>
			<Tabs
				selectedKey={status}
				onSelectionChange={(key: Key) => {
					setRevealed(null);
					setStatus(key as Status);
				}}
			>
				<TabList aria-label={t("tabsLabel")}>
					{STATUSES.map((item) => (
						<Tab key={item} id={item}>
							{t(`tabs.${item}`, { count: counts?.[item] ?? 0 })}
						</Tab>
					))}
				</TabList>
				{STATUSES.map((item) => (
					<TabPanel key={item} id={item} className="pt-6">
						{queue.data && queue.data.items.length === 0 ? (
							<EmptyState title={t(`empty.${item}`)} headingLevel={3} />
						) : (
							<div className="overflow-x-auto">
								<table className={table.table()} aria-label={t("caption")}>
									<thead className={table.head()}>
										<tr>
											<th scope="col" className={table.column()}>
												{t("columns.page")}
											</th>
											<th scope="col" className={table.column()}>
												{t("columns.received")}
											</th>
											<th scope="col" className={table.column()}>
												<span className="sr-only">{t("columns.actions")}</span>
											</th>
										</tr>
									</thead>
									<tbody>
										{(queue.data?.items ?? []).map((request) => (
											<tr key={request.id} className={table.row()}>
												<td className={table.cell()}>
													<Link
														href={{ pathname: "/praticien/[slug]", params: { slug: request.slug } }}
														className="underline"
													>
														{request.firstName} {request.lastName}
													</Link>
													<span className="block text-meta text-ink-muted tabular">
														{request.nationalId}
													</span>
													{request.claimStatus === "claimed" ? (
														<Badge tone="ink">{t("claimedNow")}</Badge>
													) : null}
													{revealed?.id === request.id ? (
														<dl className="mt-2 flex flex-col gap-1 bg-paper-shade p-3 text-meta">
															{[
																{ label: t("fields.name"), value: revealed.name },
																{ label: t("fields.email"), value: revealed.email },
																...(revealed.phone
																	? [{ label: t("fields.phone"), value: revealed.phone }]
																	: []),
																{ label: t("fields.message"), value: revealed.message },
															].map((line) => (
																<div key={line.label} className="flex flex-col">
																	<dt className="font-semibold text-ink">{line.label}</dt>
																	<dd className="whitespace-pre-line break-words text-ink">
																		{line.value}
																	</dd>
																</div>
															))}
														</dl>
													) : null}
												</td>
												<td className={table.cell({ className: "tabular text-meta" })}>
													{date(request.createdAt)}
												</td>
												<td className={table.cell({ className: "text-right" })}>
													<div className="flex flex-wrap justify-end gap-2">
														<Button intent="quiet" onPress={() => read.mutate({ id: request.id })}>
															{t("read")}
														</Button>
														{NEXT[item].map((next) => (
															<Button
																key={next}
																intent={next === "new" ? "quiet" : "ink"}
																isDisabled={move.isPending}
																onPress={() => move.mutate({ id: request.id, status: next })}
															>
																{t(`move.${next}`)}
															</Button>
														))}
													</div>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</TabPanel>
				))}
			</Tabs>
		</div>
	);
}
