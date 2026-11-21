import "server-only";
import { randomUUID } from "node:crypto";
import {
	assessClaim,
	availableMethods,
	bookingOpensAt,
	type CheckStatus,
	type CheckSummary,
	type ClaimSubject,
	canApprove,
	canSubmitForReview,
	formatPhoneFr,
	isValidRpps,
	type MethodOptions,
	pscMatchesRpps,
	registryEmails,
	registryPhones,
	type VerificationMethodId,
} from "@apercura/core";
import {
	generateManageToken,
	generateOtp,
	generateOtpSalt,
	hashOtp,
	hashToken,
	verifyOtp,
} from "@apercura/core/crypto";
import type { Database } from "@apercura/db";
import {
	account,
	claimChecks,
	claimDocuments,
	claims,
	member,
	organization,
	practitionerProfiles,
	practitioners,
	session,
	user,
} from "@apercura/db/schema";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { recordAudit } from "../audit";
import { openBytes, sealBytes } from "../crypto/platform";
import type { StorageDriver } from "../storage";

export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Db = Database | Tx;

/** Business errors the routers translate into tRPC codes and UI messages. */
export class ClaimError extends Error {
	constructor(
		readonly code:
			| "INVALID_RPPS"
			| "NOT_FOUND"
			| "ALREADY_OWNER"
			| "FROZEN"
			| "NOT_OPEN"
			| "METHOD_UNAVAILABLE"
			| "TOO_MANY_ATTEMPTS"
			| "INVALID_CODE"
			| "EXPIRED"
			| "NOT_SUBMITTABLE"
			| "NOT_APPROVABLE"
			| "BAD_DOCUMENT"
			| "PSC_MISMATCH"
			| "PSC_MISSING",
	) {
		super(code);
		this.name = "ClaimError";
	}
}

export const DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENTS = 4;
const EMAIL_LINK_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_EMAIL_SENDS = 3;
const MAX_CODE_ATTEMPTS = 5;
/** Claim documents are deleted this long after the decision. */
export const DOCUMENT_RETENTION_DAYS = 30;

/** Magic bytes of the accepted document types (the declared type is never trusted alone). */
export function sniffDocumentType(bytes: Uint8Array): (typeof DOCUMENT_TYPES)[number] | null {
	const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
	if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf";
	if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
	if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
	if (starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP") {
		return "image/webp";
	}
	return null;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export type PractitionerSummary = {
	id: number;
	nationalId: string;
	slug: string;
	titleCode: string | null;
	civilityCode: string | null;
	firstName: string;
	lastName: string;
	listingSlug: string | null;
	professionCode: string;
	status: string;
	claimStatus: string;
	ownerOrgId: string | null;
	billingSector: string | null;
	optam: string | null;
	carteVitale: boolean | null;
};

const practitionerColumns = {
	id: practitioners.id,
	nationalId: practitioners.nationalId,
	slug: practitioners.slug,
	titleCode: practitioners.titleCode,
	civilityCode: practitioners.civilityCode,
	firstName: practitioners.firstName,
	lastName: practitioners.lastName,
	listingSlug: practitioners.listingSlug,
	professionCode: practitioners.professionCode,
	status: practitioners.status,
	claimStatus: practitioners.claimStatus,
	ownerOrgId: practitioners.ownerOrgId,
	billingSector: practitioners.billingSector,
	optam: practitioners.optam,
	carteVitale: practitioners.carteVitale,
};

export async function findPractitionerByRpps(db: Db, rpps: string) {
	if (!isValidRpps(rpps)) return null;
	const [row] = await db
		.select(practitionerColumns)
		.from(practitioners)
		.where(
			and(
				eq(practitioners.country, "FR"),
				eq(practitioners.idScheme, "RPPS"),
				eq(practitioners.nationalId, rpps),
			),
		)
		.limit(1);
	return row ?? null;
}

export type SubjectSite = ClaimSubject["activities"][number] & {
	siteId: number;
	siteName: string | null;
	place: string | null;
};

/** Registry contacts of a practitioner's current activities (for the methods). */
export async function claimSubject(db: Db, practitioner: { id: number; nationalId: string }) {
	const rows = [
		...(await db.execute<SubjectSite>(sql`
			SELECT a.practice_kind AS "practiceKind", s.email, s.phone, s.phone_kind AS "phoneKind",
				s.id AS "siteId", coalesce(s.name, s.finess_name) AS "siteName",
				concat_ws(' ', s.postcode, pl.name) AS place
			FROM directory.activities a
			JOIN directory.sites s ON s.id = a.site_id AND s.removed_at IS NULL
			LEFT JOIN directory.places pl ON pl.id = s.place_id
			WHERE a.practitioner_id = ${practitioner.id} AND a.removed_at IS NULL AND a.source = 'ans'
			ORDER BY a.is_primary DESC, a.id
		`)),
	];
	const subject: ClaimSubject = { rpps: practitioner.nationalId, activities: rows };
	return { subject, sites: rows };
}

/** `c***@msp-exemple.test`: enough to recognise a mailbox, not to harvest it. */
export function maskEmail(email: string): string {
	const [local = "", domain = ""] = email.split("@");
	return `${local.slice(0, 1)}***@${domain}`;
}

/** `01 99 •• •• 02`: the claimant sees which number will ring, not the whole of it. */
export function maskPhone(e164: string): string {
	const groups = formatPhoneFr(e164).split(" ");
	if (groups.length < 4) return groups.join(" ");
	return groups
		.map((group, index) => (index > 1 && index < groups.length - 1 ? "••" : group))
		.join(" ");
}

async function checksOf(db: Db, claimId: string) {
	return db
		.select({
			method: claimChecks.method,
			status: claimChecks.status,
			attempts: claimChecks.attempts,
			expiresAt: claimChecks.expiresAt,
			passedAt: claimChecks.passedAt,
			detail: claimChecks.detail,
			updatedAt: claimChecks.updatedAt,
		})
		.from(claimChecks)
		.where(eq(claimChecks.claimId, claimId));
}

export function summarize(rows: { method: string; status: string }[]): CheckSummary {
	const summary: CheckSummary = {};
	for (const row of rows) summary[row.method as VerificationMethodId] = row.status as CheckStatus;
	return summary;
}

async function loadClaim(db: Db, claimId: string) {
	const [row] = await db.select().from(claims).where(eq(claims.id, claimId)).limit(1);
	return row ?? null;
}

/** The caller's own claim, or NOT_FOUND (same answer for someone else's). */
async function ownClaim(db: Db, claimId: string, userId: string) {
	const claim = await loadClaim(db, claimId);
	if (!claim || claim.userId !== userId) throw new ClaimError("NOT_FOUND");
	return claim;
}

/** The incumbent verified claim of a practitioner, if any. */
async function verifiedClaimOf(db: Db, practitionerId: number) {
	const [row] = await db
		.select({ id: claims.id, userId: claims.userId })
		.from(claims)
		.where(and(eq(claims.practitionerId, practitionerId), eq(claims.status, "verified")))
		.limit(1);
	if (!row) return null;
	const checks = await checksOf(db, row.id);
	return { ...row, viaPsc: summarize(checks).psc === "passed" };
}

/** Everything the claimant's page shows. */
export async function claimForClaimant(
	db: Database,
	claimId: string,
	userId: string,
	options: MethodOptions,
) {
	const claim = await ownClaim(db, claimId, userId);
	const [practitioner] = await db
		.select(practitionerColumns)
		.from(practitioners)
		.where(eq(practitioners.id, claim.practitionerId));
	if (!practitioner) throw new ClaimError("NOT_FOUND");
	const { subject } = await claimSubject(db, practitioner);
	const checks = await checksOf(db, claim.id);
	const documents = await db
		.select({
			id: claimDocuments.id,
			kind: claimDocuments.kind,
			contentType: claimDocuments.contentType,
			byteSize: claimDocuments.byteSize,
			createdAt: claimDocuments.createdAt,
		})
		.from(claimDocuments)
		.where(and(eq(claimDocuments.claimId, claim.id), isNull(claimDocuments.purgedAt)))
		.orderBy(claimDocuments.createdAt);
	const summary = summarize(checks);
	return {
		claim: {
			id: claim.id,
			status: claim.status,
			contest: claim.contest,
			submittedAt: claim.submittedAt,
			verifiedAt: claim.verifiedAt,
			bookingOpensAt: claim.bookingOpensAt,
			decisionReason: claim.decisionReason,
		},
		practitioner,
		methods: availableMethods(subject, options).map((method) => method.id),
		registryEmails: registryEmails(subject).map(maskEmail),
		registryPhones: registryPhones(subject).map(maskPhone),
		checks: summary,
		documents,
		canSubmit: claim.status === "open" && canSubmitForReview(summary, claim.contest),
	};
}

/** The caller's claims, newest first. */
export async function claimsOfUser(db: Database, userId: string) {
	return db
		.select({
			id: claims.id,
			status: claims.status,
			contest: claims.contest,
			createdAt: claims.createdAt,
			verifiedAt: claims.verifiedAt,
			practitionerId: practitioners.id,
			slug: practitioners.slug,
			titleCode: practitioners.titleCode,
			firstName: practitioners.firstName,
			lastName: practitioners.lastName,
			nationalId: practitioners.nationalId,
			ownerOrgId: practitioners.ownerOrgId,
		})
		.from(claims)
		.innerJoin(practitioners, eq(practitioners.id, claims.practitionerId))
		.where(eq(claims.userId, userId))
		.orderBy(desc(claims.createdAt));
}

// ---------------------------------------------------------------------------
// Claimant actions
// ---------------------------------------------------------------------------

async function assertNotFrozen(db: Db, userId: string) {
	const [row] = await db.select({ frozenAt: user.frozenAt }).from(user).where(eq(user.id, userId));
	if (row?.frozenAt) throw new ClaimError("FROZEN");
}

/**
 * Opens (or returns) the caller's claim on an RPPS. A page that already has a
 * verified owner opens a contest, which an administrator decides; this is
 * also how a practitioner who lost access to their account recovers it.
 */
export async function startClaim(db: Database, userId: string, rpps: string) {
	if (!isValidRpps(rpps)) throw new ClaimError("INVALID_RPPS");
	await assertNotFrozen(db, userId);
	return db.transaction(async (tx) => {
		const practitioner = await findPractitionerByRpps(tx, rpps);
		if (practitioner?.status !== "active") throw new ClaimError("NOT_FOUND");
		const incumbent = await verifiedClaimOf(tx, practitioner.id);
		if (incumbent?.userId === userId) throw new ClaimError("ALREADY_OWNER");
		const [live] = await tx
			.select({ id: claims.id })
			.from(claims)
			.where(
				and(
					eq(claims.practitionerId, practitioner.id),
					eq(claims.userId, userId),
					inArray(claims.status, ["open", "in_review"]),
				),
			)
			.limit(1);
		if (live) return { id: live.id, created: false };
		const id = randomUUID();
		await tx.insert(claims).values({
			id,
			practitionerId: practitioner.id,
			userId,
			contest: incumbent !== null,
		});
		return { id, created: true };
	});
}

async function upsertCheck(
	db: Db,
	claimId: string,
	method: VerificationMethodId,
	values: Partial<typeof claimChecks.$inferInsert>,
) {
	await db
		.insert(claimChecks)
		.values({ claimId, method, ...values })
		.onConflictDoUpdate({
			target: [claimChecks.claimId, claimChecks.method],
			set: { ...values, updatedAt: new Date() },
		});
}

function assertOpen(claim: { status: string }) {
	if (claim.status !== "open" && claim.status !== "in_review") throw new ClaimError("NOT_OPEN");
}

async function subjectOf(db: Db, practitionerId: number) {
	const [practitioner] = await db
		.select(practitionerColumns)
		.from(practitioners)
		.where(eq(practitioners.id, practitionerId));
	if (!practitioner) throw new ClaimError("NOT_FOUND");
	return { practitioner, ...(await claimSubject(db, practitioner)) };
}

/**
 * Prepares the registry email link: a random token whose hash is stored with
 * a 24 h expiry. Returns the token and the registry addresses to send it to;
 * the caller sends the email.
 */
export async function prepareRegistryEmail(
	db: Database,
	claimId: string,
	userId: string,
): Promise<{ token: string; to: string[]; practitioner: PractitionerSummary }> {
	const claim = await ownClaim(db, claimId, userId);
	assertOpen(claim);
	const { practitioner, subject } = await subjectOf(db, claim.practitionerId);
	const to = registryEmails(subject);
	if (to.length === 0) throw new ClaimError("METHOD_UNAVAILABLE");
	const [existing] = await db
		.select({ attempts: claimChecks.attempts, status: claimChecks.status })
		.from(claimChecks)
		.where(and(eq(claimChecks.claimId, claimId), eq(claimChecks.method, "registry_email")));
	if (existing?.status === "passed") throw new ClaimError("NOT_OPEN");
	if ((existing?.attempts ?? 0) >= MAX_EMAIL_SENDS) throw new ClaimError("TOO_MANY_ATTEMPTS");
	const token = generateManageToken();
	await upsertCheck(db, claimId, "registry_email", {
		status: "pending",
		secretHash: hashToken(token),
		expiresAt: new Date(Date.now() + EMAIL_LINK_TTL_MS),
		attempts: (existing?.attempts ?? 0) + 1,
		detail: { sentTo: to.map(maskEmail) },
	});
	return { token, to, practitioner };
}

/**
 * Follows a registry email link. The token alone proves control of the
 * practice's mailbox, so no session is needed (it may be opened on the
 * practice's computer). Returns the claim id, or throws EXPIRED.
 */
export async function confirmRegistryEmail(db: Database, token: string) {
	if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ClaimError("EXPIRED");
	const [check] = await db
		.select({
			claimId: claimChecks.claimId,
			expiresAt: claimChecks.expiresAt,
			status: claimChecks.status,
		})
		.from(claimChecks)
		.where(
			and(eq(claimChecks.method, "registry_email"), eq(claimChecks.secretHash, hashToken(token))),
		)
		.limit(1);
	if (!check) throw new ClaimError("EXPIRED");
	if (check.status === "passed") return { claimId: check.claimId, alreadyDone: true };
	if (!check.expiresAt || check.expiresAt.getTime() < Date.now()) throw new ClaimError("EXPIRED");
	const claim = await loadClaim(db, check.claimId);
	if (!claim) throw new ClaimError("EXPIRED");
	assertOpen(claim);
	await upsertCheck(db, check.claimId, "registry_email", {
		status: "passed",
		passedAt: new Date(),
		secretHash: null,
		expiresAt: null,
	});
	return { claimId: check.claimId, alreadyDone: false };
}

/**
 * Records the Pro Santé Connect result after the account was linked: the
 * linked identity (`8` + RPPS, stored as the account id, never `sub`) must
 * designate the claimed practitioner.
 */
export async function recordPscResult(db: Database, claimId: string, userId: string) {
	const claim = await ownClaim(db, claimId, userId);
	assertOpen(claim);
	const [practitioner] = await db
		.select({ nationalId: practitioners.nationalId })
		.from(practitioners)
		.where(eq(practitioners.id, claim.practitionerId));
	const [linked] = await db
		.select({ accountId: account.accountId })
		.from(account)
		.where(and(eq(account.userId, userId), eq(account.providerId, "psc")))
		.limit(1);
	if (!linked || !practitioner) throw new ClaimError("PSC_MISSING");
	const matches = pscMatchesRpps(linked.accountId, practitioner.nationalId);
	await upsertCheck(db, claimId, "psc", {
		status: matches ? "passed" : "failed",
		passedAt: matches ? new Date() : null,
		detail: { identifier: linked.accountId },
	});
	if (!matches) throw new ClaimError("PSC_MISMATCH");
}

/** Stores an uploaded proof, encrypted with the platform key, and marks the document check pending. */
export async function addClaimDocument(
	db: Database,
	storage: StorageDriver,
	input: {
		claimId: string;
		userId: string;
		kind: "cps_card" | "ordre_attestation";
		bytes: Uint8Array;
	},
) {
	const claim = await ownClaim(db, input.claimId, input.userId);
	if (claim.status !== "open") throw new ClaimError("NOT_OPEN");
	if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_DOCUMENT_BYTES) {
		throw new ClaimError("BAD_DOCUMENT");
	}
	const contentType = sniffDocumentType(input.bytes);
	if (!contentType) throw new ClaimError("BAD_DOCUMENT");
	const [count] = await db
		.select({ n: sql<number>`count(*)::integer` })
		.from(claimDocuments)
		.where(and(eq(claimDocuments.claimId, claim.id), isNull(claimDocuments.purgedAt)));
	if ((count?.n ?? 0) >= MAX_DOCUMENTS) throw new ClaimError("TOO_MANY_ATTEMPTS");
	const id = randomUUID();
	const storageKey = `claims/${randomUUID()}`;
	const sealed = sealBytes(input.bytes, "claim_documents", "object", id);
	await storage.put(storageKey, sealed, "application/octet-stream");
	await db.insert(claimDocuments).values({
		id,
		claimId: claim.id,
		kind: input.kind,
		storageKey,
		contentType,
		byteSize: input.bytes.byteLength,
	});
	await upsertCheck(db, claim.id, "document", { status: "pending" });
	return { id, contentType };
}

/**
 * Issues the code the claimant keeps on screen for the registry phone
 * callback. Only its hash is stored; asking again replaces it.
 */
export async function issuePhoneCode(db: Database, claimId: string, userId: string) {
	const claim = await ownClaim(db, claimId, userId);
	assertOpen(claim);
	const { subject } = await subjectOf(db, claim.practitionerId);
	if (registryPhones(subject).length === 0) throw new ClaimError("METHOD_UNAVAILABLE");
	const [existing] = await db
		.select({ status: claimChecks.status })
		.from(claimChecks)
		.where(and(eq(claimChecks.claimId, claimId), eq(claimChecks.method, "phone_callback")));
	if (existing?.status === "passed") throw new ClaimError("NOT_OPEN");
	const code = generateOtp();
	const salt = generateOtpSalt();
	await upsertCheck(db, claimId, "phone_callback", {
		status: "pending",
		secretHash: `${salt}:${hashOtp(code, salt)}`,
		attempts: 0,
		expiresAt: null,
	});
	return { code };
}

/** Sends the claim to the administrators' queue. */
export async function submitClaim(db: Database, claimId: string, userId: string) {
	return db.transaction(async (tx) => {
		const claim = await ownClaim(tx, claimId, userId);
		if (claim.status !== "open") throw new ClaimError("NOT_OPEN");
		const summary = summarize(await checksOf(tx, claimId));
		if (!canSubmitForReview(summary, claim.contest)) throw new ClaimError("NOT_SUBMITTABLE");
		await tx
			.update(claims)
			.set({ status: "in_review", submittedAt: new Date() })
			.where(eq(claims.id, claimId));
		await tx
			.update(practitioners)
			.set({ claimStatus: "pending" })
			.where(
				and(eq(practitioners.id, claim.practitionerId), eq(practitioners.claimStatus, "unclaimed")),
			);
	});
}

export async function withdrawClaim(db: Database, claimId: string, userId: string) {
	return db.transaction(async (tx) => {
		const claim = await ownClaim(tx, claimId, userId);
		assertOpen(claim);
		const decidedAt = new Date();
		await tx.update(claims).set({ status: "withdrawn", decidedAt }).where(eq(claims.id, claimId));
		await scheduleDocumentPurge(tx, claimId, decidedAt);
		await releasePending(tx, claim.practitionerId);
	});
}

/** Back to `unclaimed` when the last claim under review is gone. */
async function releasePending(tx: Tx, practitionerId: number) {
	await tx.execute(sql`
		UPDATE directory.practitioners p SET claim_status = 'unclaimed'
		WHERE p.id = ${practitionerId} AND p.claim_status = 'pending'
			AND NOT EXISTS (
				SELECT 1 FROM directory.claims c
				WHERE c.practitioner_id = p.id AND c.status = 'in_review'
			)
	`);
}

async function scheduleDocumentPurge(tx: Tx, claimId: string, decidedAt: Date) {
	await tx
		.update(claimDocuments)
		.set({ purgeAfter: new Date(decidedAt.getTime() + DOCUMENT_RETENTION_DAYS * 86_400_000) })
		.where(and(eq(claimDocuments.claimId, claimId), isNull(claimDocuments.purgedAt)));
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export type ApprovalResult = {
	claimId: string;
	practitionerId: number;
	organizationId: string;
	claimantUserId: string;
	/** The account that lost a contest, now frozen. */
	supersededUserId: string | null;
	via: "psc" | "registry_email" | "review";
};

/**
 * Makes a claim the verified one, in one transaction: supersedes and freezes
 * a previous owner (contest), creates the practitioner's organization (or
 * takes over the existing one, so bookings stay attached to the page) with the
 * claimant as owner, sets `claim_status` and `owner_org_id`, schedules the
 * document purge and prepares an unpublished profile prefilled from Ameli.
 */
async function approveInTx(
	tx: Tx,
	claimId: string,
	decidedBy: string | null,
	reason: string | null,
): Promise<ApprovalResult> {
	const claim = await loadClaim(tx, claimId);
	if (!claim) throw new ClaimError("NOT_FOUND");
	assertOpen(claim);
	// Nobody reviews their own claim.
	if (decidedBy !== null && decidedBy === claim.userId) throw new ClaimError("NOT_APPROVABLE");
	// Serializes decisions on one page.
	const [practitioner] = await tx
		.select({
			id: practitioners.id,
			owner_org_id: practitioners.ownerOrgId,
			first_name: practitioners.firstName,
			last_name: practitioners.lastName,
			slug: practitioners.slug,
			billing_sector: practitioners.billingSector,
			optam: practitioners.optam,
			carte_vitale: practitioners.carteVitale,
		})
		.from(practitioners)
		.where(eq(practitioners.id, claim.practitionerId))
		.for("update");
	if (!practitioner) throw new ClaimError("NOT_FOUND");
	const summary = summarize(await checksOf(tx, claimId));
	const incumbent = await verifiedClaimOf(tx, practitioner.id);
	if (decidedBy === null) {
		// Automatic decision: never a contest.
		if (incumbent || assessClaim(summary, false).kind !== "verified") {
			throw new ClaimError("NOT_APPROVABLE");
		}
	} else if (!canApprove(summary, incumbent ? { incumbentViaPsc: incumbent.viaPsc } : null)) {
		throw new ClaimError("NOT_APPROVABLE");
	}
	const now = new Date();
	const viaPsc = summary.psc === "passed";

	let supersededUserId: string | null = null;
	if (incumbent) {
		supersededUserId = incumbent.userId;
		await tx
			.update(claims)
			.set({
				status: "superseded",
				decidedAt: now,
				decidedBy,
				decisionReason: "contest",
			})
			.where(eq(claims.id, incumbent.id));
		await freezeAccount(tx, incumbent.userId, now);
	}

	let organizationId = practitioner.owner_org_id;
	if (organizationId) {
		// Take over the practice: nobody from the previous owner's team keeps access.
		await tx.delete(member).where(eq(member.organizationId, organizationId));
	} else {
		organizationId = randomUUID();
		await tx.insert(organization).values({
			id: organizationId,
			name: `${practitioner.first_name} ${practitioner.last_name}`,
			slug: `${practitioner.slug}-${organizationId.slice(0, 8)}`,
			metadata: JSON.stringify({ practitionerId: practitioner.id }),
		});
	}
	await tx.insert(member).values({
		id: randomUUID(),
		organizationId,
		userId: claim.userId,
		role: "owner",
	});

	await tx
		.update(claims)
		.set({
			status: "verified",
			verifiedAt: now,
			bookingOpensAt: bookingOpensAt(now, viaPsc),
			decidedAt: now,
			decidedBy,
			decisionReason: reason,
		})
		.where(eq(claims.id, claimId));
	await scheduleDocumentPurge(tx, claimId, now);
	if (incumbent) await scheduleDocumentPurge(tx, incumbent.id, now);
	// Other people's live claims on this page are contests from now on.
	await tx
		.update(claims)
		.set({ contest: true })
		.where(
			and(
				eq(claims.practitionerId, practitioner.id),
				ne(claims.id, claimId),
				inArray(claims.status, ["open", "in_review"]),
			),
		);
	await tx
		.update(practitioners)
		.set({ claimStatus: "claimed", ownerOrgId: organizationId })
		.where(eq(practitioners.id, practitioner.id));
	await tx
		.insert(practitionerProfiles)
		.values({
			practitionerId: practitioner.id,
			billingSector: practitioner.billing_sector,
			optam: practitioner.optam,
			carteVitale: practitioner.carte_vitale,
		})
		.onConflictDoNothing();

	return {
		claimId,
		practitionerId: practitioner.id,
		organizationId,
		claimantUserId: claim.userId,
		supersededUserId,
		via: decidedBy === null ? (viaPsc ? "psc" : "registry_email") : "review",
	};
}

/** Freezes an account: no session, no membership, no new session (see the auth hooks). */
export async function freezeAccount(tx: Tx, userId: string, at = new Date()) {
	await tx.update(user).set({ frozenAt: at }).where(eq(user.id, userId));
	await tx.delete(session).where(eq(session.userId, userId));
	await tx.delete(member).where(eq(member.userId, userId));
}

/**
 * Verifies a claim automatically when its proofs allow it (Pro Santé Connect
 * or the registry email, outside a contest). In a contest the claim goes to
 * the administrators' queue instead. Returns the approval, if any.
 */
export async function evaluateClaim(db: Database, claimId: string): Promise<ApprovalResult | null> {
	return db.transaction(async (tx) => {
		const claim = await loadClaim(tx, claimId);
		if (!claim || (claim.status !== "open" && claim.status !== "in_review")) return null;
		const incumbent = await verifiedClaimOf(tx, claim.practitionerId);
		const summary = summarize(await checksOf(tx, claimId));
		const assessment = assessClaim(summary, incumbent !== null);
		if (assessment.kind === "verified") return approveInTx(tx, claimId, null, null);
		if (assessment.kind === "reviewable" && incumbent && claim.status === "open") {
			await tx
				.update(claims)
				.set({ status: "in_review", submittedAt: new Date(), contest: true })
				.where(eq(claims.id, claimId));
		}
		return null;
	});
}

export async function approveClaim(
	db: Database,
	claimId: string,
	adminId: string,
	reason: string | null,
	headers?: Headers,
) {
	return db.transaction(async (tx) => {
		// The deciding administrator has reviewed the uploaded documents.
		await tx
			.update(claimChecks)
			.set({ status: "passed", passedAt: new Date() })
			.where(
				and(
					eq(claimChecks.claimId, claimId),
					eq(claimChecks.method, "document"),
					eq(claimChecks.status, "pending"),
				),
			);
		const result = await approveInTx(tx, claimId, adminId, reason);
		await recordAudit(tx, {
			actor: adminId,
			action: "claim.approve",
			subjectType: "claim",
			subjectId: claimId,
			headers,
		});
		return result;
	});
}

export async function rejectClaim(
	db: Database,
	claimId: string,
	adminId: string,
	reason: string,
	headers?: Headers,
) {
	return db.transaction(async (tx) => {
		const claim = await loadClaim(tx, claimId);
		if (!claim) throw new ClaimError("NOT_FOUND");
		assertOpen(claim);
		const now = new Date();
		await tx
			.update(claims)
			.set({ status: "rejected", decidedAt: now, decidedBy: adminId, decisionReason: reason })
			.where(eq(claims.id, claimId));
		await scheduleDocumentPurge(tx, claimId, now);
		await releasePending(tx, claim.practitionerId);
		await recordAudit(tx, {
			actor: adminId,
			action: "claim.reject",
			subjectType: "claim",
			subjectId: claimId,
			headers,
		});
		return { userId: claim.userId, practitionerId: claim.practitionerId };
	});
}

/** The administrator types the code read out by whoever answered the registry phone. */
export async function verifyPhoneCallback(
	db: Database,
	input: { claimId: string; adminId: string; code: string; phone: string; headers?: Headers },
) {
	return db.transaction(async (tx) => {
		const claim = await loadClaim(tx, input.claimId);
		if (!claim) throw new ClaimError("NOT_FOUND");
		assertOpen(claim);
		const { subject } = await subjectOf(tx, claim.practitionerId);
		if (!registryPhones(subject).includes(input.phone)) throw new ClaimError("METHOD_UNAVAILABLE");
		const [check] = await tx
			.select({
				secretHash: claimChecks.secretHash,
				attempts: claimChecks.attempts,
				status: claimChecks.status,
			})
			.from(claimChecks)
			.where(and(eq(claimChecks.claimId, input.claimId), eq(claimChecks.method, "phone_callback")))
			.for("update");
		if (!check?.secretHash || check.status === "passed") throw new ClaimError("METHOD_UNAVAILABLE");
		if (check.attempts >= MAX_CODE_ATTEMPTS) throw new ClaimError("TOO_MANY_ATTEMPTS");
		const [salt = "", hash = ""] = check.secretHash.split(":");
		const ok = verifyOtp(input.code.trim(), salt, hash);
		await upsertCheck(tx, input.claimId, "phone_callback", {
			status: ok ? "passed" : check.attempts + 1 >= MAX_CODE_ATTEMPTS ? "failed" : "pending",
			attempts: check.attempts + 1,
			passedAt: ok ? new Date() : null,
			secretHash: ok ? null : check.secretHash,
			detail: ok ? { phone: input.phone, by: input.adminId } : null,
		});
		await recordAudit(tx, {
			actor: input.adminId,
			action: "claim.phone_callback",
			subjectType: "claim",
			subjectId: input.claimId,
			headers: input.headers,
		});
		if (!ok) throw new ClaimError("INVALID_CODE");
	});
}

/** An administrator accepts the uploaded documents as genuine. */
export async function acceptDocuments(db: Database, claimId: string) {
	const claim = await loadClaim(db, claimId);
	if (!claim) throw new ClaimError("NOT_FOUND");
	assertOpen(claim);
	await upsertCheck(db, claimId, "document", { status: "passed", passedAt: new Date() });
}

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------

export async function adminClaimQueue(db: Database) {
	return db.$client<
		{
			id: string;
			status: string;
			contest: boolean;
			submittedAt: Date | null;
			createdAt: Date;
			practitionerId: number;
			nationalId: string;
			titleCode: string | null;
			firstName: string;
			lastName: string;
			email: string;
			methods: Record<string, string> | null;
		}[]
	>`
		SELECT c.id, c.status, c.contest, c.submitted_at AS "submittedAt", c.created_at AS "createdAt",
			p.id AS "practitionerId", p.national_id AS "nationalId", p.title_code AS "titleCode",
			p.first_name AS "firstName", p.last_name AS "lastName", u.email,
			(SELECT jsonb_object_agg(k.method, k.status) FROM directory.claim_checks k
				WHERE k.claim_id = c.id) AS methods
		FROM directory.claims c
		JOIN directory.practitioners p ON p.id = c.practitioner_id
		JOIN directory."user" u ON u.id = c.user_id
		WHERE c.status = 'in_review'
		ORDER BY c.contest DESC, c.submitted_at
		LIMIT 200
	`;
}

export async function adminClaimDetail(db: Database, claimId: string, options: MethodOptions) {
	const claim = await loadClaim(db, claimId);
	if (!claim) throw new ClaimError("NOT_FOUND");
	const { practitioner, subject, sites } = await subjectOf(db, claim.practitionerId);
	const [claimant] = await db
		.select({ id: user.id, email: user.email, name: user.name, createdAt: user.createdAt })
		.from(user)
		.where(eq(user.id, claim.userId));
	const checks = await checksOf(db, claimId);
	const documents = await db
		.select({
			id: claimDocuments.id,
			kind: claimDocuments.kind,
			contentType: claimDocuments.contentType,
			byteSize: claimDocuments.byteSize,
			createdAt: claimDocuments.createdAt,
			purgedAt: claimDocuments.purgedAt,
		})
		.from(claimDocuments)
		.where(eq(claimDocuments.claimId, claimId))
		.orderBy(claimDocuments.createdAt);
	const incumbent = await verifiedClaimOf(db, practitioner.id);
	const summary = summarize(checks);
	const phones = registryPhones(subject);
	return {
		claim,
		practitioner,
		claimant: claimant ?? null,
		checks: checks.map((check) => ({ ...check })),
		summary,
		documents,
		registryPhones: phones.map((phone) => ({
			phone,
			site: sites.find((site) => site.phone === phone) ?? null,
		})),
		methods: availableMethods(subject, options).map((method) => method.id),
		incumbent: incumbent ? { viaPsc: incumbent.viaPsc } : null,
		// Approving also accepts the uploaded documents the administrator reviewed.
		approvable:
			(claim.status === "in_review" || claim.status === "open") &&
			canApprove(
				{ ...summary, document: summary.document === "pending" ? "passed" : summary.document },
				incumbent ? { incumbentViaPsc: incumbent.viaPsc } : null,
			),
	};
}

/** Decrypts a claim document for an administrator, after writing the audit entry. */
export async function readClaimDocument(
	db: Database,
	storage: StorageDriver,
	input: { documentId: string; adminId: string; headers?: Headers },
) {
	const [document] = await db
		.select()
		.from(claimDocuments)
		.where(eq(claimDocuments.id, input.documentId))
		.limit(1);
	if (!document || document.purgedAt) throw new ClaimError("NOT_FOUND");
	await recordAudit(db, {
		actor: input.adminId,
		action: "claim_document.decrypt",
		subjectType: "claim_document",
		subjectId: document.id,
		headers: input.headers,
	});
	const object = await storage.get(document.storageKey);
	if (!object) throw new ClaimError("NOT_FOUND");
	return {
		body: openBytes(object.body, "claim_documents", "object", document.id),
		contentType: document.contentType,
	};
}

/** Deletes claim documents whose retention ended (30 days after the decision). */
export async function purgeClaimDocuments(db: Database, storage: StorageDriver, now = new Date()) {
	const due = await db.$client<{ id: string; storage_key: string }[]>`
		SELECT id, storage_key FROM directory.claim_documents
		WHERE purged_at IS NULL AND purge_after IS NOT NULL AND purge_after <= ${now.toISOString()}::timestamptz
		ORDER BY purge_after
		LIMIT 500
	`;
	for (const document of due) {
		await storage.delete(document.storage_key);
		await db
			.update(claimDocuments)
			.set({ purgedAt: now })
			.where(eq(claimDocuments.id, document.id));
	}
	return due.length;
}
