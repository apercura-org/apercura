"use client";

import { Button, EmptyState, Notice, SkeletonText, type SlotDay, SlotPicker } from "@apercura/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import {
	addLocalDays,
	localDayLabel,
	localToday,
	slotParts,
	slotTime,
	timeZoneName,
} from "~/lib/slot-format";
import type { SlotPage } from "./booking-types";

/** The engine answers at most 14 local days per call. */
export const WINDOW_DAYS = 14;

export interface SlotWindowProps {
	/** Cache key of the agenda (calendar and type, or the manage token's appointment). */
	queryKey: readonly unknown[];
	/** Loads one window: `booking.slots` (GET) or `booking.manage.slots` (POST). */
	load: (fromDate: string, days: number) => Promise<SlotPage>;
	/** The site's time zone: every day and time is printed in it, never in the visitor's. */
	timeZone: string;
	/** Selected start (epoch ms). */
	value: number | null;
	onChange: (startMs: number) => void;
	/** Shown when a window has no free time, e.g. "or call 01 00 00 00 00". */
	emptyHint?: string;
	/**
	 * The appointment being moved: its cell cannot be stamped and says so, in print (`short`, under
	 * the time) and in speech (`spoken`).
	 */
	current?: { startMs: number; short: string; spoken: string } | null;
}

/**
 * Free times over 14-day windows (previous / next), set in the SlotPicker: one row per local day
 * of the site, the repeated October hour labelled with its UTC offset.
 */
export function SlotWindow({
	queryKey,
	load,
	timeZone,
	value,
	onChange,
	emptyHint,
	current = null,
}: SlotWindowProps) {
	const t = useTranslations("booking.panel.slot");
	const tSlots = useTranslations("Practitioner.slots");
	const tPanel = useTranslations("booking.panel");
	const locale = useLocale();
	const today = useMemo(() => localToday(timeZone), [timeZone]);
	const [from, setFrom] = useState(today);
	const until = addLocalDays(from, WINDOW_DAYS - 1);

	const query = useQuery({
		queryKey: [...queryKey, "slots", from],
		queryFn: () => load(from, WINDOW_DAYS),
		placeholderData: keepPreviousData,
		staleTime: 20_000,
	});

	const { days, repeatedDay } = useMemo(() => {
		const byDay = new Map<string, SlotDay["slots"]>();
		let repeated: string | null = null;
		const nowMs = Date.now();
		const add = (start: Date, free: boolean) => {
			const ms = new Date(start).getTime();
			const parts = slotParts(ms, timeZone, locale);
			if (parts.offset) {
				repeated ??= parts.day;
			}
			const iso = new Date(ms).toISOString();
			const isCurrent = current !== null && ms === current.startMs;
			const list = byDay.get(parts.day) ?? [];
			list.push({
				id: iso,
				start: iso,
				// A grid time already gone prints as past (muted); one still ahead but not free is
				// struck through as unavailable.
				available: isCurrent ? false : free || ms <= nowMs,
				time: parts.time,
				...(isCurrent
					? { detail: current.short, unavailableNote: current.spoken }
					: parts.offset
						? { detail: parts.offset }
						: {}),
				// The printed time (and its mark) is part of the spoken label (WCAG 2.5.3).
				accessibleLabel: tSlots("slotLabel", {
					day: parts.dateNoYear,
					time: isCurrent ? `${slotTime(parts)} ${current.short}` : slotTime(parts),
				}),
			});
			byDay.set(parts.day, list);
		};
		for (const start of query.data?.slots ?? []) {
			add(start, true);
		}
		for (const start of query.data?.taken ?? []) {
			add(start, false);
		}
		const rows: SlotDay[] = [];
		for (let index = 0; index < WINDOW_DAYS; index += 1) {
			const day = addLocalDays(from, index);
			const slots = (byDay.get(day) ?? []).sort(
				(a, b) => Date.parse(a.start) - Date.parse(b.start),
			);
			rows.push({ date: day, label: localDayLabel(day, locale), slots });
		}
		return { days: rows, repeatedDay: repeated };
	}, [query.data, timeZone, locale, from, tSlots, current]);

	const count = query.data?.slots.length ?? 0;
	const range = t("range", {
		from: localDayLabel(from, locale, "long"),
		to: localDayLabel(until, locale, "long"),
	});
	const selected = value === null ? null : new Date(value).toISOString();

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className="font-display text-body font-semibold text-ink font-stretch-semi-condensed">
					{range}
				</p>
				<div className="flex flex-wrap gap-2">
					<Button
						intent="ink"
						isDisabled={from <= today}
						onPress={() => setFrom(addLocalDays(from, -WINDOW_DAYS))}
					>
						{t("previous")}
					</Button>
					<Button intent="ink" onPress={() => setFrom(addLocalDays(from, WINDOW_DAYS))}>
						{t("next")}
					</Button>
				</div>
			</div>
			<p className="text-meta text-ink-muted">
				{t("timeZone", { zone: timeZoneName(timeZone, locale) })}
			</p>
			{repeatedDay ? (
				<Notice tone="info" role="none">
					{t("repeatedHour", { day: localDayLabel(repeatedDay, locale, "long") })}
				</Notice>
			) : null}
			{query.isError ? (
				<Notice tone="error" title={tPanel("loadError")}>
					<Button intent="quiet" onPress={() => void query.refetch()}>
						{tPanel("retry")}
					</Button>
				</Notice>
			) : query.data === undefined ? (
				<SkeletonText lines={6} label={t("loading")} />
			) : count === 0 ? (
				<EmptyState
					title={t("emptyTitle", {
						from: localDayLabel(from, locale, "long"),
						to: localDayLabel(until, locale, "long"),
					})}
					description={emptyHint ? `${t("emptyBody")} ${emptyHint}` : t("emptyBody")}
					action={
						<Button intent="ink" onPress={() => setFrom(addLocalDays(from, WINDOW_DAYS))}>
							{t("next")}
						</Button>
					}
				/>
			) : (
				<div aria-busy={query.isFetching || undefined}>
					<SlotPicker
						days={days}
						label={tSlots("label")}
						value={selected}
						onChange={(slot) => onChange(Date.parse(slot.start))}
						nowLabel={tSlots("now")}
						unavailableLabel={tSlots("unavailable")}
						pastLabel={tSlots("past")}
						emptyDayLabel={tSlots("emptyDay")}
						announceSelection={(slot) => tSlots("selected", { slot: slot.accessibleLabel })}
					/>
				</div>
			)}
		</div>
	);
}
