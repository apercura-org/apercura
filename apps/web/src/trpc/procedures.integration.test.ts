/**
 * Access control against a real, migrated database (DATABASE_URL_TEST).
 * Skipped when the variable is unset; CI runs it in the `auth` job.
 */
import { randomUUID } from "node:crypto";
import { createDb, type Database } from "@apercura/db";
import { member, organization, rateLimits, session, user } from "@apercura/db/schema";
import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { consumeRateLimit } from "~/server/rate-limit";
import {
	type Context,
	createCallerFactory,
	createTRPCRouter,
	memberProcedure,
	platformAdminProcedure,
	type SessionContext,
} from "./init";
import { accountRouter } from "./routers/account";

const url = process.env.DATABASE_URL_TEST;

const router = createTRPCRouter({
	readAgenda: memberProcedure({ agenda: ["read"] }).query(({ ctx }) => ctx.organizationId),
	editPage: memberProcedure({ page: ["update"] }).mutation(({ ctx }) => ctx.organizationId),
	// Owner-only: team management and opening the agenda.
	inviteMember: memberProcedure({ member: ["create"] }).mutation(({ ctx }) => ctx.organizationId),
	openAgenda: memberProcedure({ agenda: ["open"] }).mutation(({ ctx }) => ctx.organizationId),
	reviewClaims: platformAdminProcedure.query(({ ctx }) => ({
		platformAdmin: ctx.platformAdmin,
		hasOrganization: "organizationId" in ctx,
	})),
	account: accountRouter,
});
const createCaller = createCallerFactory(router);

describe.skipIf(!url)("access control (database)", () => {
	let db: Database;
	const run = randomUUID().slice(0, 8);
	const id = (name: string) => `${name}-${run}`;
	const users = {
		ownerA: id("owner-a"),
		assistantA: id("assistant-a"),
		practitionerA: id("practitioner-a"),
		ownerB: id("owner-b"),
		admin: id("admin"),
	};
	const orgA = id("org-a");
	const orgB = id("org-b");

	function caller(userId: string, overrides: Partial<SessionContext["session"]> = {}) {
		const current: SessionContext = {
			session: {
				id: id(`session-${userId}`),
				userId,
				expiresAt: new Date(Date.now() + 3_600_000),
				mfaVerifiedAt: new Date(),
				...overrides,
			},
			user: { id: userId, email: `${userId}@example.test`, name: userId, emailVerified: true },
		};
		const ctx: Context = {
			headers: new Headers(),
			db: () => db,
			getSession: async () => current,
			rateLimit: async () => true,
		};
		return createCaller(ctx);
	}

	async function codeOf(promise: Promise<unknown>) {
		try {
			return { ok: await promise };
		} catch (error) {
			if (error instanceof TRPCError) {
				return error.code;
			}
			throw error;
		}
	}

	beforeAll(async () => {
		db = createDb({ url, max: 2 });
		await db.insert(user).values(
			Object.values(users).map((userId) => ({
				id: userId,
				name: userId,
				email: `${userId}@example.test`,
				emailVerified: true,
				isPlatformAdmin: userId === users.admin,
			})),
		);
		await db.insert(organization).values([
			{ id: orgA, name: "Cabinet Exemple A", slug: orgA },
			{ id: orgB, name: "Cabinet Exemple B", slug: orgB },
		]);
		await db.insert(member).values([
			{ id: id("m1"), organizationId: orgA, userId: users.ownerA, role: "owner" },
			{ id: id("m2"), organizationId: orgA, userId: users.assistantA, role: "assistant" },
			{ id: id("m3"), organizationId: orgA, userId: users.practitionerA, role: "practitioner" },
			{ id: id("m4"), organizationId: orgB, userId: users.ownerB, role: "owner" },
		]);
		await db.insert(session).values(
			[users.ownerA, users.ownerB].map((userId) => ({
				id: id(`session-${userId}`),
				token: id(`token-${userId}`),
				userId,
				expiresAt: new Date(Date.now() + 3_600_000),
				mfaVerifiedAt: new Date(),
			})),
		);
	});

	afterAll(async () => {
		if (!db) {
			return;
		}
		await db.delete(organization).where(inArray(organization.id, [orgA, orgB]));
		await db.delete(user).where(inArray(user.id, Object.values(users)));
		await db.delete(rateLimits).where(eq(rateLimits.key, id("limit")));
		await db.close();
	});

	it("lets members reach their own organization, with its id injected from the database", async () => {
		expect(await caller(users.ownerA).readAgenda({ organizationId: orgA })).toBe(orgA);
		expect(await caller(users.assistantA).readAgenda({ organizationId: orgA })).toBe(orgA);
		expect(await caller(users.ownerB).readAgenda({ organizationId: orgB })).toBe(orgB);
	});

	it("refuses a member of organization A on organization B, whatever the session says", async () => {
		expect(await codeOf(caller(users.ownerA).readAgenda({ organizationId: orgB }))).toBe(
			"FORBIDDEN",
		);
		// A forged or stale activeOrganizationId changes nothing: membership is read from the database.
		const forged = caller(users.ownerA, { activeOrganizationId: orgB });
		expect(await codeOf(forged.readAgenda({ organizationId: orgB }))).toBe("FORBIDDEN");
		expect(await codeOf(forged.inviteMember({ organizationId: orgB }))).toBe("FORBIDDEN");
		expect(await codeOf(caller(users.assistantA).readAgenda({ organizationId: orgB }))).toBe(
			"FORBIDDEN",
		);
	});

	it("refuses owner-only procedures to an assistant and a practitioner", async () => {
		for (const userId of [users.assistantA, users.practitionerA]) {
			expect(await codeOf(caller(userId).inviteMember({ organizationId: orgA }))).toBe("FORBIDDEN");
			expect(await codeOf(caller(userId).openAgenda({ organizationId: orgA }))).toBe("FORBIDDEN");
		}
		expect(await caller(users.ownerA).inviteMember({ organizationId: orgA })).toBe(orgA);
		expect(await caller(users.ownerA).openAgenda({ organizationId: orgA })).toBe(orgA);
	});

	it("keeps assistants off the public page but lets practitioners edit it", async () => {
		expect(await codeOf(caller(users.assistantA).editPage({ organizationId: orgA }))).toBe(
			"FORBIDDEN",
		);
		expect(await caller(users.practitionerA).editPage({ organizationId: orgA })).toBe(orgA);
	});

	it("re-reads the membership on every call", async () => {
		const assistant = caller(users.assistantA);
		expect(await assistant.readAgenda({ organizationId: orgA })).toBe(orgA);
		await db
			.update(member)
			.set({ role: "removed" })
			.where(eq(member.id, id("m2")));
		expect(await codeOf(assistant.readAgenda({ organizationId: orgA }))).toBe("FORBIDDEN");
		await db
			.update(member)
			.set({ role: "assistant" })
			.where(eq(member.id, id("m2")));
	});

	it("still asks members for a second factor", async () => {
		const weak = caller(users.ownerA, { mfaVerifiedAt: null });
		expect(await codeOf(weak.readAgenda({ organizationId: orgA }))).toBe("FORBIDDEN");
	});

	it("gives platform admins no organization and re-reads the flag", async () => {
		expect(await caller(users.admin).reviewClaims()).toEqual({
			platformAdmin: true,
			hasOrganization: false,
		});
		expect(await codeOf(caller(users.admin).readAgenda({ organizationId: orgA }))).toBe(
			"FORBIDDEN",
		);
		expect(await codeOf(caller(users.ownerA).reviewClaims())).toBe("FORBIDDEN");
		await db.update(user).set({ isPlatformAdmin: false }).where(eq(user.id, users.admin));
		expect(await codeOf(caller(users.admin).reviewClaims())).toBe("FORBIDDEN");
	});

	it("only revokes the caller's own sessions", async () => {
		const otherSession = id(`session-${users.ownerB}`);
		expect(await codeOf(caller(users.ownerA).account.revokeSession({ id: otherSession }))).toBe(
			"NOT_FOUND",
		);
		const [still] = await db.select().from(session).where(eq(session.id, otherSession));
		expect(still).toBeDefined();
	});

	it("counts rate-limit hits atomically", async () => {
		const key = id("limit");
		const rule = { max: 5, windowSeconds: 60 };
		const results = await Promise.all(
			Array.from({ length: 8 }, () => consumeRateLimit(db, key, rule)),
		);
		expect(results.filter(Boolean)).toHaveLength(5);
		const [row] = await db.select().from(rateLimits).where(eq(rateLimits.key, key));
		expect(row?.count).toBe(8);
	});
});
