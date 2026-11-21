-- Custom migration: grants on the booking tables (schema `care`).
--
-- - apercura_app:      read/write, except care.audit_events: INSERT and SELECT
--                      only, so nobody using the app's credentials can rewrite
--                      or erase who read which patient data.
-- - apercura_etl:      nothing at all on `care` (0004 already revokes the schema).
-- - apercura_readonly: SELECT on what is ciphertext or non-identifying. Never
--                      the secrets: wrapped data keys, OTP hashes and salts,
--                      the encrypted OTP code, the manage-token nonce, manage / hold / browser token
--                      hashes and the iCalendar feed token hash.
--
-- The default privileges of 0004 already give apercura_app S/I/U/D and
-- apercura_readonly SELECT on new tables; this migration states the grants
-- explicitly, then narrows them.

GRANT USAGE ON SCHEMA care TO apercura_app, apercura_readonly;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON
	care.calendars,
	care.appointment_types,
	care.availability_rules,
	care.availability_exceptions,
	care.appointments,
	care.appointment_events,
	care.otp_challenges,
	care.organization_keys,
	care.outbox
TO apercura_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA care TO apercura_app;
--> statement-breakpoint

-- Append-only audit log.
REVOKE ALL ON care.audit_events FROM apercura_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON care.audit_events TO apercura_app;
--> statement-breakpoint

-- The import never sees patient data.
REVOKE ALL ON ALL TABLES IN SCHEMA care FROM apercura_etl;
--> statement-breakpoint
REVOKE ALL ON ALL SEQUENCES IN SCHEMA care FROM apercura_etl;
--> statement-breakpoint

-- Read-only: whole tables where nothing is secret…
REVOKE ALL ON ALL TABLES IN SCHEMA care FROM apercura_readonly;
--> statement-breakpoint
GRANT SELECT ON
	care.appointment_types,
	care.availability_rules,
	care.availability_exceptions,
	care.appointment_events,
	care.outbox,
	care.audit_events
TO apercura_readonly;
--> statement-breakpoint
-- …and column lists elsewhere.
GRANT SELECT (
	id, organization_id, practitioner_id, site_id, time_zone, status, opened_at, min_notice_min,
	horizon_days, step_min, manual_validation, accepts_new_patients, cancellation_cutoff_min,
	require_phone, ask_first_visit, retention_days, public_instructions, created_at, updated_at
) ON care.calendars TO apercura_readonly;
--> statement-breakpoint
GRANT SELECT (
	id, organization_id, calendar_id, practitioner_id, appointment_type_id, kind, type_name,
	starts_at, ends_at, occupied_from, occupied_until, status, expiry_reason, expires_at, booked_at,
	revision, idempotency_key, source, created_by_user_id, patient_first_name_enc,
	patient_last_name_enc, patient_email_enc, patient_phone_enc, practice_message_enc, email_bidx,
	phone_bidx, patient_locale, patient_is_new, email_verified_at, reminder_sent_at,
	patient_unreachable_at, purge_after, purged_at, created_at, updated_at
) ON care.appointments TO apercura_readonly;
--> statement-breakpoint
GRANT SELECT (
	id, organization_id, purpose, appointment_id, target_bidx, attempts, expires_at, consumed_at,
	created_at
) ON care.otp_challenges TO apercura_readonly;
--> statement-breakpoint

-- The narrow write path to directory.practitioners.next_free_at.
REVOKE ALL ON FUNCTION directory.set_next_free_at(integer, timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION directory.set_next_free_at(integer, timestamptz) TO apercura_app;
