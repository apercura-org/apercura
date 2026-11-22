"use client";

import {
	Badge,
	Button,
	buttonStyles,
	EmptyState,
	Notice,
	SkeletonText,
	tableStyles,
} from "@apercura/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Link } from "~/i18n/navigation";
import { dayBounds, instantToLocalDate, localMinutes } from "~/lib/agenda-time";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { useTRPC } from "~/trpc/client";
import {
	AccessNote,
	AddEntryDialog,
	type AgendaCalendar,
	type AgendaEntry,
	EntryDialog,
	errorCode,
	placeName,
	sectionHeading,
	useAgendaFormat,
	useAgendaRefresh,
	usePatientName,
} from "./agenda-shared";

const table = tableStyles();
const DAY_MS = 86_400_000;

function useClock() {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 60_000);
		return () => window.clearInterval(timer);
	}, []);
	return now;
}

/**
 * "Today": the next patient, the day's appointments in time order, the requests waiting for an
 * answer, and the quick actions (cancel with a message, no-show, block a time slot).
 */
export function TodayView({
	organizationId,
	isOwner,
}: {
	organizationId: string;
	isOwner: boolean;
}) {
	const t = useTranslations("Agenda.today");
	const tCommon = useTranslations("Agenda.common");
	const trpc = useTRPC();
	const nowMs = useClock();
	const refresh = useAgendaRefresh();
	const calendarsQuery = useQuery(trpc.agenda.calendars.queryOptions({ organizationId }));
	const calendars = calendarsQuery.data ?? [];
	const main = calendars[0];
	const timeZone = main?.timeZone ?? "Europe/Paris";
	const today = instantToLocalDate(nowMs, timeZone);
	const [dayStart, dayEnd] = dayBounds(today, timeZone);
	// Rounded to the hour so the query key (and the audited read) does not change every minute.
	const hourMs = Math.floor(nowMs / 3_600_000) * 3_600_000;
	const dayQuery = useQuery({
		...trpc.agenda.list.queryOptions({
			organizationId,
			from: new Date(dayStart),
			to: new Date(dayEnd),
		}),
		enabled: main !== undefined,
	});
	const requestsQuery = useQuery({
		...trpc.agenda.list.queryOptions({
			organizationId,
			from: new Date(hourMs - 3_600_000),
			to: new Date(hourMs + 42 * DAY_MS - 3_600_000),
			statuses: ["pending"],
		}),
		enabled: main !== undefined,
	});
	const format = useAgendaFormat(timeZone);
	const patientName = usePatientName();
	const decide = useMutation(trpc.agenda.decide.mutationOptions());
	const noShow = useMutation(trpc.agenda.noShow.mutationOptions());
	const [opened, setOpened] = useState<AgendaEntry | null>(null);
	const [blocking, setBlocking] = useState(false);
	const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

	const byId = useMemo(
		() => new Map<string, AgendaCalendar>(calendars.map((calendar) => [calendar.id, calendar])),
		[calendars],
	);
	const day = (dayQuery.data ?? []).filter(
		(entry) => entry.kind === "block" || entry.status !== "held",
	);
	const appointments = day.filter((entry) => entry.kind === "appointment");
	const next = appointments.find(
		(entry) =>
			(entry.status === "confirmed" || entry.status === "pending") &&
			entry.endsAt.getTime() > nowMs,
	);
	const requests = (requestsQuery.data ?? []).filter((entry) => entry.status === "pending");

	const answer = (entry: AgendaEntry, decision: "approve" | "decline") =>
		decide.mutate(
			{ organizationId, appointmentId: entry.id, decision },
			{
				onSuccess: () => {
					setNotice({
						tone: "success",
						text: decision === "approve" ? t("requests.approved") : t("requests.declined"),
					});
					void refresh();
				},
				onError: (error) =>
					setNotice({
						tone: "error",
						text:
							errorCode(error) === "TRANSITION_REFUSED" ? tCommon("refused") : tCommon("failed"),
					}),
			},
		);

	if (calendarsQuery.isPending) {
		return <SkeletonText lines={5} label={tCommon("patient")} />;
	}
	if (calendarsQuery.isError) {
		return (
			<Notice tone="error">
				{tCommon("loadFailed")}{" "}
				<Button intent="quiet" onPress={() => void calendarsQuery.refetch()}>
					{tCommon("retry")}
				</Button>
			</Notice>
		);
	}
	if (!main) {
		return (
			<EmptyState
				title={tCommon("noCalendar.title")}
				description={isOwner ? tCommon("noCalendar.bodyOwner") : tCommon("noCalendar.bodyStaff")}
				action={
					isOwner ? (
						<Link href={PRO_ROUTES.agendaSettings} className={buttonStyles({ intent: "ink" })}>
							{tCommon("noCalendar.action")}
						</Link>
					) : undefined
				}
			/>
		);
	}

	const where = (entry: AgendaEntry) => {
		const calendar = byId.get(entry.calendarId);
		return calendars.length > 1 && calendar ? placeName(calendar, "") : null;
	};

	return (
		<div className="flex flex-col gap-12">
			<p className="text-lead text-ink">{format.localDay(today)}</p>
			{notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

			<section aria-labelledby="today-next" className="flex flex-col gap-4">
				<h2 id="today-next" className={sectionHeading}>
					{t("next.heading")}
				</h2>
				{dayQuery.isPending ? (
					<SkeletonText lines={2} label={t("next.heading")} />
				) : next ? (
					<div className="flex flex-col gap-1 border-y-2 border-ink py-4">
						<p className="font-display text-headline font-black tabular text-ink font-stretch-expanded">
							{format.time(next.startsAt)}
						</p>
						<p className="text-lead text-ink">
							{patientName(next)}
							{next.typeName ? ` · ${next.typeName}` : ""}
						</p>
						<p className="flex flex-wrap items-center gap-3 text-meta text-ink-muted">
							{next.status === "pending" ? <Badge>{tCommon("status.pending")}</Badge> : null}
							{next.patient?.isNew ? <Badge>{tCommon("newPatient")}</Badge> : null}
							{next.patient?.phone ? (
								<a href={`tel:${next.patient.phone}`} className="tabular text-ink underline">
									{next.patient.phone}
								</a>
							) : (
								<span>{tCommon("noPhone")}</span>
							)}
							{where(next) ? <span>{where(next)}</span> : null}
						</p>
						{next.unreachable ? <Notice tone="error">{tCommon("unreachable")}</Notice> : null}
					</div>
				) : (
					<p className="text-body text-ink">{t("next.none")}</p>
				)}
			</section>

			<section aria-labelledby="today-day" className="flex flex-col gap-4">
				<div className="flex flex-wrap items-baseline justify-between gap-3">
					<h2 id="today-day" className={sectionHeading}>
						{t("day.heading")}
					</h2>
					<div className="flex flex-wrap gap-3">
						<Button intent="ink" onPress={() => setBlocking(true)}>
							{t("actions.block")}
						</Button>
						<Link href={PRO_ROUTES.agenda} className={buttonStyles({ intent: "ink" })}>
							{t("actions.week")}
						</Link>
					</div>
				</div>
				{dayQuery.isPending ? (
					<SkeletonText lines={4} label={t("day.heading")} />
				) : dayQuery.isError ? (
					<Notice tone="error">{tCommon("loadFailed")}</Notice>
				) : day.length === 0 ? (
					<p className="text-body text-ink">{t("day.empty")}</p>
				) : (
					<div className="overflow-x-auto">
						<table className={table.table()}>
							<thead className={table.head()}>
								<tr>
									<th scope="col" className={table.column()}>
										{t("day.columns.time")}
									</th>
									<th scope="col" className={table.column()}>
										{t("day.columns.entry")}
									</th>
									<th scope="col" className={table.column()}>
										{t("day.columns.status")}
									</th>
									<th scope="col" className={table.column()}>
										{t("day.columns.actions")}
									</th>
								</tr>
							</thead>
							<tbody>
								{day.map((entry) => {
									const isBlock = entry.kind === "block";
									const active = entry.status === "confirmed" || entry.status === "pending";
									const started = entry.startsAt.getTime() <= nowMs;
									return (
										<tr key={entry.id} className={table.row()}>
											<td className={`${table.cell()} whitespace-nowrap tabular`}>
												{tCommon("timeRange", {
													start: format.time(entry.startsAt),
													end: format.time(entry.endsAt),
												})}
											</td>
											<td className={table.cell()}>
												{isBlock ? (
													<span className="font-semibold">{tCommon("block")}</span>
												) : (
													<span className="flex flex-col">
														<span className="font-semibold">{patientName(entry)}</span>
														<span className="text-meta text-ink-muted">
															{[entry.typeName, where(entry)].filter(Boolean).join(" · ")}
														</span>
													</span>
												)}
											</td>
											<td className={table.cell()}>
												{isBlock ? "" : tCommon(`status.${entry.status}`)}
											</td>
											<td className={table.cell()}>
												<span className="flex flex-wrap gap-x-1">
													{active ? (
														<Button intent="quiet" onPress={() => setOpened(entry)}>
															{isBlock ? tCommon("block") : t("actions.cancel")}
														</Button>
													) : null}
													{!isBlock && entry.status === "confirmed" && started ? (
														<Button
															intent="quiet"
															isPending={
																noShow.isPending && noShow.variables?.appointmentId === entry.id
															}
															onPress={() =>
																noShow.mutate(
																	{ organizationId, appointmentId: entry.id },
																	{
																		onSuccess: () => {
																			setNotice({ tone: "success", text: t("actions.noShowDone") });
																			void refresh();
																		},
																		onError: () =>
																			setNotice({ tone: "error", text: tCommon("failed") }),
																	},
																)
															}
														>
															{t("actions.noShow")}
														</Button>
													) : null}
												</span>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</section>

			<section aria-labelledby="today-requests" className="flex flex-col gap-4">
				<h2 id="today-requests" className={sectionHeading}>
					{t("requests.heading")}
				</h2>
				<p className="max-w-[65ch] text-meta text-ink-muted">{t("requests.lead")}</p>
				{requestsQuery.isPending ? (
					<SkeletonText lines={2} label={t("requests.heading")} />
				) : requests.length === 0 ? (
					<p className="text-body text-ink">{t("requests.empty")}</p>
				) : (
					<ul className="flex flex-col border-t-2 border-ink">
						{requests.map((entry) => (
							<li
								key={entry.id}
								className="flex flex-wrap items-center justify-between gap-4 border-b border-rule-soft py-3"
							>
								<span className="flex flex-col">
									<span className="font-semibold text-ink">
										{format.dateTime(entry.startsAt)} · {patientName(entry)}
									</span>
									<span className="text-meta text-ink-muted">
										{[entry.typeName, where(entry)].filter(Boolean).join(" · ")}
										{entry.expiresAt
											? ` · ${t("requests.deadline", { date: format.dateTime(entry.expiresAt) })}`
											: ""}
									</span>
								</span>
								<span className="flex flex-wrap gap-3">
									<Button
										isPending={
											decide.isPending &&
											decide.variables?.appointmentId === entry.id &&
											decide.variables.decision === "approve"
										}
										onPress={() => answer(entry, "approve")}
									>
										{t("requests.approve")}
									</Button>
									<Button
										intent="ink"
										isPending={
											decide.isPending &&
											decide.variables?.appointmentId === entry.id &&
											decide.variables.decision === "decline"
										}
										onPress={() => answer(entry, "decline")}
									>
										{t("requests.decline")}
									</Button>
								</span>
							</li>
						))}
					</ul>
				)}
			</section>

			<AccessNote isOwner={isOwner} />

			{opened ? (
				<EntryDialog
					key={opened.id}
					organizationId={organizationId}
					entry={opened}
					timeZone={byId.get(opened.calendarId)?.timeZone ?? timeZone}
					nowMs={nowMs}
					isOpen
					onOpenChange={(open) => {
						if (!open) setOpened(null);
					}}
				/>
			) : null}
			{blocking ? (
				<AddEntryDialog
					organizationId={organizationId}
					calendar={main}
					initial={{
						date: today,
						minute: Math.min(23 * 60, Math.ceil(localMinutes(nowMs, timeZone) / 30) * 30),
					}}
					defaultKind="block"
					isOpen
					onOpenChange={(open) => {
						if (!open) setBlocking(false);
					}}
				/>
			) : null}
		</div>
	);
}
