-- The cache warm-up's cursor (issue #91): `jobs:tick warm` walks every URL of the sitemaps
-- against the app, a budget at a time, and records here where it stopped, so the next run
-- continues there. One row (id = 1), seeded below.
--
-- - generation: the build id and the last successful import the walk is for; the job starts
--   over when either changes (a deploy, an import).
-- - restart_requested_at: set by the import once it has drained the invalidation outbox
--   (packages/etl/src/outbox.ts), so the pages it expired are rendered again soon.
--
-- Safe on a live database: a new table, nothing else is locked; the lock wait is bounded as in
-- 0018 anyway.
--
-- Grants: apercura_app (the jobs run with DATABASE_URL) and apercura_readonly get theirs from
-- the schema's default privileges (0004); apercura_app's are stated again for databases whose
-- migrations ran under another role. apercura_etl may only request a restart: it reads and
-- writes restart_requested_at, nothing else of the row.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "directory"."cache_warmup" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"generation" text DEFAULT '' NOT NULL,
	"unit" text,
	"position" integer DEFAULT 0 NOT NULL,
	"warmed" bigint DEFAULT 0 NOT NULL,
	"errors" bigint DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"restart_requested_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cache_warmup_single_row_check" CHECK ("directory"."cache_warmup"."id" = 1)
);
--> statement-breakpoint
INSERT INTO "directory"."cache_warmup" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
GRANT SELECT, UPDATE ON "directory"."cache_warmup" TO apercura_app;
--> statement-breakpoint
GRANT SELECT ("id", "restart_requested_at"), UPDATE ("restart_requested_at") ON "directory"."cache_warmup" TO apercura_etl;
--> statement-breakpoint
RESET lock_timeout;
