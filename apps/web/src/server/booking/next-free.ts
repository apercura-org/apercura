import { computeSlots, MAX_SLOT_DAYS } from "@apercura/core/booking";
import { instantToLocalDate } from "@apercura/core/time";
import type { Database } from "@apercura/db";
import { appointmentTypes, calendars } from "@apercura/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { cacheTags } from "~/server/cache-tags";
import type { Executor } from "~/server/db-executor";
import { slotQuery } from "./availability";
import type { BookingRuntime } from "./runtime";
import { at } from "./sql-time";

/** How far ahead the "next free slot" of result cards looks (two engine calls). */
export const NEXT_FREE_LOOKAHEAD_DAYS = 2 * MAX_SLOT_DAYS;

/** The earliest bookable start of a practitioner over all their open calendars, or null. */
export async function computeNextFree(
	db: Executor,
	practitionerId: number,
	nowMs: number,
): Promise<Date | null> {
	const open = await db
		.select()
		.from(calendars)
		.where(and(eq(calendars.practitionerId, practitionerId), eq(calendars.status, "open")));
	let best: number | null = null;
	for (const calendar of open) {
		const types = await db
			.select()
			.from(appointmentTypes)
			.where(and(eq(appointmentTypes.calendarId, calendar.id), eq(appointmentTypes.active, true)))
			.orderBy(asc(appointmentTypes.position));
		const today = instantToLocalDate(nowMs, calendar.timeZone);
		for (let offset = 0; offset < NEXT_FREE_LOOKAHEAD_DAYS; offset += MAX_SLOT_DAYS) {
			const fromDate = today.add({ days: offset }).toString();
			let found: number | null = null;
			for (const type of types) {
				const query = await slotQuery(db, calendar, type, { fromDate, days: MAX_SLOT_DAYS }, nowMs);
				const [first] = computeSlots({ ...query, fromDate, days: MAX_SLOT_DAYS });
				if (first !== undefined && (found === null || first < found)) {
					found = first;
				}
			}
			if (found !== null) {
				best = best === null ? found : Math.min(best, found);
				break;
			}
		}
	}
	return best === null ? null : new Date(best);
}

/**
 * Recomputes `directory.practitioners.next_free_at` through the narrow SQL function
 * `directory.set_next_free_at` (the only write the booking module makes to the directory).
 * Returns whether the value changed.
 */
export async function refreshNextFree(
	db: Database,
	practitionerId: number,
	nowMs: number,
): Promise<boolean> {
	const next = await computeNextFree(db, practitionerId, nowMs);
	const rows = await db.execute<{ changed: boolean }>(
		sql`select directory.set_next_free_at(${practitionerId}::integer, ${at(next)}) as changed`,
	);
	return rows[0]?.changed === true;
}

/**
 * Recomputes the next free slot and, when it changed (or `force`, e.g. the agenda opened or
 * paused), marks the practitioner's cached page stale so its action block tells the truth.
 */
export async function refreshNextFreeFor(
	rt: BookingRuntime,
	practitionerId: number,
	options: { force?: boolean } = {},
): Promise<boolean> {
	const changed = await refreshNextFree(rt.db, practitionerId, rt.nowMs());
	if (changed || options.force) {
		rt.revalidate?.([cacheTags.practitioner(practitionerId)]);
	}
	return changed;
}

export function refreshNextFreeLater(rt: BookingRuntime, practitionerId: number) {
	rt.defer(() => refreshNextFreeFor(rt, practitionerId));
}
