import type { Sql } from "@apercura/db";

/** The overlap constraint every booking write relies on (migration `0009_care_constraints`). */
export const OVERLAP_CONSTRAINT = "appointments_no_overlap";

let verified: Promise<void> | undefined;

/**
 * Fails fast unless `care.appointments_no_overlap` exists as an exclusion constraint. Without it
 * two patients could book the same slot, so the server (instrumentation) and the jobs CLI check
 * it before doing anything with bookings. A schema pushed with `drizzle-kit push` lacks it.
 */
export async function assertBookingConstraints(sql: Sql): Promise<void> {
	const rows = await sql<{ contype: string }[]>`
		SELECT c.contype
		FROM pg_constraint c
		JOIN pg_class t ON t.oid = c.conrelid
		JOIN pg_namespace n ON n.oid = t.relnamespace
		WHERE n.nspname = 'care' AND t.relname = 'appointments' AND c.conname = ${OVERLAP_CONSTRAINT}
	`;
	if (rows[0]?.contype !== "x") {
		throw new Error(
			`Booking is unsafe: the exclusion constraint care.appointments.${OVERLAP_CONSTRAINT} is missing. Run \`bun run db:migrate\` (never \`drizzle-kit push\`).`,
		);
	}
}

/** {@link assertBookingConstraints}, checked once per process. */
export function ensureBookingConstraints(sql: Sql): Promise<void> {
	verified ??= assertBookingConstraints(sql).catch((error) => {
		verified = undefined;
		throw error;
	});
	return verified;
}
