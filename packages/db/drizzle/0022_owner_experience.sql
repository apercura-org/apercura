-- Owner experience (issue #92): the "I am this practitioner" contact requests, the batched admin
-- alerts and the daily page-view counters of claimed pages.
--
-- 1. directory.practitioner_contact_requests: what the requester typed (name, professional
--    email, phone, message) is one encrypted JSON (platform key, AAD
--    `practitioner_contact_requests.content_enc.<id>`); `jobs:tick requests` deletes a request
--    CONTACT_REQUEST_RETENTION_MONTHS (12 by default) after its last change.
-- 2. directory.admin_alerts: when each admin queue was last alerted, so a burst of claims or
--    contact requests sends one email per ADMIN_ALERT_INTERVAL_MINUTES.
-- 3. directory.page_view_days: one counter per claimed page and day, nothing about visitors;
--    `jobs:tick page-views` deletes the days older than PAGE_VIEW_RETENTION_MONTHS (13).
--
-- Safe on a live database: three new, empty tables. The only lock taken on an existing table is
-- the SHARE ROW EXCLUSIVE lock the two foreign keys take on directory.practitioners (it lets
-- reads through, and the import's writes wait for a moment); each statement waits at most 5
-- seconds for it, then the migration fails and can be run again, instead of queueing every
-- page refresh behind it. Forward-only: nothing existing is altered.
--
-- Grants: the app reads and writes the three tables; the import has no access at all (like the
-- claims and reports); the read-only role reads them (ciphertext for the contact requests).
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "directory"."admin_alerts" (
	"kind" text PRIMARY KEY NOT NULL,
	"last_sent_at" timestamp with time zone NOT NULL,
	"last_item_at" timestamp with time zone,
	CONSTRAINT "admin_alerts_kind_check" CHECK ("directory"."admin_alerts"."kind" in ('claims', 'contact_requests'))
);
--> statement-breakpoint
CREATE TABLE "directory"."practitioner_contact_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"practitioner_id" integer NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"content_enc" text NOT NULL,
	"locale" text DEFAULT 'fr' NOT NULL,
	"handled_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practitioner_contact_requests_status_check" CHECK ("directory"."practitioner_contact_requests"."status" in ('new', 'contacted', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "directory"."page_view_days" (
	"practitioner_id" integer NOT NULL,
	"day" date NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "page_view_days_practitioner_id_day_pk" PRIMARY KEY("practitioner_id","day"),
	CONSTRAINT "page_view_days_views_check" CHECK ("directory"."page_view_days"."views" >= 0)
);
--> statement-breakpoint
ALTER TABLE "directory"."practitioner_contact_requests" ADD CONSTRAINT "practitioner_contact_requests_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "directory"."practitioners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory"."page_view_days" ADD CONSTRAINT "page_view_days_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "directory"."practitioners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "practitioner_contact_requests_queue_idx" ON "directory"."practitioner_contact_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "practitioner_contact_requests_practitioner_idx" ON "directory"."practitioner_contact_requests" USING btree ("practitioner_id");--> statement-breakpoint
CREATE INDEX "practitioner_contact_requests_updated_idx" ON "directory"."practitioner_contact_requests" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "page_view_days_day_idx" ON "directory"."page_view_days" USING btree ("day");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON
	directory.practitioner_contact_requests,
	directory.admin_alerts,
	directory.page_view_days
TO apercura_app;
--> statement-breakpoint
REVOKE ALL ON
	directory.practitioner_contact_requests,
	directory.admin_alerts,
	directory.page_view_days
FROM apercura_etl;
--> statement-breakpoint
GRANT SELECT ON
	directory.practitioner_contact_requests,
	directory.admin_alerts,
	directory.page_view_days
TO apercura_readonly;
--> statement-breakpoint
RESET lock_timeout;
