-- Custom migration: validates the two checks 0018 added NOT VALID on care.appointments
-- (`appointments_location_check`, `appointments_travel_check`). VALIDATE CONSTRAINT scans the
-- table under a SHARE UPDATE EXCLUSIVE lock, which lets bookings read and write meanwhile. When
-- 0018 and 0019 are applied in one run, they share one transaction, so the scan happens while
-- 0018's short exclusive lock is still held: a single pass over the appointments, without any
-- rewrite. The lock wait is bounded as in 0018.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "care"."appointments" VALIDATE CONSTRAINT "appointments_location_check";
--> statement-breakpoint
ALTER TABLE "care"."appointments" VALIDATE CONSTRAINT "appointments_travel_check";
--> statement-breakpoint
RESET lock_timeout;
