"use client";

import { Button, Notice, SkeletonText, tableStyles } from "@apercura/ui";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useTRPC } from "~/trpc/client";

const table = tableStyles();

const KNOWN_PURPOSES = new Set(["agenda_list", "notify", "manage", "ics_feed", "decrypt_volume"]);

/** The practice's access log, newest first, page by page (owners only). */
export function AccessLog({ organizationId }: { organizationId: string }) {
	const t = useTranslations("Agenda.log");
	const tCommon = useTranslations("Agenda.common");
	const format = useFormatter();
	const trpc = useTRPC();
	const query = useInfiniteQuery(
		trpc.audit.list.infiniteQueryOptions(
			{ organizationId, limit: 50 },
			{ getNextPageParam: (page) => page.nextCursor ?? undefined },
		),
	);

	if (query.isPending) {
		return <SkeletonText lines={6} label={t("title")} />;
	}
	if (query.isError) {
		return (
			<Notice tone="error">
				{tCommon("loadFailed")}{" "}
				<Button intent="quiet" onPress={() => void query.refetch()}>
					{tCommon("retry")}
				</Button>
			</Notice>
		);
	}
	const pages = query.data.pages;
	const events = pages.flatMap((page) => page.events);
	const alert = pages[0]?.latestAlert;
	const when = (date: Date) => format.dateTime(date, { dateStyle: "medium", timeStyle: "short" });
	const who = (event: (typeof events)[number]) => {
		if (event.userId) return event.userName ?? t("actor.unknown");
		if (event.actor === "patient") return t("actor.patient");
		return t("actor.system");
	};

	return (
		<div className="flex flex-col gap-6">
			{alert ? (
				<Notice tone="error">
					{t("alert", { date: when(alert.createdAt), name: alert.userName ?? t("actor.unknown") })}
				</Notice>
			) : null}
			{events.length === 0 ? (
				<p className="text-body text-ink">{t("empty")}</p>
			) : (
				<div className="overflow-x-auto">
					<table className={table.table()}>
						<thead className={table.head()}>
							<tr>
								<th scope="col" className={table.column()}>
									{t("columns.when")}
								</th>
								<th scope="col" className={table.column()}>
									{t("columns.who")}
								</th>
								<th scope="col" className={table.column()}>
									{t("columns.what")}
								</th>
								<th scope="col" className={table.column()}>
									{t("columns.why")}
								</th>
								<th scope="col" className={`${table.column()} text-end`}>
									{t("columns.records")}
								</th>
							</tr>
						</thead>
						<tbody>
							{events.map((event) => (
								<tr key={event.id} className={table.row()}>
									<td className={`${table.cell()} whitespace-nowrap tabular`}>
										{when(event.createdAt)}
									</td>
									<td className={table.cell()}>
										<span className="flex flex-col">
											<span className="font-semibold">{who(event)}</span>
											{event.userEmail ? (
												<span className="text-meta text-ink-muted">{event.userEmail}</span>
											) : null}
										</span>
									</td>
									<td className={table.cell()}>
										{event.action === "decrypt" || event.action === "alert"
											? t(`action.${event.action}`)
											: t("action.unknown", { action: event.action })}
									</td>
									<td className={table.cell()}>
										{KNOWN_PURPOSES.has(event.purpose)
											? t(`purpose.${event.purpose as "agenda_list"}`)
											: t("purpose.unknown", { purpose: event.purpose })}
									</td>
									<td className={`${table.cell()} text-end tabular`}>
										{event.action === "alert" ? "" : t("records", { count: event.records })}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			{query.hasNextPage ? (
				<div>
					<Button
						intent="ink"
						isPending={query.isFetchingNextPage}
						onPress={() => void query.fetchNextPage()}
					>
						{t("more")}
					</Button>
				</div>
			) : null}
		</div>
	);
}
