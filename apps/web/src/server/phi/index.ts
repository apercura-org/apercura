import "server-only";
/**
 * The only module that touches patient data in clear (protected health information).
 *
 * - Encrypts patient fields with the organization's data key (DEK), AAD `table.column.rowId`.
 * - Decrypts them only through functions that insert an `audit_events` row (actor, purpose,
 *   ids, request id) in the same transaction, before the data is returned.
 * - Computes the per-organization blind indexes, OTP hashes and token hashes.
 *
 * Importing `@apercura/core/crypto` anywhere else fails `bun run check` (Biome
 * `noRestrictedImports`, see biome.json).
 */
import { randomUUID } from "node:crypto";
import {
	blindIndex,
	type DataKey,
	DecryptionError,
	decryptField,
	encryptField,
	fieldAad,
	generateDek,
	generateManageToken,
	generateOtp,
	generateOtpSalt,
	hashOtp,
	hashToken,
	needsRewrap,
	normalizeEmail,
	normalizePhone,
	unwrapDek,
	verifyOtp,
	wrapDek,
} from "@apercura/core/crypto";
import type { Database } from "@apercura/db";
import { appointments, auditEvents, organizationKeys, otpChallenges } from "@apercura/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Executor } from "~/server/db-executor";
import { dataKeyCache, keyring, manageTokenMac, organizationIndexKey } from "./keys";

export { phiConfigured } from "./keys";

/** Who reads patient data, and why. Every decryption writes one `audit_events` row. */
export interface AuditContext {
	organizationId: string;
	/** `user:<id>`, `patient` or `system:<job>`. */
	actor: string;
	userId?: string | null;
	/** `agenda_list`, `notify`, `manage`… */
	purpose: string;
	requestId?: string | null;
	/** Keyed hash of the client IP (never the IP). */
	ipHash?: string | null;
}

// ---------------------------------------------------------------------------
// Data keys
// ---------------------------------------------------------------------------

const dekAad = (organizationId: string) => `organization_keys.dek.${organizationId}`;

async function loadDataKeys(db: Executor, organizationId: string): Promise<DataKey[]> {
	const rows = await db
		.select({ version: organizationKeys.version, wrappedDek: organizationKeys.wrappedDek })
		.from(organizationKeys)
		.where(eq(organizationKeys.organizationId, organizationId))
		.orderBy(desc(organizationKeys.version));
	const ring = keyring();
	return rows.map((row) => ({
		version: String(row.version),
		key: unwrapDek(row.wrappedDek, ring, dekAad(organizationId)),
	}));
}

async function dataKeys(db: Executor, organizationId: string): Promise<DataKey[]> {
	keyring();
	const cached = dataKeyCache.get(organizationId);
	if (cached && cached.length > 0) {
		return cached;
	}
	const keys = await loadDataKeys(db, organizationId);
	if (keys.length > 0) {
		dataKeyCache.set(organizationId, keys);
	}
	return keys;
}

/**
 * Creates the organization's data key (random 32 bytes, wrapped by the active master key with
 * AAD `organization_keys.dek.<orgId>`) unless it exists. Takes the pool, never a transaction:
 * the key must be committed before anything is encrypted with it, or a rolled-back transaction
 * would leave ciphertext under a key that no longer exists. Concurrent first uses agree on one
 * key (the insert does nothing when version 1 is already there).
 */
export async function ensureOrganizationKey(db: Database, organizationId: string): Promise<void> {
	if ((await dataKeys(db, organizationId)).length > 0) {
		return;
	}
	await db
		.insert(organizationKeys)
		.values({
			organizationId,
			version: 1,
			wrappedDek: wrapDek(generateDek(), keyring(), dekAad(organizationId)),
		})
		.onConflictDoNothing();
	dataKeyCache.delete(organizationId);
	if ((await dataKeys(db, organizationId)).length === 0) {
		throw new Error("Organization data key could not be created");
	}
}

/**
 * Deletes every data key of the organization and forgets them in this process: a closed
 * practice (`booking/closure.ts`), once nothing encrypted with them is left.
 */
export async function deleteOrganizationKeys(
	db: Executor,
	organizationId: string,
): Promise<number> {
	const deleted = await db
		.delete(organizationKeys)
		.where(eq(organizationKeys.organizationId, organizationId))
		.returning({ version: organizationKeys.version });
	dataKeyCache.delete(organizationId);
	return deleted.length;
}

/** The organization's current data key; {@link ensureOrganizationKey} must have run first. */
export async function activeDataKey(db: Executor, organizationId: string): Promise<DataKey> {
	const [current] = await dataKeys(db, organizationId);
	if (!current) {
		throw new Error("Organization data key is missing: call ensureOrganizationKey first");
	}
	return current;
}

/**
 * Master key rotation (docs/self-hosting.md): re-wraps every organization data key still wrapped
 * by an older master key with the active one. The data encrypted with the data keys does not
 * change, so this is fast. Each row is updated only if nobody re-wrapped it meanwhile. Returns
 * how many keys were re-wrapped and how many are still wrapped by another key (0 once done).
 */
export async function rewrapDataKeys(
	db: Database,
): Promise<{ rewrapped: number; remaining: number }> {
	const ring = keyring();
	const rows = await db
		.select({
			organizationId: organizationKeys.organizationId,
			version: organizationKeys.version,
			wrappedDek: organizationKeys.wrappedDek,
		})
		.from(organizationKeys);
	let rewrapped = 0;
	for (const row of rows) {
		if (!needsRewrap(row.wrappedDek, ring)) continue;
		const aad = dekAad(row.organizationId);
		const updated = await db
			.update(organizationKeys)
			.set({ wrappedDek: wrapDek(unwrapDek(row.wrappedDek, ring, aad), ring, aad) })
			.where(
				and(
					eq(organizationKeys.organizationId, row.organizationId),
					eq(organizationKeys.version, row.version),
					eq(organizationKeys.wrappedDek, row.wrappedDek),
				),
			)
			.returning({ version: organizationKeys.version });
		rewrapped += updated.length;
	}
	dataKeyCache.clear();
	const left = await db.select({ wrappedDek: organizationKeys.wrappedDek }).from(organizationKeys);
	return { rewrapped, remaining: left.filter((row) => needsRewrap(row.wrappedDek, ring)).length };
}

// ---------------------------------------------------------------------------
// Appointment fields
// ---------------------------------------------------------------------------

/** Patient fields of an appointment and their encrypted columns. */
export const PATIENT_COLUMNS = {
	firstName: "patient_first_name_enc",
	lastName: "patient_last_name_enc",
	email: "patient_email_enc",
	phone: "patient_phone_enc",
	practiceMessage: "practice_message_enc",
} as const;

export type PatientField = keyof typeof PATIENT_COLUMNS;
export type PatientValues = Partial<Record<PatientField, string | null>>;

/** Encrypted columns, keyed like the Drizzle `appointments` columns. */
export interface SealedPatient {
	patientFirstNameEnc?: string | null;
	patientLastNameEnc?: string | null;
	patientEmailEnc?: string | null;
	patientPhoneEnc?: string | null;
	practiceMessageEnc?: string | null;
}

const SEALED_KEYS: Record<PatientField, keyof SealedPatient> = {
	firstName: "patientFirstNameEnc",
	lastName: "patientLastNameEnc",
	email: "patientEmailEnc",
	phone: "patientPhoneEnc",
	practiceMessage: "practiceMessageEnc",
};

/** Encrypts the given patient fields of appointment `appointmentId` (AAD `appointments.<column>.<id>`). */
export async function sealAppointment(
	db: Executor,
	organizationId: string,
	appointmentId: string,
	values: PatientValues,
): Promise<SealedPatient> {
	const dek = await activeDataKey(db, organizationId);
	const sealed: SealedPatient = {};
	for (const [field, value] of Object.entries(values) as [PatientField, string | null][]) {
		sealed[SEALED_KEYS[field]] =
			value === null || value === undefined
				? null
				: encryptField(value, dek, fieldAad("appointments", PATIENT_COLUMNS[field], appointmentId));
	}
	return sealed;
}

export type DecryptedPatient = Record<PatientField, string | null>;

const ALL_FIELDS = Object.keys(PATIENT_COLUMNS) as PatientField[];

/**
 * Decrypts patient fields of appointments of one organization. Inserts the audit row first, in
 * the same transaction; rows of other organizations are never read.
 */
export async function readAppointmentPatients(
	db: Executor,
	audit: AuditContext,
	appointmentIds: readonly string[],
	fields: readonly PatientField[] = ALL_FIELDS,
): Promise<Map<string, DecryptedPatient>> {
	const result = new Map<string, DecryptedPatient>();
	if (appointmentIds.length === 0) {
		return result;
	}
	return db.transaction(async (tx) => {
		await writeAudit(tx, audit, {
			action: "decrypt",
			subjectTable: "appointments",
			subjectIds: [...appointmentIds],
			fields: fields.map((field) => PATIENT_COLUMNS[field]),
		});
		await flagDecryptionVolume(tx, audit);
		const rows = await tx
			.select({
				id: appointments.id,
				patientFirstNameEnc: appointments.patientFirstNameEnc,
				patientLastNameEnc: appointments.patientLastNameEnc,
				patientEmailEnc: appointments.patientEmailEnc,
				patientPhoneEnc: appointments.patientPhoneEnc,
				practiceMessageEnc: appointments.practiceMessageEnc,
			})
			.from(appointments)
			.where(
				and(
					inArray(appointments.id, [...appointmentIds]),
					eq(appointments.organizationId, audit.organizationId),
				),
			);
		const keys = rows.length > 0 ? await dataKeys(tx, audit.organizationId) : [];
		for (const row of rows) {
			const patient = Object.fromEntries(
				ALL_FIELDS.map((field) => [field, null]),
			) as DecryptedPatient;
			for (const field of fields) {
				const token = row[SEALED_KEYS[field]];
				patient[field] = token
					? decryptField(token, keys, fieldAad("appointments", PATIENT_COLUMNS[field], row.id))
					: null;
			}
			result.set(row.id, patient);
		}
		return result;
	});
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export interface AuditSubject {
	action: string;
	subjectTable: string;
	subjectIds: string[];
	fields?: string[];
}

/**
 * More distinct patient records than this, decrypted by one person within an hour, raise an
 * alert (plan §10): a stolen session or an export by hand looks like that.
 */
export const DECRYPTION_ALERT_PER_HOUR = 500;

/**
 * After a person's decryption, records an `alert` audit row (once an hour at most) when they
 * have read more than {@link DECRYPTION_ALERT_PER_HOUR} distinct appointments in the last hour.
 * The owner sees it at the top of the access log; operators see the log line.
 */
async function flagDecryptionVolume(tx: Executor, audit: AuditContext) {
	if (!audit.userId) {
		return;
	}
	const [row] = await tx.execute<{ records: number; alerted: boolean }>(sql`
		select
			(select count(distinct subject.id)::int
				from care.audit_events e, unnest(e.subject_ids) as subject(id)
				where e.user_id = ${audit.userId} and e.organization_id = ${audit.organizationId}
					and e.action = 'decrypt' and e.subject_table = 'appointments'
					and e.created_at > now() - interval '1 hour') as records,
			exists (select 1 from care.audit_events
				where user_id = ${audit.userId} and organization_id = ${audit.organizationId}
					and action = 'alert' and created_at > now() - interval '1 hour') as alerted
	`);
	if (!row || row.alerted || row.records <= DECRYPTION_ALERT_PER_HOUR) {
		return;
	}
	await writeAudit(
		tx,
		{ ...audit, purpose: "decrypt_volume" },
		{ action: "alert", subjectTable: "audit_events", subjectIds: [], fields: [] },
	);
	console.warn(
		`[phi] decryption volume alert: user ${audit.userId} read ${row.records} patient records of organization ${audit.organizationId} within an hour`,
	);
}

/** Appends one row to `care.audit_events` (append-only for the app role). */
export async function writeAudit(db: Executor, audit: AuditContext, subject: AuditSubject) {
	await db.insert(auditEvents).values({
		organizationId: audit.organizationId,
		actor: audit.actor,
		userId: audit.userId ?? null,
		purpose: audit.purpose,
		requestId: audit.requestId ?? null,
		ipHash: audit.ipHash ?? null,
		action: subject.action,
		subjectTable: subject.subjectTable,
		subjectIds: subject.subjectIds,
		fields: subject.fields ?? [],
	});
}

// ---------------------------------------------------------------------------
// Blind indexes and normalization
// ---------------------------------------------------------------------------

/** Normalized email (NFC, trimmed, lowercase), or null when it is not an address. */
export function normalizePatientEmail(value: string): string | null {
	try {
		return normalizeEmail(value);
	} catch {
		return null;
	}
}

/** E.164 phone number (French numbering plan aware), or null when it is not a number. */
export function normalizePatientPhone(value: string): string | null {
	try {
		return normalizePhone(value);
	} catch {
		return null;
	}
}

/** Per-organization blind indexes of a patient's email and phone. */
export function patientIndexes(
	organizationId: string,
	values: { email?: string | null; phone?: string | null },
): { emailBidx: string | null; phoneBidx: string | null } {
	const key = organizationIndexKey(organizationId);
	return {
		emailBidx: values.email ? blindIndex(values.email, key, "email") : null,
		phoneBidx: values.phone ? blindIndex(values.phone, key, "phone") : null,
	};
}

// ---------------------------------------------------------------------------
// Tokens and one-time codes
// ---------------------------------------------------------------------------

/** A random 256-bit token (base64url): hold tokens, browser keys, feed tokens. */
export function newOpaqueToken(): string {
	return generateManageToken();
}

/** SHA-256 hex: the only form of a token stored in the database. */
export function hashOpaqueToken(token: string): string {
	return hashToken(token);
}

/** A random nonce for {@link manageTokenFor} (stored in `appointments.manage_token_hash` as a hash). */
export function newManageNonce(): string {
	return generateManageToken();
}

/**
 * The patient's 256-bit manage token of an appointment, derived from a server key and a random
 * nonce. The database keeps only the SHA-256 of the token, so a leaked database alone gives no
 * working link; emails (confirmation, reminder…) re-derive it when they are sent.
 */
export function manageTokenFor(appointmentId: string, nonce: string): string {
	return manageTokenMac(`manage:v1:${appointmentId}:${nonce}`);
}

export interface NewOtp {
	code: string;
	salt: string;
	hash: string;
}

/** A fresh 6-digit code with its salt and HMAC. */
export function newOtp(): NewOtp {
	const code = generateOtp();
	const salt = generateOtpSalt();
	return { code, salt, hash: hashOtp(code, salt) };
}

export function otpMatches(code: string, salt: string, hash: string): boolean {
	return verifyOtp(code, salt, hash);
}

/** Encrypts a code for the outbox (AAD `otp_challenges.code_enc.<id>`). */
export async function sealOtpCode(
	db: Executor,
	organizationId: string,
	challengeId: string,
	code: string,
): Promise<string> {
	const dek = await activeDataKey(db, organizationId);
	return encryptField(code, dek, fieldAad("otp_challenges", "code_enc", challengeId));
}

/** Decrypts a pending code to email it, with its audit row. Null once erased. */
export async function revealOtpCode(
	db: Executor,
	audit: AuditContext,
	challengeId: string,
): Promise<string | null> {
	return db.transaction(async (tx) => {
		await writeAudit(tx, audit, {
			action: "decrypt",
			subjectTable: "otp_challenges",
			subjectIds: [challengeId],
			fields: ["code_enc"],
		});
		const [row] = await tx
			.select({ codeEnc: otpChallenges.codeEnc })
			.from(otpChallenges)
			.where(
				and(
					eq(otpChallenges.id, challengeId),
					eq(otpChallenges.organizationId, audit.organizationId),
				),
			)
			.limit(1);
		if (!row?.codeEnc) {
			return null;
		}
		const keys = await dataKeys(tx, audit.organizationId);
		return decryptField(row.codeEnc, keys, fieldAad("otp_challenges", "code_enc", challengeId));
	});
}

/** A request id for audit rows when the caller has none. */
export function newRequestId(): string {
	return randomUUID();
}

export { DecryptionError };
