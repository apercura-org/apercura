/**
 * Claims, removal requests, error reports and the platform audit log, in
 * schema `directory` (app-owned: the import has no access to any of them).
 *
 * Nothing here is health data. Claim documents and the free text of reports
 * and removal requests are encrypted with the platform key before they are
 * stored (`enc:v1:…` tokens, AAD `table.column.rowId`); documents themselves
 * live encrypted in object storage and are deleted 30 days after the decision.
 */
import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	check,
	index,
	integer,
	jsonb,
	smallint,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { practitioners } from "./directory";
import { directory } from "./schemas";

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
	timestamp({ withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date());

/**
 * A request by an account to become the verified owner of a practitioner page.
 * It always targets one RPPS (never a name). Lifecycle: `open` (collecting
 * proofs) -> `in_review` (waiting for an administrator) -> `verified`,
 * `rejected`, `withdrawn` or `superseded` (lost a contest).
 */
export const claims = directory.table(
	"claims",
	{
		id: text().primaryKey(),
		practitionerId: integer()
			.notNull()
			.references(() => practitioners.id, { onDelete: "cascade" }),
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		status: text().notNull().default("open"),
		/** The page already had a verified owner when the claim was opened. */
		contest: boolean().notNull().default(false),
		submittedAt: timestamp({ withTimezone: true }),
		verifiedAt: timestamp({ withTimezone: true }),
		/** Without Pro Santé Connect, booking opens 7 days after verification. */
		bookingOpensAt: timestamp({ withTimezone: true }),
		decidedAt: timestamp({ withTimezone: true }),
		/** Administrator who decided; null for an automatic decision. */
		decidedBy: text(),
		decisionReason: text(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		// One verified owner per practitioner.
		uniqueIndex("claims_one_owner_uq")
			.on(table.practitionerId)
			.where(sql`${table.status} = 'verified'`),
		// One live claim per account and page.
		uniqueIndex("claims_one_live_per_user_uq")
			.on(table.practitionerId, table.userId)
			.where(sql`${table.status} in ('open', 'in_review')`),
		index("claims_user_idx").on(table.userId),
		index("claims_queue_idx")
			.on(table.status, table.submittedAt)
			.where(sql`${table.status} = 'in_review'`),
		check(
			"claims_status_check",
			sql`${table.status} in ('open', 'in_review', 'verified', 'rejected', 'withdrawn', 'superseded')`,
		),
	],
);

/**
 * One verification method applied to a claim. Secrets (email token, phone
 * callback code) are stored as hashes only.
 */
export const claimChecks = directory.table(
	"claim_checks",
	{
		id: integer().primaryKey().generatedAlwaysAsIdentity(),
		claimId: text()
			.notNull()
			.references(() => claims.id, { onDelete: "cascade" }),
		/** `psc`, `registry_email`, `document` or `phone_callback`. */
		method: text().notNull(),
		/** `pending`, `passed` or `failed`. */
		status: text().notNull().default("pending"),
		secretHash: text(),
		attempts: smallint().notNull().default(0),
		expiresAt: timestamp({ withTimezone: true }),
		passedAt: timestamp({ withTimezone: true }),
		/** Non-secret facts: masked email, PSC identifier matched, site called. */
		detail: jsonb(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		uniqueIndex("claim_checks_method_uq").on(table.claimId, table.method),
		check(
			"claim_checks_method_check",
			sql`${table.method} in ('psc', 'registry_email', 'document', 'phone_callback')`,
		),
		check("claim_checks_status_check", sql`${table.status} in ('pending', 'passed', 'failed')`),
	],
);

/** A proof uploaded with a claim (CPS card, Ordre attestation), encrypted in object storage. */
export const claimDocuments = directory.table(
	"claim_documents",
	{
		id: text().primaryKey(),
		claimId: text()
			.notNull()
			.references(() => claims.id, { onDelete: "cascade" }),
		/** `cps_card` or `ordre_attestation`. */
		kind: text().notNull(),
		/** Random object key (`claims/{random}`); the object is a platform-key ciphertext. */
		storageKey: text().notNull(),
		contentType: text().notNull(),
		byteSize: integer().notNull(),
		/** Decision date + 30 days; the purge job deletes the object after it. */
		purgeAfter: timestamp({ withTimezone: true }),
		purgedAt: timestamp({ withTimezone: true }),
		createdAt: createdAt(),
	},
	(table) => [
		index("claim_documents_claim_idx").on(table.claimId),
		index("claim_documents_purge_idx")
			.on(table.purgeAfter)
			.where(sql`${table.purgedAt} is null and ${table.purgeAfter} is not null`),
		check("claim_documents_kind_check", sql`${table.kind} in ('cps_card', 'ordre_attestation')`),
	],
);

/**
 * GDPR art. 21 objection to an unclaimed page. The page is withheld at once
 * (`practitioners.withheld_at`) and suppressed once an administrator confirms
 * the request.
 */
export const removalRequests = directory.table(
	"removal_requests",
	{
		id: text().primaryKey(),
		practitionerId: integer()
			.notNull()
			.references(() => practitioners.id, { onDelete: "cascade" }),
		/** `pending`, `confirmed` or `rejected`. */
		status: text().notNull().default("pending"),
		/** Encrypted contact email of the requester, for the light check. */
		contactEnc: text().notNull(),
		/** Encrypted free text (optional). */
		messageEnc: text(),
		/** Locale of the emails sent to the requester (an interface locale, `fr` by default). */
		locale: text().notNull().default("fr"),
		decidedAt: timestamp({ withTimezone: true }),
		decidedBy: text(),
		decisionReason: text(),
		createdAt: createdAt(),
	},
	(table) => [
		index("removal_requests_queue_idx")
			.on(table.status, table.createdAt)
			.where(sql`${table.status} = 'pending'`),
		index("removal_requests_practitioner_idx").on(table.practitionerId),
		check(
			"removal_requests_status_check",
			sql`${table.status} in ('pending', 'confirmed', 'rejected')`,
		),
	],
);

/** "Report an error" on a public page: wrong information, retired, deceased, impersonation. */
export const reports = directory.table(
	"reports",
	{
		id: text().primaryKey(),
		practitionerId: integer().references(() => practitioners.id, { onDelete: "cascade" }),
		kind: text().notNull(),
		/** Encrypted JSON `{ message, contact? }`. */
		contentEnc: text().notNull(),
		/** `open`, `resolved` or `dismissed`. */
		status: text().notNull().default("open"),
		resolvedAt: timestamp({ withTimezone: true }),
		resolvedBy: text(),
		resolutionNote: text(),
		createdAt: createdAt(),
	},
	(table) => [
		index("reports_queue_idx")
			.on(table.status, table.createdAt)
			.where(sql`${table.status} = 'open'`),
		check(
			"reports_kind_check",
			sql`${table.kind} in ('wrong_info', 'retired', 'deceased', 'impersonation')`,
		),
		check("reports_status_check", sql`${table.status} in ('open', 'resolved', 'dismissed')`),
	],
);

/**
 * Objects left in the object storage (profile photo, claim documents) by a practitioner whose
 * data was deleted on removal (`directory.purge_suppressed_practitioners`, migration 0023): the
 * database cannot reach the storage, so it queues their keys here and `jobs:tick
 * claim-documents` deletes each object, then its row. Keys only, nothing about the person.
 */
export const storageDeletions = directory.table("storage_deletions", {
	key: text().primaryKey(),
	createdAt: createdAt(),
});

/**
 * Who did what on the platform side (decrypting a claim document or a report,
 * deciding a claim). Append-only: the app role may insert and read, never
 * update or delete. Kept one year.
 */
export const platformAuditEvents = directory.table(
	"platform_audit_events",
	{
		id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
		/** User id, or `system:*`. Not a foreign key: the log outlives accounts. */
		actor: text().notNull(),
		action: text().notNull(),
		subjectType: text().notNull(),
		subjectId: text().notNull(),
		/** HMAC of the client IP (same key as the rate limits), never the IP itself. */
		ipHash: text(),
		createdAt: createdAt(),
	},
	(table) => [
		index("platform_audit_events_subject_idx").on(table.subjectType, table.subjectId),
		index("platform_audit_events_created_idx").on(table.createdAt),
	],
);

/**
 * "I am this practitioner, contact me": for those who cannot claim their page with Pro Santé
 * Connect, the registry email or a document. Everything the requester typed (name, professional
 * email, phone, message) is one encrypted JSON (platform key, AAD
 * `practitioner_contact_requests.content_enc.<id>`); the row itself only says which page, when
 * and where the administrators stand. Deleted `CONTACT_REQUEST_RETENTION_MONTHS` after its last
 * change, whatever its status.
 */
export const practitionerContactRequests = directory.table(
	"practitioner_contact_requests",
	{
		id: text().primaryKey(),
		practitionerId: integer()
			.notNull()
			.references(() => practitioners.id, { onDelete: "cascade" }),
		/** `new`, `contacted` or `closed`. */
		status: text().notNull().default("new"),
		/** Encrypted JSON `{ name, email, phone?, message }`. */
		contentEnc: text().notNull(),
		/** Locale of the confirmation email (an interface locale, `fr` by default). */
		locale: text().notNull().default("fr"),
		/** Administrator who last changed the status. */
		handledBy: text(),
		createdAt: createdAt(),
		/** Last status change: the retention counts from it (set by hand, never by a re-encryption). */
		updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		index("practitioner_contact_requests_queue_idx").on(table.status, table.createdAt),
		index("practitioner_contact_requests_practitioner_idx").on(table.practitionerId),
		index("practitioner_contact_requests_updated_idx").on(table.updatedAt),
		check(
			"practitioner_contact_requests_status_check",
			sql`${table.status} in ('new', 'contacted', 'closed')`,
		),
	],
);

/**
 * When the administrators were last alerted, per queue: alerts are batched (at most one per
 * `ADMIN_ALERT_INTERVAL_MINUTES` and queue), so a burst of submissions sends one email.
 */
export const adminAlerts = directory.table(
	"admin_alerts",
	{
		kind: text().primaryKey(),
		/** When the last alert of this queue was sent: the interval counts from it. */
		lastSentAt: timestamp({ withTimezone: true }).notNull(),
		/** The latest submission that alert covered: the next one counts what came after. */
		lastItemAt: timestamp({ withTimezone: true }),
	},
	(table) => [
		check("admin_alerts_kind_check", sql`${table.kind} in ('claims', 'contact_requests')`),
	],
);
