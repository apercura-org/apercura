CREATE TABLE "care"."appointment_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "care"."appointment_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"appointment_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"actor" text NOT NULL,
	"event" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"revision" integer NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "care"."appointment_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"calendar_id" uuid NOT NULL,
	"name" text NOT NULL,
	"duration_min" integer NOT NULL,
	"before_min" integer DEFAULT 0 NOT NULL,
	"after_min" integer DEFAULT 0 NOT NULL,
	"audience" text DEFAULT 'all' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"preset_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_types_audience_check" CHECK ("care"."appointment_types"."audience" in ('all', 'new', 'existing')),
	CONSTRAINT "appointment_types_duration_check" CHECK ("care"."appointment_types"."duration_min" between 5 and 480),
	CONSTRAINT "appointment_types_buffers_check" CHECK ("care"."appointment_types"."before_min" between 0 and 240 and "care"."appointment_types"."after_min" between 0 and 240)
);
--> statement-breakpoint
CREATE TABLE "care"."appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"calendar_id" uuid NOT NULL,
	"practitioner_id" integer NOT NULL,
	"appointment_type_id" uuid,
	"kind" text DEFAULT 'appointment' NOT NULL,
	"type_name" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"occupied_from" timestamp with time zone NOT NULL,
	"occupied_until" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"expiry_reason" text,
	"expires_at" timestamp with time zone,
	"booked_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"idempotency_key" text,
	"source" text NOT NULL,
	"created_by_user_id" text,
	"patient_first_name_enc" text,
	"patient_last_name_enc" text,
	"patient_email_enc" text,
	"patient_phone_enc" text,
	"practice_message_enc" text,
	"email_bidx" text,
	"phone_bidx" text,
	"patient_locale" text DEFAULT 'fr' NOT NULL,
	"patient_is_new" boolean,
	"email_verified_at" timestamp with time zone,
	"manage_token_hash" text,
	"manage_token_nonce" text,
	"hold_token_hash" text,
	"browser_key_hash" text,
	"reminder_sent_at" timestamp with time zone,
	"patient_unreachable_at" timestamp with time zone,
	"purge_after" timestamp with time zone,
	"purged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_status_check" CHECK ("care"."appointments"."status" in ('held', 'pending', 'confirmed', 'declined', 'expired', 'cancelled_by_patient', 'cancelled_by_practice', 'no_show', 'completed')),
	CONSTRAINT "appointments_kind_check" CHECK ("care"."appointments"."kind" in ('appointment', 'block')),
	CONSTRAINT "appointments_source_check" CHECK ("care"."appointments"."source" in ('online', 'practice')),
	CONSTRAINT "appointments_times_check" CHECK ("care"."appointments"."ends_at" > "care"."appointments"."starts_at" and "care"."appointments"."occupied_from" <= "care"."appointments"."starts_at" and "care"."appointments"."occupied_until" >= "care"."appointments"."ends_at"),
	CONSTRAINT "appointments_expiry_check" CHECK ("care"."appointments"."status" not in ('held', 'pending') or "care"."appointments"."expires_at" is not null),
	CONSTRAINT "appointments_locale_check" CHECK ("care"."appointments"."patient_locale" in ('fr', 'en'))
);
--> statement-breakpoint
CREATE TABLE "care"."audit_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "care"."audit_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" text NOT NULL,
	"actor" text NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"purpose" text NOT NULL,
	"subject_table" text NOT NULL,
	"subject_ids" text[] NOT NULL,
	"fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"request_id" text,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "care"."availability_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"calendar_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"span" text NOT NULL,
	"from_date" date,
	"until_date" date,
	"from_local" text,
	"until_local" text,
	"type_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_exceptions_kind_check" CHECK ("care"."availability_exceptions"."kind" in ('closed', 'open')),
	CONSTRAINT "availability_exceptions_span_check" CHECK (("care"."availability_exceptions"."span" = 'days' and "care"."availability_exceptions"."from_date" is not null and "care"."availability_exceptions"."until_date" is not null and "care"."availability_exceptions"."until_date" >= "care"."availability_exceptions"."from_date")
			or ("care"."availability_exceptions"."span" = 'time' and "care"."availability_exceptions"."from_local" is not null and "care"."availability_exceptions"."until_local" is not null and "care"."availability_exceptions"."until_local" > "care"."availability_exceptions"."from_local"))
);
--> statement-breakpoint
CREATE TABLE "care"."availability_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"calendar_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"type_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"valid_from" date,
	"valid_until" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_rules_weekday_check" CHECK ("care"."availability_rules"."weekday" between 1 and 7),
	CONSTRAINT "availability_rules_time_check" CHECK ("care"."availability_rules"."start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and "care"."availability_rules"."end_time" ~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$' and "care"."availability_rules"."end_time" > "care"."availability_rules"."start_time")
);
--> statement-breakpoint
CREATE TABLE "care"."calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"practitioner_id" integer NOT NULL,
	"site_id" integer NOT NULL,
	"time_zone" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"opened_at" timestamp with time zone,
	"min_notice_min" integer DEFAULT 120 NOT NULL,
	"horizon_days" integer DEFAULT 60 NOT NULL,
	"step_min" integer DEFAULT 15 NOT NULL,
	"manual_validation" boolean DEFAULT false NOT NULL,
	"accepts_new_patients" boolean DEFAULT true NOT NULL,
	"cancellation_cutoff_min" integer DEFAULT 1440 NOT NULL,
	"require_phone" boolean DEFAULT true NOT NULL,
	"ask_first_visit" boolean DEFAULT true NOT NULL,
	"retention_days" integer DEFAULT 90 NOT NULL,
	"public_instructions" text,
	"ics_token_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendars_status_check" CHECK ("care"."calendars"."status" in ('draft', 'open', 'paused')),
	CONSTRAINT "calendars_step_check" CHECK ("care"."calendars"."step_min" between 5 and 240),
	CONSTRAINT "calendars_min_notice_check" CHECK ("care"."calendars"."min_notice_min" between 0 and 43200),
	CONSTRAINT "calendars_horizon_check" CHECK ("care"."calendars"."horizon_days" between 0 and 365),
	CONSTRAINT "calendars_cutoff_check" CHECK ("care"."calendars"."cancellation_cutoff_min" between 0 and 20160),
	CONSTRAINT "calendars_retention_check" CHECK ("care"."calendars"."retention_days" between 30 and 365)
);
--> statement-breakpoint
CREATE TABLE "care"."organization_keys" (
	"organization_id" text NOT NULL,
	"version" integer NOT NULL,
	"wrapped_dek" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	CONSTRAINT "organization_keys_organization_id_version_pk" PRIMARY KEY("organization_id","version")
);
--> statement-breakpoint
CREATE TABLE "care"."otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"purpose" text NOT NULL,
	"appointment_id" uuid,
	"target_bidx" text NOT NULL,
	"code_hash" text NOT NULL,
	"salt" text NOT NULL,
	"code_enc" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "care"."outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"recipient" text NOT NULL,
	"appointment_id" uuid,
	"otp_challenge_id" uuid,
	"appointment_revision" integer,
	"expected_statuses" text[] DEFAULT '{}'::text[] NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_status_check" CHECK ("care"."outbox"."status" in ('pending', 'sending', 'sent', 'skipped', 'dead')),
	CONSTRAINT "outbox_recipient_check" CHECK ("care"."outbox"."recipient" in ('patient', 'practice'))
);
--> statement-breakpoint
ALTER TABLE "care"."appointment_events" ADD CONSTRAINT "appointment_events_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "care"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care"."appointment_types" ADD CONSTRAINT "appointment_types_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "care"."calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care"."appointments" ADD CONSTRAINT "appointments_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "care"."calendars"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care"."appointments" ADD CONSTRAINT "appointments_appointment_type_id_appointment_types_id_fk" FOREIGN KEY ("appointment_type_id") REFERENCES "care"."appointment_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care"."availability_exceptions" ADD CONSTRAINT "availability_exceptions_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "care"."calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care"."availability_rules" ADD CONSTRAINT "availability_rules_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "care"."calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care"."calendars" ADD CONSTRAINT "calendars_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "directory"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care"."calendars" ADD CONSTRAINT "calendars_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "directory"."practitioners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care"."calendars" ADD CONSTRAINT "calendars_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "directory"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care"."organization_keys" ADD CONSTRAINT "organization_keys_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "directory"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care"."otp_challenges" ADD CONSTRAINT "otp_challenges_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "care"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care"."outbox" ADD CONSTRAINT "outbox_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "care"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care"."outbox" ADD CONSTRAINT "outbox_otp_challenge_id_otp_challenges_id_fk" FOREIGN KEY ("otp_challenge_id") REFERENCES "care"."otp_challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_events_appointment_idx" ON "care"."appointment_events" USING btree ("appointment_id","id");--> statement-breakpoint
CREATE INDEX "appointment_types_calendar_idx" ON "care"."appointment_types" USING btree ("calendar_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_idempotency_key_uq" ON "care"."appointments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_manage_token_hash_uq" ON "care"."appointments" USING btree ("manage_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_hold_token_hash_uq" ON "care"."appointments" USING btree ("hold_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_one_hold_per_browser_uq" ON "care"."appointments" USING btree ("browser_key_hash") WHERE "care"."appointments"."status" = 'held' and "care"."appointments"."browser_key_hash" is not null;--> statement-breakpoint
CREATE INDEX "appointments_practitioner_active_idx" ON "care"."appointments" USING btree ("practitioner_id","occupied_from") WHERE "care"."appointments"."status" in ('held', 'pending', 'confirmed');--> statement-breakpoint
CREATE INDEX "appointments_calendar_starts_idx" ON "care"."appointments" USING btree ("calendar_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_organization_starts_idx" ON "care"."appointments" USING btree ("organization_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_email_bidx_idx" ON "care"."appointments" USING btree ("organization_id","email_bidx");--> statement-breakpoint
CREATE INDEX "appointments_expiring_idx" ON "care"."appointments" USING btree ("expires_at") WHERE "care"."appointments"."status" in ('held', 'pending');--> statement-breakpoint
CREATE INDEX "appointments_purge_idx" ON "care"."appointments" USING btree ("purge_after") WHERE "care"."appointments"."purged_at" is null;--> statement-breakpoint
CREATE INDEX "audit_events_organization_idx" ON "care"."audit_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_user_idx" ON "care"."audit_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "availability_exceptions_calendar_idx" ON "care"."availability_exceptions" USING btree ("calendar_id");--> statement-breakpoint
CREATE INDEX "availability_rules_calendar_idx" ON "care"."availability_rules" USING btree ("calendar_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calendars_practitioner_site_uq" ON "care"."calendars" USING btree ("practitioner_id","site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calendars_ics_token_hash_uq" ON "care"."calendars" USING btree ("ics_token_hash");--> statement-breakpoint
CREATE INDEX "calendars_organization_idx" ON "care"."calendars" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "otp_challenges_appointment_idx" ON "care"."otp_challenges" USING btree ("appointment_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_dedupe_key_uq" ON "care"."outbox" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "outbox_due_idx" ON "care"."outbox" USING btree ("next_attempt_at") WHERE "care"."outbox"."status" in ('pending', 'sending');--> statement-breakpoint
CREATE INDEX "outbox_appointment_idx" ON "care"."outbox" USING btree ("appointment_id");