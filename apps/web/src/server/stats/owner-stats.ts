import "server-only";
import type { Database } from "@apercura/db";
import { sql } from "drizzle-orm";
import { type Completion, completionOf } from "~/lib/completion";
import { at } from "../booking/sql-time";
import type { EditorData } from "../profile/service";

/*
 * What an owner sees about their page: views per day (the aggregated counters of
 * ./page-views.ts), views and online bookings per week, and the completion checklist. Counts
 * only: no visitor, no patient, nothing that could name anyone.
 *
 * Views are stored per page, whoever owns it; an owner only reads those counted since their own
 * claim was verified, never a former owner's (a page may change hands after a contest). Online
 * bookings are their own practice's appointments already.
 */

export const STATS_DAYS = 30;
export const STATS_WEEKS = 12;

export interface DailyViews {
	/** `YYYY-MM-DD`, a Europe/Paris calendar day. */
	day: string;
	views: number;
}

export interface WeeklyStats {
	/** Monday of the week, `YYYY-MM-DD`. */
	weekStart: string;
	views: number;
	/** Appointments patients booked online that week (whatever became of them since). */
	bookings: number;
}

export interface OwnerPageStats {
	/** `YYYY-MM-DD`, the Europe/Paris day the current claim was verified (null: no verified claim). */
	countedSince: string | null;
	daily: DailyViews[];
	weekly: WeeklyStats[];
	totals: { viewsLast30Days: number; bookingsLast12Weeks: number };
	completion: Completion;
}

/**
 * The day the page's current owner was verified: views before it belong to a former owner (or to
 * nobody) and are not shown. Null when the page has no verified claim: nothing is shown.
 */
export async function countedSince(
	db: Pick<Database, "execute">,
	practitionerId: number,
): Promise<string | null> {
	const [row] = await db.execute<{ day: string }>(sql`
		SELECT to_char((verified_at AT TIME ZONE 'Europe/Paris')::date, 'YYYY-MM-DD') AS day
		FROM directory.claims
		WHERE practitioner_id = ${practitionerId} AND status = 'verified' AND verified_at IS NOT NULL
		ORDER BY verified_at DESC
		LIMIT 1
	`);
	return row?.day ?? null;
}

/**
 * Views per day for the last `days` days, today included, with the days without views. Days
 * before `since` (the current owner's verification) read as zero.
 */
export async function dailyViews(
	db: Pick<Database, "execute">,
	practitionerId: number,
	nowMs: number,
	since: string | null,
	days = STATS_DAYS,
): Promise<DailyViews[]> {
	const rows = await db.execute<{ day: string; views: number }>(sql`
		WITH today AS (SELECT (${at(nowMs)} AT TIME ZONE 'Europe/Paris')::date AS day),
		days AS (
			SELECT (today.day - offs)::date AS day
			FROM today, generate_series(0, ${days - 1}::integer) AS offs
		)
		SELECT to_char(d.day, 'YYYY-MM-DD') AS day, coalesce(v.views, 0)::integer AS views
		FROM days d
		LEFT JOIN directory.page_view_days v ON v.practitioner_id = ${practitionerId} AND v.day = d.day
			AND v.day >= coalesce(${since}::date, 'infinity'::date)
		ORDER BY d.day
	`);
	return rows.map((row) => ({ day: row.day, views: Number(row.views) }));
}

/** Views and online bookings per week (Monday to Sunday) for the last `weeks` weeks. */
export async function weeklyStats(
	db: Pick<Database, "execute">,
	input: {
		practitionerId: number;
		organizationId: string;
		nowMs: number;
		/** The current owner's verification day: earlier views are not theirs. */
		since: string | null;
		weeks?: number;
	},
): Promise<WeeklyStats[]> {
	const weeks = input.weeks ?? STATS_WEEKS;
	const rows = await db.execute<{ week_start: string; views: number; bookings: number }>(sql`
		WITH this_week AS (
			SELECT date_trunc('week', (${at(input.nowMs)} AT TIME ZONE 'Europe/Paris'))::date AS day
		),
		weeks AS (
			SELECT (this_week.day - offs * 7)::date AS day
			FROM this_week, generate_series(0, ${weeks - 1}::integer) AS offs
		)
		SELECT to_char(w.day, 'YYYY-MM-DD') AS week_start,
			coalesce((
				SELECT sum(v.views) FROM directory.page_view_days v
				WHERE v.practitioner_id = ${input.practitionerId}
					AND v.day >= w.day AND v.day < w.day + 7
					AND v.day >= coalesce(${input.since}::date, 'infinity'::date)
			), 0)::integer AS views,
			(
				SELECT count(*) FROM care.appointments a
				JOIN care.calendars c ON c.id = a.calendar_id
				WHERE c.practitioner_id = ${input.practitionerId}
					AND c.organization_id = ${input.organizationId}
					AND a.kind = 'appointment' AND a.source = 'online' AND a.booked_at IS NOT NULL
					AND (a.booked_at AT TIME ZONE 'Europe/Paris')::date >= w.day
					AND (a.booked_at AT TIME ZONE 'Europe/Paris')::date < w.day + 7
			)::integer AS bookings
		FROM weeks w
		ORDER BY w.day
	`);
	return rows.map((row) => ({
		weekStart: row.week_start,
		views: Number(row.views),
		bookings: Number(row.bookings),
	}));
}

/** Whether the page's agendas (of this organization) have opening hours and are open online. */
export async function agendaState(
	db: Pick<Database, "execute">,
	practitionerId: number,
	organizationId: string,
) {
	const [row] = await db.execute<{ hours: boolean; open: boolean }>(sql`
		SELECT
			EXISTS (
				SELECT 1 FROM care.availability_rules r
				JOIN care.calendars c ON c.id = r.calendar_id
				WHERE c.practitioner_id = ${practitionerId} AND c.organization_id = ${organizationId}
			) AS hours,
			EXISTS (
				SELECT 1 FROM care.calendars c
				WHERE c.practitioner_id = ${practitionerId} AND c.organization_id = ${organizationId}
					AND c.status = 'open'
			) AS open
	`);
	return { hasHours: row?.hours === true, bookingOpen: row?.open === true };
}

/** The completion checklist of a page from its editor data and its agendas. */
export async function pageCompletion(
	db: Pick<Database, "execute">,
	data: EditorData,
	organizationId: string,
): Promise<Completion> {
	const agenda = await agendaState(db, data.practitioner.id, organizationId);
	return completionOf({
		publishedAt: data.publishedAt,
		photo: data.photo,
		bio: data.profile.bio,
		languages: data.profile.languages,
		fees: data.profile.fees,
		paymentMethods: data.profile.paymentMethods,
		accessibility: data.profile.accessibility,
		...agenda,
	});
}

export async function ownerPageStats(
	db: Database,
	input: { data: EditorData; organizationId: string; nowMs: number },
): Promise<OwnerPageStats> {
	const practitionerId = input.data.practitioner.id;
	const since = await countedSince(db, practitionerId);
	const [daily, weekly, completion] = await Promise.all([
		dailyViews(db, practitionerId, input.nowMs, since),
		weeklyStats(db, {
			practitionerId,
			organizationId: input.organizationId,
			nowMs: input.nowMs,
			since,
		}),
		pageCompletion(db, input.data, input.organizationId),
	]);
	return {
		countedSince: since,
		daily,
		weekly,
		totals: {
			viewsLast30Days: daily.reduce((sum, row) => sum + row.views, 0),
			bookingsLast12Weeks: weekly.reduce((sum, row) => sum + row.bookings, 0),
		},
		completion,
	};
}
