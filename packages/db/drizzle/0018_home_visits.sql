-- Home visits (issue #75): an appointment type can take place at the patient's address, inside a
-- service area (INSEE codes of communes or arrondissements), with a fixed travel time occupied
-- after each visit. The patient's street address and commune are encrypted like the other patient
-- fields (AAD `appointments.patient_address_enc.<id>`, `appointments.patient_commune_enc.<id>`),
-- erased by the purge, and never sent in emails.
--
-- Safe on a live database: every column is added with a constant default or nullable, which
-- PostgreSQL records in the catalog without rewriting the table. The check on care.appointments is
-- added NOT VALID, so it takes no scan of the table: every existing row holds the default 'site',
-- and new or updated rows are checked. care.appointment_types is a small settings table: its
-- checks are validated at once.
--
-- Grants: apercura_app holds SELECT, INSERT, UPDATE, DELETE on both whole tables (0004, 0010),
-- which covers new columns. apercura_readonly reads appointment_types whole, and appointments by
-- column list (0010): it gets the new columns, ciphertext like the other `*_enc` columns.
ALTER TABLE "care"."appointment_types" ADD COLUMN "location" text DEFAULT 'site' NOT NULL;--> statement-breakpoint
ALTER TABLE "care"."appointment_types" ADD COLUMN "travel_min" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "care"."appointment_types" ADD COLUMN "service_area_codes" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "care"."appointments" ADD COLUMN "location" text DEFAULT 'site' NOT NULL;--> statement-breakpoint
ALTER TABLE "care"."appointments" ADD COLUMN "patient_address_enc" text;--> statement-breakpoint
ALTER TABLE "care"."appointments" ADD COLUMN "patient_commune_enc" text;--> statement-breakpoint
ALTER TABLE "care"."appointment_types" ADD CONSTRAINT "appointment_types_location_check" CHECK ("care"."appointment_types"."location" in ('site', 'home'));--> statement-breakpoint
ALTER TABLE "care"."appointment_types" ADD CONSTRAINT "appointment_types_travel_check" CHECK ("care"."appointment_types"."travel_min" between 0 and 240 and ("care"."appointment_types"."location" = 'home' or "care"."appointment_types"."travel_min" = 0));--> statement-breakpoint
ALTER TABLE "care"."appointment_types" ADD CONSTRAINT "appointment_types_service_area_check" CHECK (cardinality("care"."appointment_types"."service_area_codes") <= 200 and ("care"."appointment_types"."location" = 'home' or cardinality("care"."appointment_types"."service_area_codes") = 0));--> statement-breakpoint
ALTER TABLE "care"."appointments" ADD CONSTRAINT "appointments_location_check" CHECK ("care"."appointments"."location" in ('site', 'home')) NOT VALID;--> statement-breakpoint
GRANT SELECT (location, patient_address_enc, patient_commune_enc) ON care.appointments TO apercura_readonly;