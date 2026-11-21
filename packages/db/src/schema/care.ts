/**
 * Schema `care`: calendars, appointments and everything touching patient data.
 *
 * - Patient identity and contact details are stored encrypted (`*_enc`, AES-256-GCM with the
 *   organization's data key, AAD `table.column.rowId`) and only ever decrypted by the web app's
 *   `server/phi` module, which writes an `audit_events` row in the same transaction.
 * - Searchable fingerprints (`*_bidx`) are HMACs keyed per organization.
 * - Times are always `timestamptz`. Local wall-clock values of availability rules stay text
 *   (`HH:mm`, `YYYY-MM-DDTHH:mm`) and are read in the calendar's own time zone.
 *
 * The overlap constraint `appointments_no_overlap` (EXCLUDE USING gist) is created by a custom
 * migration (`0009_care_constraints.sql`): Drizzle cannot express it. The import role has no
 * access to this schema at all.
 */
import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	check,
	date,
	index,
	integer,
	jsonb,
	primaryKey,
	smallint,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { practitioners, sites } from "./directory";
import { care } from "./schemas";

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
	timestamp({ withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date());

/** Every status of an agenda entry; `held`, `pending` and `confirmed` occupy the slot. */
export const APPOINTMENT_STATUSES = [
	"held",
	"pending",
	"confirmed",
	"declined",
	"expired",
	"cancelled_by_patient",
	"cancelled_by_practice",
	"no_show",
	"completed",
] as const;

const statusList = sql.raw(APPOINTMENT_STATUSES.map((status) => `'${status}'`).join(", "));

// ---------------------------------------------------------------------------
// Calendars and availability
// ---------------------------------------------------------------------------

/** One practitioner's bookable agenda at one site, in the site's time zone. */
export const calendars = care.table(
	"calendars",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: text()
			.notNull()
			.references(() => organization.id, { onDelete: "restrict" }),
		practitionerId: integer()
			.notNull()
			.references(() => practitioners.id, { onDelete: "restrict" }),
		siteId: integer()
			.notNull()
			.references(() => sites.id, { onDelete: "restrict" }),
		/** IANA zone of the site, from its department (`timeZoneForDepartment`). */
		timeZone: text().notNull(),
		/** `draft` (being set up), `open` (bookable online) or `paused`. */
		status: text().notNull().default("draft"),
		openedAt: timestamp({ withTimezone: true }),
		/** Minimal delay between now and a bookable start, in minutes. */
		minNoticeMin: integer().notNull().default(120),
		/** How many local days ahead patients may book. */
		horizonDays: integer().notNull().default(60),
		/** Distance between two candidate starts, in minutes. */
		stepMin: integer().notNull().default(15),
		/** Requests wait for the practice (`pending`) instead of being confirmed at once. */
		manualValidation: boolean().notNull().default(false),
		acceptsNewPatients: boolean().notNull().default(true),
		/** Patients may cancel online until this many minutes before the start. */
		cancellationCutoffMin: integer().notNull().default(1440),
		/** Data asked to the patient: the phone number is required unless turned off. */
		requirePhone: boolean().notNull().default(true),
		askFirstVisit: boolean().notNull().default(true),
		/** Patient data is erased this many days after the appointment (30 to 365). */
		retentionDays: integer().notNull().default(90),
		/** Plain text shown on the booking panel (never HTML). */
		publicInstructions: text(),
		/** SHA-256 of the private iCalendar feed token. */
		icsTokenHash: text(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		uniqueIndex("calendars_practitioner_site_uq").on(table.practitionerId, table.siteId),
		uniqueIndex("calendars_ics_token_hash_uq").on(table.icsTokenHash),
		index("calendars_organization_idx").on(table.organizationId),
		check("calendars_status_check", sql`${table.status} in ('draft', 'open', 'paused')`),
		check("calendars_step_check", sql`${table.stepMin} between 5 and 240`),
		check("calendars_min_notice_check", sql`${table.minNoticeMin} between 0 and 43200`),
		check("calendars_horizon_check", sql`${table.horizonDays} between 0 and 365`),
		check("calendars_cutoff_check", sql`${table.cancellationCutoffMin} between 0 and 20160`),
		check("calendars_retention_check", sql`${table.retentionDays} between 30 and 365`),
	],
);

/** A reason for an appointment ("motif"): the practitioner's own text, duration and buffers. */
export const appointmentTypes = care.table(
	"appointment_types",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: text().notNull(),
		calendarId: uuid()
			.notNull()
			.references(() => calendars.id, { onDelete: "cascade" }),
		name: text().notNull(),
		durationMin: integer().notNull(),
		beforeMin: integer().notNull().default(0),
		afterMin: integer().notNull().default(0),
		/** `all`, `new` (first visit only) or `existing` (patients already followed). */
		audience: text().notNull().default("all"),
		position: integer().notNull().default(0),
		active: boolean().notNull().default(true),
		/** i18n key of the preset it was created from, if any. */
		presetKey: text(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		index("appointment_types_calendar_idx").on(table.calendarId, table.position),
		check("appointment_types_audience_check", sql`${table.audience} in ('all', 'new', 'existing')`),
		check("appointment_types_duration_check", sql`${table.durationMin} between 5 and 480`),
		check(
			"appointment_types_buffers_check",
			sql`${table.beforeMin} between 0 and 240 and ${table.afterMin} between 0 and 240`,
		),
	],
);

/** A weekly opening window, in the calendar's local time. */
export const availabilityRules = care.table(
	"availability_rules",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: text().notNull(),
		calendarId: uuid()
			.notNull()
			.references(() => calendars.id, { onDelete: "cascade" }),
		/** ISO weekday: 1 = Monday … 7 = Sunday. */
		weekday: smallint().notNull(),
		/** Local `HH:mm`. */
		startTime: text().notNull(),
		/** Local `HH:mm`, after `start_time` (`24:00` closes at midnight). */
		endTime: text().notNull(),
		/** Appointment types allowed in the window; empty means all of them. */
		typeIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
		validFrom: date({ mode: "string" }),
		validUntil: date({ mode: "string" }),
		createdAt: createdAt(),
	},
	(table) => [
		index("availability_rules_calendar_idx").on(table.calendarId),
		check("availability_rules_weekday_check", sql`${table.weekday} between 1 and 7`),
		check(
			"availability_rules_time_check",
			sql`${table.startTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and ${table.endTime} ~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$' and ${table.endTime} > ${table.startTime}`,
		),
	],
);

/** A closed range (holidays) or an exceptional open window, in local time. */
export const availabilityExceptions = care.table(
	"availability_exceptions",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: text().notNull(),
		calendarId: uuid()
			.notNull()
			.references(() => calendars.id, { onDelete: "cascade" }),
		/** `closed` or `open`. */
		kind: text().notNull(),
		/** `days` (whole local days, both inclusive) or `time` (local `[from, until)`). */
		span: text().notNull(),
		fromDate: date({ mode: "string" }),
		untilDate: date({ mode: "string" }),
		/** Local `YYYY-MM-DDTHH:mm`. */
		fromLocal: text(),
		untilLocal: text(),
		typeIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
		createdAt: createdAt(),
	},
	(table) => [
		index("availability_exceptions_calendar_idx").on(table.calendarId),
		check("availability_exceptions_kind_check", sql`${table.kind} in ('closed', 'open')`),
		check(
			"availability_exceptions_span_check",
			sql`(${table.span} = 'days' and ${table.fromDate} is not null and ${table.untilDate} is not null and ${table.untilDate} >= ${table.fromDate})
			or (${table.span} = 'time' and ${table.fromLocal} is not null and ${table.untilLocal} is not null and ${table.untilLocal} > ${table.fromLocal})`,
		),
	],
);

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

/**
 * Agenda entries: appointments and one-off blocks. `practitioner_id` is denormalized so the
 * overlap constraint covers every calendar of a person (nobody is in two places at once).
 * `occupied_from`/`occupied_until` are stored, buffers frozen at booking time.
 */
export const appointments = care.table(
	"appointments",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: text().notNull(),
		calendarId: uuid()
			.notNull()
			.references(() => calendars.id, { onDelete: "restrict" }),
		practitionerId: integer().notNull(),
		appointmentTypeId: uuid().references(() => appointmentTypes.id, { onDelete: "set null" }),
		/** `appointment` or `block`. */
		kind: text().notNull().default("appointment"),
		/** Name of the type at booking time (plaintext: the practice needs it, emails never carry it). */
		typeName: text(),
		startsAt: timestamp({ withTimezone: true }).notNull(),
		endsAt: timestamp({ withTimezone: true }).notNull(),
		occupiedFrom: timestamp({ withTimezone: true }).notNull(),
		occupiedUntil: timestamp({ withTimezone: true }).notNull(),
		status: text().notNull(),
		/** Why the entry expired; only `hold_timeout` can be revived by a late code. */
		expiryReason: text(),
		/** End of the hold (`held`) or validation deadline (`pending`). */
		expiresAt: timestamp({ withTimezone: true }),
		/** When the patient completed the booking (code verified) or the practice created it. */
		bookedAt: timestamp({ withTimezone: true }),
		/** Bumped on every change patients can see: SEQUENCE of the .ics, outbox staleness check. */
		revision: integer().notNull().default(1),
		/** Client-chosen key: a retried `hold` returns the same entry. */
		idempotencyKey: text(),
		/** `online` (patient) or `practice` (staff). */
		source: text().notNull(),
		createdByUserId: text(),
		// --- patient data (encrypted, AAD `appointments.<column>.<id>`) ---
		patientFirstNameEnc: text(),
		patientLastNameEnc: text(),
		patientEmailEnc: text(),
		patientPhoneEnc: text(),
		/** Message of the practice attached to a cancellation. */
		practiceMessageEnc: text(),
		/** Blind indexes keyed per organization (see `deriveBlindIndexKey`). */
		emailBidx: text(),
		phoneBidx: text(),
		/** Locale of the patient's emails (`fr` or `en`). */
		patientLocale: text().notNull().default("fr"),
		/** Answer to "first visit?", when asked. */
		patientIsNew: boolean(),
		/** When the patient proved the email address (code, or confirmation link for staff entries). */
		emailVerifiedAt: timestamp({ withTimezone: true }),
		/**
		 * SHA-256 of the 256-bit manage token. The token itself is never stored: it is an HMAC of
		 * the id and `manage_token_nonce` under a server key, re-derived for each patient email.
		 */
		manageTokenHash: text(),
		/** Random nonce of the manage token; a new nonce revokes every earlier link. */
		manageTokenNonce: text(),
		/** SHA-256 of the hold token returned to the browser that created the hold. */
		holdTokenHash: text(),
		/** SHA-256 of the browser cookie: one live hold per browser. */
		browserKeyHash: text(),
		reminderSentAt: timestamp({ withTimezone: true }),
		/** Set when patient emails could not be delivered: the agenda says "call the patient". */
		patientUnreachableAt: timestamp({ withTimezone: true }),
		/** Patient data is erased at this instant (end + retention). */
		purgeAfter: timestamp({ withTimezone: true }),
		purgedAt: timestamp({ withTimezone: true }),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		uniqueIndex("appointments_idempotency_key_uq").on(table.idempotencyKey),
		uniqueIndex("appointments_manage_token_hash_uq").on(table.manageTokenHash),
		uniqueIndex("appointments_hold_token_hash_uq").on(table.holdTokenHash),
		// One live hold per browser (older holds of the same browser are released first).
		uniqueIndex("appointments_one_hold_per_browser_uq")
			.on(table.browserKeyHash)
			.where(sql`${table.status} = 'held' and ${table.browserKeyHash} is not null`),
		index("appointments_practitioner_active_idx")
			.on(table.practitionerId, table.occupiedFrom)
			.where(sql`${table.status} in ('held', 'pending', 'confirmed')`),
		index("appointments_calendar_starts_idx").on(table.calendarId, table.startsAt),
		index("appointments_organization_starts_idx").on(table.organizationId, table.startsAt),
		index("appointments_email_bidx_idx").on(table.organizationId, table.emailBidx),
		index("appointments_expiring_idx")
			.on(table.expiresAt)
			.where(sql`${table.status} in ('held', 'pending')`),
		index("appointments_purge_idx").on(table.purgeAfter).where(sql`${table.purgedAt} is null`),
		check("appointments_status_check", sql`${table.status} in (${statusList})`),
		check("appointments_kind_check", sql`${table.kind} in ('appointment', 'block')`),
		check("appointments_source_check", sql`${table.source} in ('online', 'practice')`),
		check(
			"appointments_times_check",
			sql`${table.endsAt} > ${table.startsAt} and ${table.occupiedFrom} <= ${table.startsAt} and ${table.occupiedUntil} >= ${table.endsAt}`,
		),
		check(
			"appointments_expiry_check",
			sql`${table.status} not in ('held', 'pending') or ${table.expiresAt} is not null`,
		),
		check("appointments_locale_check", sql`${table.patientLocale} in ('fr', 'en')`),
	],
);

/** History of every transition, written in the same transaction as the outbox rows. */
export const appointmentEvents = care.table(
	"appointment_events",
	{
		id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
		appointmentId: uuid()
			.notNull()
			.references(() => appointments.id, { onDelete: "cascade" }),
		organizationId: text().notNull(),
		/** `patient`, `user:<id>` or `system:<job>`. */
		actor: text().notNull(),
		event: text().notNull(),
		fromStatus: text(),
		toStatus: text(),
		revision: integer().notNull(),
		/** Non-identifying details (times, reasons). Never patient data. */
		data: jsonb(),
		createdAt: createdAt(),
	},
	(table) => [index("appointment_events_appointment_idx").on(table.appointmentId, table.id)],
);

/** Email codes: only the HMAC of the code is kept, plus its encrypted copy until it is sent. */
export const otpChallenges = care.table(
	"otp_challenges",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: text().notNull(),
		/** `booking_email`. */
		purpose: text().notNull(),
		appointmentId: uuid().references(() => appointments.id, { onDelete: "cascade" }),
		/** Blind index of the address the code was sent to. */
		targetBidx: text().notNull(),
		codeHash: text().notNull(),
		salt: text().notNull(),
		/** The code encrypted for the outbox (AAD `otp_challenges.code_enc.<id>`); erased once sent. */
		codeEnc: text(),
		attempts: integer().notNull().default(0),
		expiresAt: timestamp({ withTimezone: true }).notNull(),
		consumedAt: timestamp({ withTimezone: true }),
		createdAt: createdAt(),
	},
	(table) => [index("otp_challenges_appointment_idx").on(table.appointmentId, table.createdAt)],
);

/** Organization data keys (DEK), wrapped by a master key (AAD `organization_keys.dek.<orgId>`). */
export const organizationKeys = care.table(
	"organization_keys",
	{
		organizationId: text()
			.notNull()
			.references(() => organization.id, { onDelete: "restrict" }),
		version: integer().notNull(),
		/** `enc:v1:{kek id}:…` token of the 32-byte key. */
		wrappedDek: text().notNull(),
		createdAt: createdAt(),
		/** Set once every field encrypted with it has been re-encrypted. */
		retiredAt: timestamp({ withTimezone: true }),
	},
	(table) => [primaryKey({ columns: [table.organizationId, table.version] })],
);

/**
 * Emails to send. Rows carry identifiers only: the content is decrypted when sending. A row is
 * skipped when its appointment's status or revision no longer matches.
 */
export const outbox = care.table(
	"outbox",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: text().notNull(),
		/** Template, e.g. `booking_code`, `booking_confirmed`, `reminder`, `practice_new`. */
		kind: text().notNull(),
		/** `patient` or `practice`. */
		recipient: text().notNull(),
		appointmentId: uuid().references(() => appointments.id, { onDelete: "cascade" }),
		otpChallengeId: uuid().references(() => otpChallenges.id, { onDelete: "cascade" }),
		/** Revision of the appointment when the row was enqueued. */
		appointmentRevision: integer(),
		/** Statuses the appointment must still have when the email is sent. */
		expectedStatuses: text().array().notNull().default(sql`'{}'::text[]`),
		/** Unique business key, e.g. `reminder:{id}:{revision}`: enqueuing twice is a no-op. */
		dedupeKey: text().notNull(),
		/** `pending`, `sending`, `sent`, `skipped` or `dead`. */
		status: text().notNull().default("pending"),
		attempts: integer().notNull().default(0),
		nextAttemptAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		leaseToken: uuid(),
		leaseUntil: timestamp({ withTimezone: true }),
		/** Technical error of the last attempt (never patient data). */
		lastError: text(),
		sentAt: timestamp({ withTimezone: true }),
		createdAt: createdAt(),
	},
	(table) => [
		uniqueIndex("outbox_dedupe_key_uq").on(table.dedupeKey),
		index("outbox_due_idx")
			.on(table.nextAttemptAt)
			.where(sql`${table.status} in ('pending', 'sending')`),
		index("outbox_appointment_idx").on(table.appointmentId),
		check(
			"outbox_status_check",
			sql`${table.status} in ('pending', 'sending', 'sent', 'skipped', 'dead')`,
		),
		check("outbox_recipient_check", sql`${table.recipient} in ('patient', 'practice')`),
	],
);

/**
 * Who read or changed which patient data, when and why. Append-only: the app role may only
 * INSERT and SELECT (see `0010_care_grants.sql`).
 */
export const auditEvents = care.table(
	"audit_events",
	{
		id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
		organizationId: text().notNull(),
		/** `user:<id>`, `patient` or `system:<job>`. */
		actor: text().notNull(),
		userId: text(),
		/** `decrypt`, `encrypt`, `purge`… */
		action: text().notNull(),
		/** Why: `agenda_list`, `notify`, `manage`… */
		purpose: text().notNull(),
		subjectTable: text().notNull(),
		subjectIds: text().array().notNull(),
		fields: text().array().notNull().default(sql`'{}'::text[]`),
		requestId: text(),
		/** Keyed hash of the client IP, never the IP itself. */
		ipHash: text(),
		createdAt: createdAt(),
	},
	(table) => [
		index("audit_events_organization_idx").on(table.organizationId, table.createdAt),
		index("audit_events_user_idx").on(table.userId, table.createdAt),
	],
);
