-- Custom migration: what Drizzle cannot express for the booking tables.
--
-- 1. appointments_no_overlap: one person, one active entry at a time, across all
--    their calendars and sites, buffers included. Half-open ranges, so two
--    appointments back to back are allowed. The WHERE clause cannot use now():
--    stale holds and requests are expired by the writer in the same
--    transaction, before it inserts (see apps/web/src/server/booking).
--    The web app and the jobs CLI refuse to start booking without it
--    (assertBookingConstraints); never use `drizzle-kit push` in production.
-- 2. directory.set_next_free_at(): the one narrow way the booking module writes
--    the denormalized "next free slot" of a practitioner.
ALTER TABLE care.appointments ADD CONSTRAINT appointments_no_overlap
	EXCLUDE USING gist (
		practitioner_id WITH =,
		tstzrange(occupied_from, occupied_until, '[)') WITH &&
	)
	WHERE (status IN ('held', 'pending', 'confirmed'));
--> statement-breakpoint

-- Writes practitioners.next_free_at only when it changes; true when it did.
CREATE OR REPLACE FUNCTION directory.set_next_free_at(p_practitioner_id integer, p_next timestamptz)
RETURNS boolean
LANGUAGE sql
AS $$
	WITH changed AS (
		UPDATE directory.practitioners
		SET next_free_at = p_next
		WHERE id = p_practitioner_id AND next_free_at IS DISTINCT FROM p_next
		RETURNING 1
	)
	SELECT EXISTS (SELECT 1 FROM changed)
$$;
