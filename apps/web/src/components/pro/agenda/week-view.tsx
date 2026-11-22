"use client";

import {
	Button,
	buttonStyles,
	ChevronLeftIcon,
	ChevronRightIcon,
	EmptyState,
	Notice,
	SkeletonText,
	WeekGrid,
	type WeekGridDay,
	type WeekGridEntry,
	type WeekGridTone,
} from "@apercura/ui";
import type { CalendarDate } from "@internationalized/date";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Link } from "~/i18n/navigation";
import {
	dayBounds,
	hhmm,
	instantToLocalDate,
	isoWeekday,
	localMinutes,
	minutesOf,
	weekStart,
} from "~/lib/agenda-time";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { useTRPC } from "~/trpc/client";
import {
	AccessNote,
	AddEntryDialog,
	type AgendaCalendar,
	type AgendaEntry,
	CalendarSelect,
	EntryDialog,
	SHOWN_IN_GRID,
	useAgendaFormat,
	usePatientName,
} from "./agenda-shared";

const TONE: Record<string, WeekGridTone> = {
	held: "held",
	pending: "pending",
	confirmed: "booked",
	completed: "done",
	no_show: "absent",
};

function useNow() {
	const [now, setNow] = useState<number | null>(null);
	useEffect(() => {
		setNow(Date.now());
		const timer = window.setInterval(() => setNow(Date.now()), 60_000);
		return () => window.clearInterval(timer);
	}, []);
	return now;
}

/** Narrow screens open on the day view (a week of columns does not fit a phone). */
function useInitialView() {
	const [view, setView] = useState<"week" | "day">("week");
	useEffect(() => {
		if (window.matchMedia("(max-width: 767px)").matches) setView("day");
	}, []);
	return [view, setView] as const;
}

function openWindows(calendar: AgendaCalendar, date: CalendarDate) {
	const weekday = isoWeekday(date);
	const iso = date.toString();
	return calendar.rules
		.filter(
			(rule) =>
				rule.weekday === weekday &&
				(!rule.validFrom || rule.validFrom <= iso) &&
				(!rule.validUntil || rule.validUntil >= iso),
		)
		.map((rule) => [minutesOf(rule.startTime) ?? 0, minutesOf(rule.endTime) ?? 0] as const);
}

/**
 * The agenda's week (or day, on a phone): one calendar at a time, entries over the opening
 * hours, a free cell to add an appointment or a block, an entry to see and change it.
 */
export function WeekView({
	organizationId,
	isOwner,
}: {
	organizationId: string;
	isOwner: boolean;
}) {
	const t = useTranslations("Agenda.week");
	const tCommon = useTranslations("Agenda.common");
	const trpc = useTRPC();
	const nowMs = useNow();
	const [view, setView] = useInitialView();
	const calendarsQuery = useQuery(trpc.agenda.calendars.queryOptions({ organizationId }));
	const calendars = calendarsQuery.data ?? [];
	const [calendarId, setCalendarId] = useState<string | null>(null);
	const calendar = calendars.find((item) => item.id === calendarId) ?? calendars[0] ?? null;
	const timeZone = calendar?.timeZone ?? "Europe/Paris";
	const [anchor, setAnchor] = useState<CalendarDate | null>(null);
	const today = nowMs === null ? null : instantToLocalDate(nowMs, timeZone);
	const focusDate = anchor ?? today;

	const dates = useMemo(() => {
		if (!focusDate) return [];
		if (view === "day") return [focusDate];
		const monday = weekStart(focusDate);
		return Array.from({ length: 7 }, (_, index) => monday.add({ days: index }));
	}, [focusDate, view]);
	const first = dates[0];
	const last = dates.at(-1);
	const range =
		first && last && calendar
			? { from: dayBounds(first, timeZone)[0], to: dayBounds(last, timeZone)[1] }
			: null;

	const listQuery = useQuery({
		...trpc.agenda.list.queryOptions({
			organizationId,
			calendarId: calendar?.id,
			from: new Date(range?.from ?? 0),
			to: new Date(range?.to ?? 1),
		}),
		enabled: range !== null && calendar !== null,
	});

	// One row per quarter hour when appointments are that short (one entry per row), else half hours.
	const step =
		calendar &&
		(calendar.stepMin < 30 || calendar.types.some((type) => type.active && type.durationMin < 30))
			? 15
			: 30;
	const format = useAgendaFormat(timeZone);
	const patientName = usePatientName();
	const [adding, setAdding] = useState<{ date: CalendarDate; minute: number } | null>(null);
	const [opened, setOpened] = useState<AgendaEntry | null>(null);

	const entries = useMemo(
		() =>
			(listQuery.data ?? []).filter(
				(entry) => SHOWN_IN_GRID.has(entry.status) || entry.kind === "block",
			),
		[listQuery.data],
	);

	const gridEntries = useMemo<WeekGridEntry[]>(() => {
		const out: WeekGridEntry[] = [];
		for (const entry of entries) {
			if (entry.kind === "block" && !(entry.status === "confirmed")) continue;
			dates.forEach((date, day) => {
				const [dayStart, dayEnd] = dayBounds(date, timeZone);
				const from = Math.max(entry.startsAt.getTime(), dayStart);
				const until = Math.min(entry.endsAt.getTime(), dayEnd);
				if (until <= from) return;
				const startMin = localMinutes(from, timeZone);
				const endMin = until >= dayEnd ? 24 * 60 : localMinutes(until, timeZone);
				const status = tCommon(`status.${entry.status}`);
				const isBlock = entry.kind === "block";
				const who = entry.status === "held" ? status : patientName(entry);
				const title = isBlock
					? `${format.time(entry.startsAt)} ${tCommon("block")}`
					: `${format.time(entry.startsAt)} ${entry.typeName ?? ""}`.trim();
				out.push({
					id: entry.id,
					day,
					startMin,
					endMin: Math.max(endMin, startMin + 5),
					tone: isBlock ? "block" : (TONE[entry.status] ?? "booked"),
					title,
					detail: isBlock ? undefined : entry.status === "pending" ? `${who} · ${status}` : who,
					accessibleLabel: t("entry", {
						day: format.day(entry.startsAt),
						start: format.time(entry.startsAt),
						end: format.time(entry.endsAt),
						status: isBlock ? tCommon("block") : status,
					}),
				});
			});
		}
		return out;
	}, [entries, dates, timeZone, format, patientName, t, tCommon]);

	const gridDays = useMemo<WeekGridDay[]>(
		() =>
			calendar
				? dates.map((date) => ({
						key: date.toString(),
						label: format.localDay(date, "short"),
						accessibleLabel: format.localDay(date),
						isToday: today ? date.compare(today) === 0 : false,
						open: openWindows(calendar, date),
					}))
				: [],
		[calendar, dates, format, today],
	);

	const bounds = useMemo(() => {
		let start = 8 * 60;
		let end = 19 * 60;
		for (const day of gridDays) {
			for (const [from, until] of day.open) {
				start = Math.min(start, from);
				end = Math.max(end, until);
			}
		}
		for (const entry of gridEntries) {
			start = Math.min(start, entry.startMin);
			end = Math.max(end, entry.endMin);
		}
		return { start: Math.floor(start / 60) * 60, end: Math.min(24 * 60, Math.ceil(end / 60) * 60) };
	}, [gridDays, gridEntries]);

	const nowCell =
		nowMs !== null && today
			? (() => {
					const day = dates.findIndex((date) => date.compare(today) === 0);
					return day >= 0 ? { day, minute: localMinutes(nowMs, timeZone) } : null;
				})()
			: null;

	const page = (direction: -1 | 1) => {
		if (!focusDate) return;
		setAnchor(focusDate.add({ days: direction * (view === "day" ? 1 : 7) }));
	};

	if (calendarsQuery.isPending) {
		return <SkeletonText lines={4} label={t("loading")} />;
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
	if (!calendar) {
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

	const label =
		view === "day" && first
			? t("dayGridLabel", { date: format.localDay(first) })
			: t("gridLabel", { date: first ? format.localDay(first) : "" });

	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div className="flex flex-wrap items-end gap-4">
					<CalendarSelect calendars={calendars} value={calendar.id} onChange={setCalendarId} />
					<fieldset className="flex flex-col gap-1">
						<legend className="font-display text-meta font-semibold text-ink font-stretch-semi-condensed">
							{t("viewLabel")}
						</legend>
						<div className="flex">
							{(["week", "day"] as const).map((option) => (
								<Button
									key={option}
									intent={view === option ? "ink" : "quiet"}
									aria-pressed={view === option}
									onPress={() => setView(option)}
									className={view === option ? "bg-ink text-paper hover:bg-ink" : undefined}
								>
									{option === "week" ? t("viewWeek") : t("viewDay")}
								</Button>
							))}
						</div>
					</fieldset>
				</div>
				<nav aria-label={label} className="flex flex-wrap items-center gap-2">
					<Button
						intent="ink"
						size="icon"
						aria-label={view === "day" ? t("previousDay") : t("previous")}
						onPress={() => page(-1)}
					>
						<ChevronLeftIcon className="size-5" />
					</Button>
					<Button intent="ink" onPress={() => setAnchor(null)}>
						{t("current")}
					</Button>
					<Button
						intent="ink"
						size="icon"
						aria-label={view === "day" ? t("nextDay") : t("next")}
						onPress={() => page(1)}
					>
						<ChevronRightIcon className="size-5" />
					</Button>
				</nav>
			</div>
			<div className="flex flex-wrap items-baseline justify-between gap-3">
				<h2 className="type-title text-ink">{label}</h2>
				<ul
					aria-label={t("legend.label")}
					className="flex flex-wrap gap-x-4 gap-y-1 text-meta text-ink"
				>
					<li className="flex items-center gap-2">
						<span aria-hidden="true" className="inline-block size-4 rounded-field bg-stamp" />
						{t("legend.booked")}
					</li>
					<li className="flex items-center gap-2">
						<span
							aria-hidden="true"
							className="inline-block size-4 rounded-field border-2 border-dashed border-ink"
						/>
						{t("legend.pending")}
					</li>
					<li className="flex items-center gap-2">
						<span
							aria-hidden="true"
							className="inline-block size-4 rounded-field border border-dashed border-field-edge bg-paper-shade"
						/>
						{t("legend.held")}
					</li>
					<li className="flex items-center gap-2">
						<span aria-hidden="true" className="inline-block size-4 rounded-field bg-ink" />
						{t("legend.block")}
					</li>
					<li className="flex items-center gap-2">
						<span
							aria-hidden="true"
							className="closed-hatch inline-block size-4 rounded-field border border-rule-soft"
						/>
						{t("legend.closed")}
					</li>
				</ul>
			</div>
			<p className="hidden text-meta text-ink-muted md:block">{t("keyboardHint")}</p>
			{listQuery.isError ? (
				<Notice tone="error">
					{tCommon("loadFailed")}{" "}
					<Button intent="quiet" onPress={() => void listQuery.refetch()}>
						{tCommon("retry")}
					</Button>
				</Notice>
			) : null}
			<div aria-busy={listQuery.isFetching || undefined}>
				<WeekGrid
					days={gridDays}
					entries={gridEntries}
					startMin={bounds.start}
					endMin={bounds.end}
					stepMin={step}
					label={label}
					timeColumnLabel={t("timeColumn")}
					formatTime={hhmm}
					freeLabel={(day, minute, open) =>
						t(open ? "free" : "freeClosed", { day: day.accessibleLabel, time: hhmm(minute) })
					}
					onCellAction={(day, minute) => {
						const date = dates[day];
						if (date) setAdding({ date, minute });
					}}
					onEntryAction={(id) => setOpened(entries.find((entry) => entry.id === id) ?? null)}
					onPageChange={page}
					now={nowCell}
					nowLabel={t("now")}
				/>
			</div>
			<AccessNote isOwner={isOwner} />
			{isOwner ? (
				<p>
					<Link href={PRO_ROUTES.agendaSettings} className={buttonStyles({ intent: "quiet" })}>
						{t("settings")}
					</Link>
				</p>
			) : null}
			{adding ? (
				<AddEntryDialog
					key={`${adding.date.toString()}-${adding.minute}`}
					organizationId={organizationId}
					calendar={calendar}
					initial={adding}
					isOpen
					onOpenChange={(open) => {
						if (!open) setAdding(null);
					}}
				/>
			) : null}
			{opened ? (
				<EntryDialog
					key={opened.id}
					organizationId={organizationId}
					entry={opened}
					timeZone={timeZone}
					nowMs={nowMs ?? Date.now()}
					isOpen
					onOpenChange={(open) => {
						if (!open) setOpened(null);
					}}
				/>
			) : null}
		</div>
	);
}
