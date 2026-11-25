import { sql } from "drizzle-orm";
import type { Transaction } from "~/server/db-executor";
import { at } from "./sql-time";

/**
 * The travel before a home visit (issue #75). An occupied range holds a visit's travel after it,
 * and the overlap constraint keeps ranges apart; the travel before a visit is only needed next
 * to an entry that does not travel (care at the practice, a block, a visit without travel time),
 * since two visits in a row share one travel time. A range constraint cannot say that, so the
 * booking writes check it here, in the practitioner's transaction (`practitionerTransaction`
 * serializes every write of one person's agenda), with the rule of `travelConflict` that the
 * slot engine uses too.
 */

/** Raised inside the transaction like the overlap constraint's 23P01, so callers answer alike. */
export class TravelConflictError extends Error {
	readonly code = "23P01";
	readonly constraint = "appointments_travel_gap";
	constructor() {
		super("The travel time of a home visit overlaps another entry");
		this.name = "TravelConflictError";
	}
}

/**
 * Throws {@link TravelConflictError} when the new range (`travelMin` > 0 for a home visit) and a
 * live entry of the practitioner leave no room for the travel before the visit. Lapsed holds and
 * requests do not count, as in the slot engine.
 */
export async function assertTravelFree(
	tx: Transaction,
	options: {
		practitionerId: number;
		fromMs: number;
		untilMs: number;
		travelMin: number;
		nowMs: number;
		excludeId?: string | undefined;
	},
): Promise<void> {
	const exclude = options.excludeId ? sql`and id <> ${options.excludeId}` : sql``;
	const range = sql`tstzrange(${at(options.fromMs)}, ${at(options.untilMs)}, '[)')`;
	const conflict =
		options.travelMin > 0
			? // The new visit travels: the travel before it must not overlap an entry that does not.
				sql`travel_min = 0 and tstzrange(occupied_from, occupied_until, '[)')
					&& tstzrange(${at(options.fromMs - options.travelMin * 60_000)}, ${at(options.fromMs)}, '[)')`
			: // The new entry does not travel: it must stay out of the travel before every visit.
				sql`travel_min > 0 and tstzrange(occupied_from - make_interval(mins => travel_min), occupied_from, '[)')
					&& ${range}`;
	const rows = await tx.execute<{ id: string }>(sql`
		select id from care.appointments
		where practitioner_id = ${options.practitionerId}
			and (status = 'confirmed' or (status in ('held', 'pending') and expires_at > ${at(options.nowMs)}))
			${exclude}
			and ${conflict}
		limit 1
	`);
	if (rows.length > 0) {
		throw new TravelConflictError();
	}
}
