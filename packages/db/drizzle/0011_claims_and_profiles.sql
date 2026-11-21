CREATE TABLE "directory"."claim_checks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "directory"."claim_checks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"claim_id" text NOT NULL,
	"method" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"secret_hash" text,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"passed_at" timestamp with time zone,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claim_checks_method_check" CHECK ("directory"."claim_checks"."method" in ('psc', 'registry_email', 'document', 'phone_callback')),
	CONSTRAINT "claim_checks_status_check" CHECK ("directory"."claim_checks"."status" in ('pending', 'passed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "directory"."claim_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"claim_id" text NOT NULL,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"purge_after" timestamp with time zone,
	"purged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claim_documents_kind_check" CHECK ("directory"."claim_documents"."kind" in ('cps_card', 'ordre_attestation'))
);
--> statement-breakpoint
CREATE TABLE "directory"."claims" (
	"id" text PRIMARY KEY NOT NULL,
	"practitioner_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"contest" boolean DEFAULT false NOT NULL,
	"submitted_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"booking_opens_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"decision_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claims_status_check" CHECK ("directory"."claims"."status" in ('open', 'in_review', 'verified', 'rejected', 'withdrawn', 'superseded'))
);
--> statement-breakpoint
CREATE TABLE "directory"."platform_audit_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "directory"."platform_audit_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "directory"."removal_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"practitioner_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"contact_enc" text NOT NULL,
	"message_enc" text,
	"locale" text DEFAULT 'fr' NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"decision_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "removal_requests_status_check" CHECK ("directory"."removal_requests"."status" in ('pending', 'confirmed', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "directory"."reports" (
	"id" text PRIMARY KEY NOT NULL,
	"practitioner_id" integer,
	"kind" text NOT NULL,
	"content_enc" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_kind_check" CHECK ("directory"."reports"."kind" in ('wrong_info', 'retired', 'deceased', 'impersonation')),
	CONSTRAINT "reports_status_check" CHECK ("directory"."reports"."status" in ('open', 'resolved', 'dismissed'))
);
--> statement-breakpoint
ALTER TABLE "directory"."user" ADD COLUMN "frozen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "directory"."practitioner_profiles" ADD COLUMN "carte_vitale" boolean;--> statement-breakpoint
ALTER TABLE "directory"."practitioner_profiles" ADD COLUMN "hidden_fields" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "directory"."practitioner_profiles" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "directory"."practitioners" ADD COLUMN "withheld_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "directory"."claim_checks" ADD CONSTRAINT "claim_checks_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "directory"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory"."claim_documents" ADD CONSTRAINT "claim_documents_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "directory"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory"."claims" ADD CONSTRAINT "claims_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "directory"."practitioners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory"."claims" ADD CONSTRAINT "claims_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "directory"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory"."removal_requests" ADD CONSTRAINT "removal_requests_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "directory"."practitioners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory"."reports" ADD CONSTRAINT "reports_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "directory"."practitioners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "claim_checks_method_uq" ON "directory"."claim_checks" USING btree ("claim_id","method");--> statement-breakpoint
CREATE INDEX "claim_documents_claim_idx" ON "directory"."claim_documents" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "claim_documents_purge_idx" ON "directory"."claim_documents" USING btree ("purge_after") WHERE "directory"."claim_documents"."purged_at" is null and "directory"."claim_documents"."purge_after" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "claims_one_owner_uq" ON "directory"."claims" USING btree ("practitioner_id") WHERE "directory"."claims"."status" = 'verified';--> statement-breakpoint
CREATE UNIQUE INDEX "claims_one_live_per_user_uq" ON "directory"."claims" USING btree ("practitioner_id","user_id") WHERE "directory"."claims"."status" in ('open', 'in_review');--> statement-breakpoint
CREATE INDEX "claims_user_idx" ON "directory"."claims" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "claims_queue_idx" ON "directory"."claims" USING btree ("status","submitted_at") WHERE "directory"."claims"."status" = 'in_review';--> statement-breakpoint
CREATE INDEX "platform_audit_events_subject_idx" ON "directory"."platform_audit_events" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "platform_audit_events_created_idx" ON "directory"."platform_audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "removal_requests_queue_idx" ON "directory"."removal_requests" USING btree ("status","created_at") WHERE "directory"."removal_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "removal_requests_practitioner_idx" ON "directory"."removal_requests" USING btree ("practitioner_id");--> statement-breakpoint
CREATE INDEX "reports_queue_idx" ON "directory"."reports" USING btree ("status","created_at") WHERE "directory"."reports"."status" = 'open';