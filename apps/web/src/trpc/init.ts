import type { Database } from "@apercura/db";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";
import { type Permissions, roleCan } from "~/server/auth/access";
import { findMembership, isPlatformAdmin } from "~/server/auth/membership";
import type { RateLimitRule } from "~/server/rate-limit";
import { redactErrorShape } from "./error-redaction";

/** The parts of a Better Auth session the procedures rely on. */
export interface SessionContext {
	session: {
		id: string;
		userId: string;
		expiresAt: Date;
		/** Set only after TOTP, a backup code or a passkey with user verification. */
		mfaVerifiedAt?: Date | null;
		mfaMethod?: string | null;
		/** Better Auth's hint for the UI. Never used for access decisions. */
		activeOrganizationId?: string | null;
	};
	user: { id: string; email: string; name: string; emailVerified: boolean };
}

/**
 * Per-request context shared by every procedure. Built by `createTRPCContext`
 * (see `./context`) for HTTP and Server Components, and by hand in tests.
 */
export interface Context {
	headers: Headers;
	/** The database pool (opened on first use). */
	db: () => Database;
	/** The caller's session, read at most once per request. */
	getSession: () => Promise<SessionContext | null>;
	/** Counts one hit against a key; false when over the limit. */
	rateLimit: (key: string, rule: RateLimitRule) => Promise<boolean>;
	/** Response headers (HTTP only), e.g. to set the booking cookie. */
	resHeaders?: Headers;
	/** Runs a task after the response is sent (Next.js `after`). Unset: tasks run unawaited. */
	defer?: (task: () => Promise<void>) => void;
	/** Clock of the booking services, injected by tests. Defaults to `Date.now`. */
	now?: () => number;
	/** Marks cached pages stale (Next.js `revalidateTag`). Unset in tests. */
	revalidate?: (tags: string[]) => void;
}

/**
 * What a procedure requires, set by the builders below (never by hand). A test
 * enumerates every procedure of the app router and checks it against the
 * expected access of its path (`procedure-access.test.ts`).
 */
export type ProcedureMeta =
	| { access: "public" }
	| { access: "authed" }
	| { access: "mfa" }
	| { access: "member"; permissions: Permissions }
	| { access: "platformAdmin" };

const t = initTRPC
	.context<Context>()
	.meta<ProcedureMeta>()
	.create({
		transformer: superjson,
		errorFormatter: ({ shape, error }) => redactErrorShape(shape, error),
	});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

/** Procedure available without authentication. */
export const publicProcedure = t.procedure.meta({ access: "public" });

/**
 * Per-user limit for signed-in staff: hospitals put many people behind one IP
 * address, so limiting by IP would block a whole ward.
 */
export const USER_RATE_LIMIT: RateLimitRule = { max: 300, windowSeconds: 60 };

/** Signed in (any session, even without a second factor). */
export const authedProcedure = t.procedure.meta({ access: "authed" }).use(async ({ ctx, next }) => {
	const current = await ctx.getSession();
	if (!current) {
		throw new TRPCError({ code: "UNAUTHORIZED" });
	}
	if (!(await ctx.rateLimit(`user:${current.user.id}`, USER_RATE_LIMIT))) {
		throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
	}
	return next({ ctx: { session: current.session, user: current.user } });
});

/**
 * Signed in and this session proved a second factor. Checks the session's own
 * `mfaVerifiedAt`, never `user.twoFactorEnabled` (having a factor is not the
 * same as having used it).
 */
export const mfaProcedure = authedProcedure.meta({ access: "mfa" }).use(async ({ ctx, next }) => {
	const verifiedAt = ctx.session.mfaVerifiedAt;
	if (!(verifiedAt instanceof Date) || Number.isNaN(verifiedAt.getTime())) {
		throw new TRPCError({ code: "FORBIDDEN", message: "MFA_REQUIRED" });
	}
	return next({ ctx: { mfaVerifiedAt: verifiedAt } });
});

/**
 * Member of the organization named in the input with the given permissions.
 * The membership is read from the database on every call; the client only
 * says which organization it means, and the session's `activeOrganizationId`
 * is ignored. Data access must use `ctx.organizationId`.
 */
export function memberProcedure(permissions: Permissions) {
	return mfaProcedure
		.meta({ access: "member", permissions })
		.input(z.object({ organizationId: z.string().min(1).max(64) }))
		.use(async ({ ctx, input, next }) => {
			const membership = await findMembership(ctx.db(), ctx.user.id, input.organizationId);
			if (!membership || !roleCan(membership.role, permissions)) {
				// Same answer for "not a member" and "not allowed": no probing of organizations.
				throw new TRPCError({ code: "FORBIDDEN" });
			}
			return next({
				ctx: {
					organizationId: membership.organizationId,
					memberId: membership.id,
					memberRole: membership.role,
				},
			});
		});
}

/**
 * Platform administrator (claims review, reports), flag re-read from the
 * database on every call. Carries no organization: these procedures must never
 * read patient data.
 */
export const platformAdminProcedure = mfaProcedure
	.meta({ access: "platformAdmin" })
	.use(async ({ ctx, next }) => {
		if (!(await isPlatformAdmin(ctx.db(), ctx.user.id))) {
			throw new TRPCError({ code: "FORBIDDEN" });
		}
		return next({ ctx: { platformAdmin: true as const } });
	});
