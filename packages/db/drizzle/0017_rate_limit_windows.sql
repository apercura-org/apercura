-- Custom migration: no raw IP address in Better Auth's rate-limit counters, and windows that
-- `jobs:tick rate-limits` can purge.
--
-- 1. directory.auth_rate_limit: Better Auth wrote its keys as `{ip}|{path}`, with the raw client
--    address. The app now writes them through its own storage
--    (apps/web/src/server/auth/rate-limit-storage.ts) as `auth:{HMAC-SHA256 of the address}|{path}`.
--    The rows stored before are deleted rather than converted: the migration does not hold the
--    HMAC key, and they are short-lived counters (one hour at most), so the only effect is that
--    a client mid-window starts a fresh one after the upgrade.
-- 2. Both tables record the length of each row's window, so the purge deletes a row only once
--    its own window has elapsed. directory.rate_limits keeps its rows (keyed hashes already,
--    and the burnt ALTCHA and revalidation signatures must survive the upgrade): they get
--    86400 seconds, the longest window the app uses, then the default is dropped.
DELETE FROM "directory"."auth_rate_limit";
--> statement-breakpoint
ALTER TABLE "directory"."auth_rate_limit" ADD COLUMN "window_seconds" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE "directory"."rate_limits" ADD COLUMN "window_seconds" integer DEFAULT 86400 NOT NULL;
--> statement-breakpoint
ALTER TABLE "directory"."rate_limits" ALTER COLUMN "window_seconds" DROP DEFAULT;
