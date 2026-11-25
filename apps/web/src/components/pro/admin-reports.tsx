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
import { useState } from "react";
import { Link } from "~/i18n/navigation";
import { useTRPC } from "~/trpc/client";

const table = tableStyles();

type Revealed = { id: string; lines: { label: string; value: string }[] };

/** Removal requests (GDPR art. 21) and error reports, decrypted one at a time on demand. */
export function AdminReports() {
	const t = useTranslations("Admin.reports");
	const format = useFormatter();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const removals = useQuery(trpc.admin.removals.queue.queryOptions());
	const reports = useQuery(trpc.admin.reports.queue.queryOptions({ status: "open" }));
	const [revealed, setRevealed] = useState<Revealed | null>(null);
	const refresh = () => {
		setRevealed(null);
		void queryClient.invalidateQueries({ queryKey: trpc.admin.removals.queue.queryKey() });
		void queryClient.invalidateQueries({ queryKey: trpc.admin.reports.queue.queryKey() });
	};
	const readRemoval = useMutation(
		trpc.admin.removals.read.mutationOptions({
			onSuccess: (data) =>
				setRevealed({
					id: data.id,
					lines: [
						{ label: t("contact"), value: data.contact },
						...(data.message ? [{ label: t("message"), value: data.message }] : []),
					],
				}),
		}),
	);
	const decide = useMutation(trpc.admin.removals.decide.mutationOptions({ onSuccess: refresh }));
	const readReport = useMutation(
		trpc.admin.reports.read.mutationOptions({
			onSuccess: (data) =>
				setRevealed({
					id: data.id,
					lines: [
						{ label: t("message"), value: data.message },
						...(data.contact ? [{ label: t("contact"), value: data.contact }] : []),
					],
				}),
		}),
	);
	const resolve = useMutation(trpc.admin.reports.resolve.mutationOptions({ onSuccess: refresh }));
	const date = (value: Date) =>
		format.dateTime(new Date(value), { dateStyle: "medium", timeStyle: "short" });
	const failed = decide.isError || resolve.isError || readRemoval.isError || readReport.isError;

	const details = (id: string) =>
		revealed?.id === id ? (
			<dl className="mt-2 flex flex-col gap-1 border-s-0 bg-paper-shade p-3 text-meta">
				{revealed.lines.map((line) => (
					<div key={line.label} className="flex flex-col">
						<dt className="font-semibold text-ink">{line.label}</dt>
						<dd className="whitespace-pre-line break-words text-ink">{line.value}</dd>
					</div>
				))}
			</dl>
		) : null;

	return (
		<div className="flex flex-col gap-6">
			{failed ? (
				<Notice tone="error" title={decide.error?.message === "BUSY" ? t("busy") : t("failed")} />
			) : null}
			<p className="text-meta text-ink-muted">{t("auditNote")}</p>
			<Tabs>
				<TabList aria-label={t("tabsLabel")}>
					<Tab id="removals">{t("removalsTab", { count: removals.data?.length ?? 0 })}</Tab>
					<Tab id="reports">{t("reportsTab", { count: reports.data?.length ?? 0 })}</Tab>
				</TabList>
				<TabPanel id="removals" className="pt-6">
					{removals.data?.length === 0 ? (
						<EmptyState title={t("removalsEmpty")} headingLevel={3} />
					) : (
						<div className="overflow-x-auto">
							<table className={table.table()} aria-label={t("removalsCaption")}>
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
									{(removals.data ?? []).map((item) => (
										<tr key={item.id} className={table.row()}>
											<td className={table.cell()}>
												<Link
													href={{ pathname: "/praticien/[slug]", params: { slug: item.slug } }}
													className="underline"
												>
													{item.firstName} {item.lastName}
												</Link>
												<span className="block text-meta text-ink-muted tabular">
													{item.nationalId}
												</span>
												{details(item.id)}
											</td>
											<td className={table.cell({ className: "tabular text-meta" })}>
												{date(item.createdAt)}
											</td>
											<td className={table.cell({ className: "text-right" })}>
												<div className="flex flex-wrap justify-end gap-2">
													<Button
														intent="quiet"
														onPress={() => readRemoval.mutate({ id: item.id })}
													>
														{t("read")}
													</Button>
													<Button
														intent="ink"
														isDisabled={decide.isPending}
														onPress={() => decide.mutate({ id: item.id, confirm: true })}
													>
														{t("confirmRemoval")}
													</Button>
													<Button
														intent="quiet"
														isDisabled={decide.isPending}
														onPress={() =>
															decide.mutate({
																id: item.id,
																confirm: false,
																reason: t("rejectReason"),
															})
														}
													>
														{t("rejectRemoval")}
													</Button>
												</div>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</TabPanel>
				<TabPanel id="reports" className="pt-6">
					{reports.data?.length === 0 ? (
						<EmptyState title={t("reportsEmpty")} headingLevel={3} />
					) : (
						<div className="overflow-x-auto">
							<table className={table.table()} aria-label={t("reportsCaption")}>
								<thead className={table.head()}>
									<tr>
										<th scope="col" className={table.column()}>
											{t("columns.page")}
										</th>
										<th scope="col" className={table.column()}>
											{t("columns.kind")}
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
									{(reports.data ?? []).map((item) => (
										<tr key={item.id} className={table.row()}>
											<td className={table.cell()}>
												{item.slug ? (
													<Link
														href={{ pathname: "/praticien/[slug]", params: { slug: item.slug } }}
														className="underline"
													>
														{item.firstName} {item.lastName}
													</Link>
												) : (
													<span className="text-ink-muted">{t("noPage")}</span>
												)}
												{details(item.id)}
											</td>
											<td className={table.cell()}>
												<Badge tone={item.kind === "impersonation" ? "error" : "ink"}>
													{t(`kinds.${item.kind as "wrong_info"}`)}
												</Badge>
											</td>
											<td className={table.cell({ className: "tabular text-meta" })}>
												{date(item.createdAt)}
											</td>
											<td className={table.cell({ className: "text-right" })}>
												<div className="flex flex-wrap justify-end gap-2">
													<Button intent="quiet" onPress={() => readReport.mutate({ id: item.id })}>
														{t("read")}
													</Button>
													<Button
														intent="ink"
														isDisabled={resolve.isPending}
														onPress={() => resolve.mutate({ id: item.id, status: "resolved" })}
													>
														{t("resolve")}
													</Button>
													<Button
														intent="quiet"
														isDisabled={resolve.isPending}
														onPress={() => resolve.mutate({ id: item.id, status: "dismissed" })}
													>
														{t("dismiss")}
													</Button>
												</div>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</TabPanel>
			</Tabs>
		</div>
	);
}
