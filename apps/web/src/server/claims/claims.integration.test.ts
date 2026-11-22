/**
 * Claims, page ownership, GDPR objections and their access control against a
 * real, migrated database (DATABASE_URL_TEST). Skipped when the variable is
 * unset; CI runs it in the `migrations` job. Every row is synthetic and
 * created (then deleted) by this file.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { createDb, type Database } from "@apercura/db";
import {
	calendars,
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
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_URL_TEST;

// Test-only platform key (32 random bytes per run), read by ~/server/crypto/platform.
process.env.ENCRYPTION_KEYS = `t1:${randomBytes(32).toString("base64")}`;
process.env.ENCRYPTION_ACTIVE_KEY = "t1";

/** A valid RPPS (Luhn) with a random body, so runs never collide. */
function syntheticRpps(): string {
	const body = `1999${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
	for (let check = 0; check <= 9; check++) {
		const candidate = `${body}${check}`;
		let sum = 0;
		for (let index = 0; index < 11; index++) {
			let digit = Number(candidate[10 - index]);
			if (index % 2 === 1) {
				digit *= 2;
				if (digit > 9) digit -= 9;
			}
			sum += digit;
		}
		if (sum % 10 === 0) return candidate;
	}
	throw new Error("unreachable");
}

describe.skipIf(!url)("claims, ownership and objections (database)", async () => {
	const service = await import("./service");
	const gdpr = await import("../gdpr/service");
	const { memoryDriver } = await import("../storage");
	const { refreshPractitioners } = await import("../refresh");
	const { createCallerFactory, createTRPCRouter } = await import("~/trpc/init");
	const { claimsRouter } = await import("~/trpc/routers/claims");
	const { profileRouter } = await import("~/trpc/routers/profile");
	const { adminRouter } = await import("~/trpc/routers/admin");
	const { agendaRequirements } = await import("../booking/gate");

	let db: Database;
	const run = randomUUID().slice(0, 8);
	const ids = (name: string) => `${name}-${run}`;
	const users = {
		alice: ids("alice"),
		bob: ids("bob"),
		carol: ids("carol"),
		assistant: ids("assistant"),
		admin: ids("admin"),
	};
	const storage = memoryDriver();
	const revalidated: string[] = [];
	const noRevalidate = (tag: string) => {
		revalidated.push(tag);
	};
	const created = { practitioners: [] as number[], places: [] as number[], sites: [] as number[] };

	/** A synthetic practitioner with one office (registry email and phone) at a synthetic commune. */
	async function practitioner(options: { kind?: string; email?: string | null } = {}) {
		const rpps = syntheticRpps();
		const sql = db.$client;
		const [place] = await sql<{ id: number }[]>`
			INSERT INTO directory.places (kind, code, name, slug, department_code, postcodes, centroid)
			VALUES ('commune', ${`T${run}${created.places.length}`}, 'Exempleville', ${`exempleville-${run}-${created.places.length}`},
				'99', '{99999}', 'SRID=4326;POINT(2.35 48.85)')
			RETURNING id
		`;
		const [person] = await sql<{ id: number }[]>`
			INSERT INTO directory.practitioners (national_id, national_pp_id, first_name, last_name,
				first_name_source, last_name_source, profession_code, slug, primary_place_id, indexable,
				billing_sector, carte_vitale, ameli_matched_at)
			VALUES (${rpps}, ${`8${rpps}`}, 'Exemple', 'Martin', 'EXEMPLE', 'MARTIN', '10',
				${`exemple-martin-${rpps}`}, ${place?.id ?? null}, true, '1', true, now())
			RETURNING id
		`;
		const [site] = await sql<{ id: number }[]>`
			INSERT INTO directory.sites (source, source_key, kind, name, address_line, postcode, place_id,
				location, geo_precision, phone, phone_kind, email)
			VALUES ('ans', ${`test-${rpps}`}, ${options.kind ?? "office"}, 'Cabinet Exemple', '1 rue de l’Exemple',
				'99999', ${place?.id ?? null}, 'SRID=4326;POINT(2.35 48.85)', 'address', '+33199000999', 'direct',
				${options.email === undefined ? "cabinet@exemple.test" : options.email})
			RETURNING id
		`;
		await sql`
			INSERT INTO directory.activities (practitioner_id, site_id, source, source_key, practice_kind, is_primary)
			VALUES (${person?.id ?? 0}, ${site?.id ?? 0}, 'ans', ${`test-${rpps}`}, ${options.kind ?? "office"}, true)
		`;
		await sql`SELECT directory.refresh_practitioner(${[person?.id ?? 0]}::integer[])`;
		created.practitioners.push(person?.id ?? 0);
		created.places.push(place?.id ?? 0);
		created.sites.push(site?.id ?? 0);
		return { id: person?.id ?? 0, rpps };
	}

	const router = createTRPCRouter({
		claims: claimsRouter,
		profile: profileRouter,
		admin: adminRouter,
	});
	const createCaller = createCallerFactory(router);
	function caller(userId: string, options: { mfa?: boolean } = {}) {
		return createCaller({
			headers: new Headers(),
			db: () => db,
			getSession: async () => ({
				session: {
					id: ids(`session-${userId}`),
					userId,
					expiresAt: new Date(Date.now() + 3_600_000),
					mfaVerifiedAt: options.mfa === false ? null : new Date(),
				},
				user: { id: userId, email: `${userId}@example.test`, name: userId, emailVerified: true },
			}),
			rateLimit: async () => true,
		});
	}
	async function codeOf(promise: Promise<unknown>) {
		try {
			await promise;
			return "OK";
		} catch (error) {
			if (error instanceof TRPCError) {
				// Input validation errors carry the zod issues as their message.
				if (error.message === error.code || error.message.startsWith("[")) return error.code;
				return error.message;
			}
			if (error instanceof Error && "code" in error)
				return String((error as { code: unknown }).code);
			throw error;
		}
	}
	async function passCheck(claimId: string, method: "psc" | "registry_email") {
		await db
			.insert(claimChecks)
			.values({ claimId, method, status: "passed", passedAt: new Date() })
			.onConflictDoUpdate({
				target: [claimChecks.claimId, claimChecks.method],
				set: { status: "passed", passedAt: new Date() },
			});
	}

	beforeAll(async () => {
		db = createDb({ url, max: 2 });
		await db.insert(user).values(
			Object.values(users).map((id) => ({
				id,
				name: id,
				email: `${id}@example.test`,
				emailVerified: true,
				twoFactorEnabled: true,
				isPlatformAdmin: id === users.admin,
			})),
		);
	});

	afterAll(async () => {
		if (!db) return;
		const sql = db.$client;
		const orgs = await sql<{ owner_org_id: string }[]>`
			SELECT owner_org_id FROM directory.practitioners
			WHERE id = ANY (${created.practitioners}::integer[]) AND owner_org_id IS NOT NULL
		`;
		if (orgs.length > 0) {
			await db.delete(organization).where(
				inArray(
					organization.id,
					orgs.map((row) => row.owner_org_id),
				),
			);
		}
		await sql`DELETE FROM directory.suppressions WHERE national_id IN (
			SELECT national_id FROM directory.practitioners WHERE id = ANY (${created.practitioners}::integer[]))`;
		await sql`DELETE FROM directory.activities WHERE practitioner_id = ANY (${created.practitioners}::integer[])`;
		await sql`DELETE FROM directory.practitioners WHERE id = ANY (${created.practitioners}::integer[])`;
		await sql`DELETE FROM directory.sites WHERE id = ANY (${created.sites}::integer[])`;
		await sql`DELETE FROM directory.places WHERE id = ANY (${created.places}::integer[])`;
		await db.delete(user).where(inArray(user.id, Object.values(users)));
		await db.close();
	});

	it("needs a session that proved a second factor before any claim", async () => {
		const target = await practitioner();
		expect(
			await codeOf(caller(users.alice, { mfa: false }).claims.start({ rpps: target.rpps })),
		).toBe("MFA_REQUIRED");
		expect(await codeOf(caller(users.alice).claims.start({ rpps: "12345678901" }))).toBe(
			"INVALID_RPPS",
		);
	});

	it("verifies with the registry email, keeps one owner, and turns later claims into contests", async () => {
		const target = await practitioner();
		const first = await service.startClaim(db, users.alice, target.rpps);
		const again = await service.startClaim(db, users.alice, target.rpps);
		expect(again).toEqual({ id: first.id, created: false });
		const second = await service.startClaim(db, users.bob, target.rpps);

		const prepared = await service.prepareRegistryEmail(db, first.id, users.alice);
		expect(prepared.to).toEqual(["cabinet@exemple.test"]);
		const [stored] = await db
			.select({ secretHash: claimChecks.secretHash })
			.from(claimChecks)
			.where(and(eq(claimChecks.claimId, first.id), eq(claimChecks.method, "registry_email")));
		// Only the hash of the link token is stored.
		expect(stored?.secretHash).not.toBe(prepared.token);
		await service.confirmRegistryEmail(db, prepared.token);
		const approval = await service.evaluateClaim(db, first.id);
		expect(approval?.via).toBe("registry_email");
		await refreshPractitioners(db.$client, [target.id], noRevalidate);

		const [page] = await db
			.select({ claimStatus: practitioners.claimStatus, ownerOrgId: practitioners.ownerOrgId })
			.from(practitioners)
			.where(eq(practitioners.id, target.id));
		expect(page?.claimStatus).toBe("claimed");
		const owners = await db
			.select({ userId: member.userId, role: member.role })
			.from(member)
			.where(eq(member.organizationId, page?.ownerOrgId ?? ""));
		expect(owners).toEqual([{ userId: users.alice, role: "owner" }]);
		const [verified] = await db
			.select({ verifiedAt: claims.verifiedAt, bookingOpensAt: claims.bookingOpensAt })
			.from(claims)
			.where(eq(claims.id, first.id));
		const delay =
			((verified?.bookingOpensAt?.getTime() ?? 0) - (verified?.verifiedAt?.getTime() ?? 0)) /
			86_400_000;
		expect(delay).toBe(7);
		expect(revalidated).toContain(`practitioner:${target.id}`);

		const [contest] = await db
			.select({ contest: claims.contest })
			.from(claims)
			.where(eq(claims.id, second.id));
		expect(contest?.contest).toBe(true);
		// The partial unique index refuses a second verified owner, whatever the code does.
		await expect(
			db.update(claims).set({ status: "verified" }).where(eq(claims.id, second.id)),
		).rejects.toThrow();
		expect(await codeOf(service.startClaim(db, users.alice, target.rpps))).toBe("ALREADY_OWNER");
	});

	it("never sends the claim link to a hospital's generic email", async () => {
		const target = await practitioner({ kind: "hospital", email: "standard@chu-exemple.test" });
		const claim = await service.startClaim(db, users.carol, target.rpps);
		expect(await codeOf(service.prepareRegistryEmail(db, claim.id, users.carol))).toBe(
			"METHOD_UNAVAILABLE",
		);
	});

	it("verifies with an encrypted document and the registry phone callback, after review", async () => {
		const target = await practitioner({ email: null });
		const claim = await service.startClaim(db, users.carol, target.rpps);
		const pdf = Buffer.from("%PDF-1.4\n% synthetic CPS card\n%%EOF\n");
		expect(
			await codeOf(
				service.addClaimDocument(db, storage, {
					claimId: claim.id,
					userId: users.carol,
					kind: "cps_card",
					bytes: Buffer.from("not a document"),
				}),
			),
		).toBe("BAD_DOCUMENT");
		const document = await service.addClaimDocument(db, storage, {
			claimId: claim.id,
			userId: users.carol,
			kind: "cps_card",
			bytes: pdf,
		});
		const [row] = await db.select().from(claimDocuments).where(eq(claimDocuments.id, document.id));
		const object = storage.objects.get(row?.storageKey ?? "");
		expect(
			Buffer.from(object ?? [])
				.subarray(0, 4)
				.toString("ascii"),
		).toBe("APB1");
		expect(Buffer.from(object ?? []).includes(Buffer.from("synthetic CPS card"))).toBe(false);

		// Someone else cannot touch it.
		expect(await codeOf(service.issuePhoneCode(db, claim.id, users.bob))).toBe("NOT_FOUND");
		const { code } = await service.issuePhoneCode(db, claim.id, users.carol);
		await service.submitClaim(db, claim.id, users.carol);
		expect(await codeOf(caller(users.carol).admin.claims.queue())).toBe("FORBIDDEN");
		const queue = await caller(users.admin).admin.claims.queue();
		expect(queue.map((item) => item.id)).toContain(claim.id);

		const read = await service.readClaimDocument(db, storage, {
			documentId: document.id,
			adminId: users.admin,
		});
		expect(read.body.toString("utf8")).toContain("synthetic CPS card");
		const audit = await db.$client<{ n: number }[]>`
			SELECT count(*)::integer AS n FROM directory.platform_audit_events
			WHERE subject_id = ${document.id} AND action = 'claim_document.decrypt' AND actor = ${users.admin}
		`;
		expect(audit[0]?.n).toBe(1);

		// Not approvable before the callback; the code is checked against the registry phone only.
		expect(await codeOf(service.approveClaim(db, claim.id, users.admin, null))).toBe(
			"NOT_APPROVABLE",
		);
		expect(
			await codeOf(
				service.verifyPhoneCallback(db, {
					claimId: claim.id,
					adminId: users.admin,
					code,
					phone: "+33600000000",
				}),
			),
		).toBe("METHOD_UNAVAILABLE");
		const wrong = code === "000000" ? "111111" : "000000";
		expect(
			await codeOf(
				service.verifyPhoneCallback(db, {
					claimId: claim.id,
					adminId: users.admin,
					code: wrong,
					phone: "+33199000999",
				}),
			),
		).toBe("INVALID_CODE");
		await service.verifyPhoneCallback(db, {
			claimId: claim.id,
			adminId: users.admin,
			code,
			phone: "+33199000999",
		});
		const approval = await service.approveClaim(db, claim.id, users.admin, null);
		expect(approval.via).toBe("review");
		const [purge] = await db
			.select({ purgeAfter: claimDocuments.purgeAfter })
			.from(claimDocuments)
			.where(eq(claimDocuments.id, document.id));
		const days = ((purge?.purgeAfter?.getTime() ?? 0) - Date.now()) / 86_400_000;
		expect(days).toBeGreaterThan(29.9);

		// 30 days later the document is gone from storage.
		const purged = await service.purgeClaimDocuments(
			db,
			storage,
			new Date(Date.now() + 31 * 86_400_000),
		);
		expect(purged).toBeGreaterThanOrEqual(1);
		expect(storage.objects.has(row?.storageKey ?? "")).toBe(false);
	});

	it("lets Pro Santé Connect win a contest, and freezes the account that loses", async () => {
		const target = await practitioner();
		const incumbent = await service.startClaim(db, users.bob, target.rpps);
		await passCheck(incumbent.id, "registry_email");
		await service.evaluateClaim(db, incumbent.id);
		await db.insert(session).values({
			id: ids("bob-session"),
			token: ids("bob-token"),
			userId: users.bob,
			expiresAt: new Date(Date.now() + 3_600_000),
		});
		// The incumbent subscribed to the practice's private calendar feed.
		const [bobOrg] = await db
			.select({ id: practitioners.ownerOrgId })
			.from(practitioners)
			.where(eq(practitioners.id, target.id));
		const [feedCalendar] = await db
			.insert(calendars)
			.values({
				organizationId: bobOrg?.id ?? "",
				practitionerId: target.id,
				siteId: created.sites.at(-1) ?? 0,
				timeZone: "Europe/Paris",
				icsTokenHash: randomBytes(32).toString("hex"),
				icsTokenCreatedAt: new Date(),
			})
			.returning({ id: calendars.id });

		// Without Pro Santé Connect, a contest needs an administrator; with it, it is reviewable.
		const challenger = await service.startClaim(db, users.carol, target.rpps);
		await passCheck(challenger.id, "psc");
		expect(await service.evaluateClaim(db, challenger.id)).toBeNull();
		const [inReview] = await db
			.select({ status: claims.status })
			.from(claims)
			.where(eq(claims.id, challenger.id));
		expect(inReview?.status).toBe("in_review");

		const approval = await service.approveClaim(db, challenger.id, users.admin, "contest");
		expect(approval.supersededUserId).toBe(users.bob);
		const [lost] = await db
			.select({ status: claims.status })
			.from(claims)
			.where(eq(claims.id, incumbent.id));
		expect(lost?.status).toBe("superseded");
		const [frozen] = await db
			.select({ frozenAt: user.frozenAt })
			.from(user)
			.where(eq(user.id, users.bob));
		expect(frozen?.frozenAt).toBeInstanceOf(Date);
		expect(await db.select().from(session).where(eq(session.userId, users.bob))).toEqual([]);
		const team = await db
			.select({ userId: member.userId })
			.from(member)
			.where(eq(member.organizationId, approval.organizationId));
		expect(team).toEqual([{ userId: users.carol }]);
		expect(await codeOf(service.startClaim(db, users.bob, target.rpps))).toBe("FROZEN");
		// The practice changed hands: the incumbent's feed link no longer opens anything.
		expect(approval.organizationId).toBe(bobOrg?.id);
		const [feed] = await db
			.select({ hash: calendars.icsTokenHash })
			.from(calendars)
			.where(eq(calendars.id, feedCalendar?.id ?? ""));
		expect(feed?.hash).toBeNull();
		await db.delete(calendars).where(eq(calendars.id, feedCalendar?.id ?? ""));
	});

	it("never lets a claim without Pro Santé Connect take a page verified with it", async () => {
		const target = await practitioner();
		const owner = await service.startClaim(db, users.alice, target.rpps);
		await passCheck(owner.id, "psc");
		await service.evaluateClaim(db, owner.id);
		const other = await service.startClaim(db, users.assistant, target.rpps);
		await passCheck(other.id, "registry_email");
		await service.evaluateClaim(db, other.id);
		expect(await codeOf(service.approveClaim(db, other.id, users.admin, null))).toBe(
			"NOT_APPROVABLE",
		);
	});

	it("lets owners edit their page, never assistants, and publishes plain text only", async () => {
		const target = await practitioner();
		const claim = await service.startClaim(db, users.alice, target.rpps);
		await passCheck(claim.id, "psc");
		const approval = await service.evaluateClaim(db, claim.id);
		const organizationId = approval?.organizationId ?? "";
		await db.insert(member).values({
			id: ids(`assistant-${target.id}`),
			organizationId,
			userId: users.assistant,
			role: "assistant",
		});
		const profile = {
			headline: "Médecine générale",
			bio: "Consultations sur rendez-vous.",
			languages: ["fr", "en"] as ("fr" | "en")[],
			billingSector: "1" as const,
			optam: null,
			carteVitale: true,
			fees: { items: [{ label: "Consultation", amount: 30, maxAmount: null }], note: null },
			paymentMethods: ["card"] as "card"[],
			accessibility: { stepFree: true, lift: null, parking: null, notes: null },
			website: "cabinet-exemple.test",
			showPhone: false,
			hiddenFields: ["website"] as "website"[],
		};
		expect(await codeOf(caller(users.assistant).profile.save({ organizationId, profile }))).toBe(
			"FORBIDDEN",
		);
		expect(await codeOf(caller(users.bob).profile.get({ organizationId }))).toBe("FORBIDDEN");
		expect(
			await codeOf(
				caller(users.alice).profile.save({
					organizationId,
					profile: { ...profile, bio: "<script>alert(1)</script>" },
				}),
			),
		).toBe("BAD_REQUEST");

		const saved = await caller(users.alice).profile.save({ organizationId, profile });
		expect(saved.profile.website).toBe("https://cabinet-exemple.test/");
		expect(saved.booking.blockers).toEqual([]);
		// Not published yet: the public payload has no owner content.
		const before = await db.$client<{ profile: unknown }[]>`
			SELECT payload -> 'profile' AS profile FROM directory.practitioner_pages WHERE practitioner_id = ${target.id}
		`;
		expect(before[0]?.profile).toBeNull();
		await caller(users.alice).profile.publish({ organizationId });
		const after = await db.$client<{ profile: Record<string, unknown> }[]>`
			SELECT payload -> 'profile' AS profile FROM directory.practitioner_pages WHERE practitioner_id = ${target.id}
		`;
		expect(after[0]?.profile.headline).toBe("Médecine générale");
		// Hidden fields never reach the payload.
		expect(after[0]?.profile.website).toBeNull();
		expect(after[0]?.profile.showPhone).toBe(false);
	});

	it("withholds an unclaimed page at once on objection, suppresses it after the check, and refuses claimed pages", async () => {
		const target = await practitioner();
		const request = await gdpr.requestRemoval(db, {
			rpps: target.rpps,
			contact: "objection@example.test",
			message: null,
			locale: "fr",
		});
		await refreshPractitioners(db.$client, [target.id], noRevalidate);
		const [hidden] = await db.$client<
			{ indexable: boolean; withheld: boolean; page: boolean; search: boolean; contact: string }[]
		>`
			SELECT p.indexable, (pg.payload ->> 'withheld')::boolean AS withheld, pg.indexable AS page,
				sd.indexable AS search, r.contact_enc AS contact
			FROM directory.practitioners p
			JOIN directory.practitioner_pages pg ON pg.practitioner_id = p.id
			JOIN directory.search_docs sd ON sd.practitioner_id = p.id
			JOIN directory.removal_requests r ON r.id = ${request.id}
			WHERE p.id = ${target.id}
		`;
		expect(hidden).toMatchObject({ indexable: false, withheld: true, page: false, search: false });
		expect(hidden?.contact).not.toContain("objection");

		await gdpr.decideRemoval(db, {
			id: request.id,
			adminId: users.admin,
			confirm: true,
			reason: null,
		});
		await refreshPractitioners(db.$client, [target.id], noRevalidate);
		const [gone] = await db.$client<{ status: string; pages: number; suppressions: number }[]>`
			SELECT p.status,
				(SELECT count(*)::integer FROM directory.practitioner_pages WHERE practitioner_id = p.id) AS pages,
				(SELECT count(*)::integer FROM directory.suppressions s WHERE s.national_id = p.national_id) AS suppressions
			FROM directory.practitioners p WHERE p.id = ${target.id}
		`;
		expect(gone).toEqual({ status: "suppressed", pages: 0, suppressions: 1 });

		const claimed = await practitioner();
		const claim = await service.startClaim(db, users.carol, claimed.rpps);
		await passCheck(claim.id, "psc");
		await service.evaluateClaim(db, claim.id);
		expect(
			await codeOf(
				gdpr.requestRemoval(db, {
					rpps: claimed.rpps,
					contact: "x@example.test",
					message: null,
					locale: "fr",
				}),
			),
		).toBe("CLAIMED");
	});

	it("gates the agenda in one place: verified owner, 7-day wait without Pro Santé Connect, fees and payment methods", async () => {
		const fees = { items: [{ label: "Consultation", amount: 30, maxAmount: null }], note: null };
		const viaEmail = await practitioner();
		const emailClaim = await service.startClaim(db, users.alice, viaEmail.rpps);
		await passCheck(emailClaim.id, "registry_email");
		const emailApproval = await service.evaluateClaim(db, emailClaim.id);
		const emailOrg = emailApproval?.organizationId ?? "";
		await db
			.update(practitionerProfiles)
			.set({ fees, paymentMethods: ["card"] })
			.where(eq(practitionerProfiles.practitionerId, viaEmail.id));
		const waiting = await agendaRequirements(db, emailOrg, viaEmail.id);
		expect(waiting).toMatchObject({
			claimed: true,
			fees: true,
			paymentMethods: true,
			ready: false,
		});
		expect(waiting.blockers).toEqual(["waitingPeriod"]);
		const later = await agendaRequirements(
			db,
			emailOrg,
			viaEmail.id,
			new Date(Date.now() + 8 * 86_400_000),
		);
		expect(later.ready).toBe(true);
		// Another organization never passes, whatever the page states.
		expect((await agendaRequirements(db, ids("other-org"), viaEmail.id)).claimed).toBe(false);
		// The editor reads the very same gate.
		const editor = await caller(users.alice).profile.get({ organizationId: emailOrg });
		expect(editor.booking).toEqual(waiting);

		const viaPsc = await practitioner();
		const pscClaim = await service.startClaim(db, users.carol, viaPsc.rpps);
		await passCheck(pscClaim.id, "psc");
		const pscApproval = await service.evaluateClaim(db, pscClaim.id);
		const pscOrg = pscApproval?.organizationId ?? "";
		const missing = await agendaRequirements(db, pscOrg, viaPsc.id);
		expect(missing.blockers).toEqual(["fees", "paymentMethods"]);
		await db
			.update(practitionerProfiles)
			.set({ fees, paymentMethods: ["cash"] })
			.where(eq(practitionerProfiles.practitionerId, viaPsc.id));
		expect((await agendaRequirements(db, pscOrg, viaPsc.id)).ready).toBe(true);
	});
});
