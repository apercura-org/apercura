import type { Database } from "@apercura/db";
import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import {
	authedProcedure,
	type Context,
	createCallerFactory,
	createTRPCRouter,
	memberProcedure,
	mfaProcedure,
	type SessionContext,
	USER_RATE_LIMIT,
} from "./init";

const router = createTRPCRouter({
	whoami: authedProcedure.query(({ ctx }) => ctx.user.id),
	sensitive: mfaProcedure.query(({ ctx }) => ctx.mfaVerifiedAt.toISOString()),
	agenda: memberProcedure({ agenda: ["read"] }).query(({ ctx }) => ctx.organizationId),
});
const createCaller = createCallerFactory(router);

function sessionFixture(overrides: Partial<SessionContext["session"]> = {}): SessionContext {
	return {
		session: {
			id: "session-1",
			userId: "user-1",
			expiresAt: new Date(Date.now() + 3_600_000),
			mfaVerifiedAt: null,
			...overrides,
		},
		user: {
			id: "user-1",
			email: "exemple.martin@example.test",
			name: "Exemple Martin",
			emailVerified: true,
			// Having a factor is not the same as having used it in this session.
			twoFactorEnabled: true,
		} as SessionContext["user"],
	};
}

function context(
	session: SessionContext | null,
	rateLimit: Context["rateLimit"] = async () => true,
): Context {
	return {
		headers: new Headers(),
		db: (): Database => {
			throw new Error("this test must not reach the database");
		},
		getSession: async () => session,
		rateLimit,
	};
}

async function codeOf(promise: Promise<unknown>) {
	try {
		await promise;
		return "OK";
	} catch (error) {
		return error instanceof TRPCError ? error.code : String(error);
	}
}

describe("authed", () => {
	it("rejects a request without a session", async () => {
		expect(await codeOf(createCaller(context(null)).whoami())).toBe("UNAUTHORIZED");
	});

	it("limits each signed-in user, not each IP", async () => {
		const rateLimit = vi.fn(async () => false);
		expect(await codeOf(createCaller(context(sessionFixture(), rateLimit)).whoami())).toBe(
			"TOO_MANY_REQUESTS",
		);
		expect(rateLimit).toHaveBeenCalledWith("user:user-1", USER_RATE_LIMIT);
	});

	it("accepts any session, even without a second factor", async () => {
		expect(await createCaller(context(sessionFixture())).whoami()).toBe("user-1");
	});
});

describe("mfa", () => {
	it("rejects a session without mfaVerifiedAt, even when the user has TOTP enabled", async () => {
		const caller = createCaller(context(sessionFixture({ mfaVerifiedAt: null })));
		await expect(caller.sensitive()).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "MFA_REQUIRED",
		});
	});

	it("rejects a session whose mfaVerifiedAt is missing or not a date", async () => {
		const missing = sessionFixture();
		delete missing.session.mfaVerifiedAt;
		expect(await codeOf(createCaller(context(missing)).sensitive())).toBe("FORBIDDEN");
		const forged = sessionFixture({ mfaVerifiedAt: "2026-11-21T10:00:00Z" as unknown as Date });
		expect(await codeOf(createCaller(context(forged)).sensitive())).toBe("FORBIDDEN");
	});

	it("rejects member procedures before any membership lookup", async () => {
		const caller = createCaller(context(sessionFixture({ activeOrganizationId: "org-a" })));
		expect(await codeOf(caller.agenda({ organizationId: "org-a" }))).toBe("FORBIDDEN");
	});

	it("accepts a session that proved a second factor", async () => {
		const verifiedAt = new Date("2026-11-21T09:30:00Z");
		const caller = createCaller(context(sessionFixture({ mfaVerifiedAt: verifiedAt })));
		expect(await caller.sensitive()).toBe(verifiedAt.toISOString());
	});
});
