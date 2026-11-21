import "server-only";
import type { Database } from "@apercura/db";
import { USER_RATE_LIMIT } from "~/trpc/init";
import { consumeRateLimit } from "../rate-limit";
import { type Permissions, roleCan } from "./access";
import { findMembership, isPlatformAdmin } from "./membership";
import { getSessionFor } from "./session";

export type GuardResult<T> = { ok: true; value: T } | { ok: false; response: Response };

const deny = (status: number) =>
	({
		ok: false,
		response: Response.json({ error: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN" }, { status }),
	}) as const;

/**
 * The same checks as the tRPC `mfa` middleware, for route handlers that take
 * uploads or stream files: a session that proved a second factor, and the
 * per-user rate limit.
 */
export async function requireMfaSession(db: Database, headers: Headers) {
	const current = await getSessionFor(headers);
	if (!current) return deny(401);
	if (!current.session.mfaVerifiedAt) return deny(403);
	if (!(await consumeRateLimit(db, `user:${current.user.id}`, USER_RATE_LIMIT))) {
		return {
			ok: false,
			response: Response.json({ error: "TOO_MANY_REQUESTS" }, { status: 429 }),
		} as const;
	}
	return { ok: true, value: current } as const;
}

/** Membership read from the database, as in `memberProcedure`. */
export async function requireMember(
	db: Database,
	userId: string,
	organizationId: string,
	permissions: Permissions,
) {
	const membership = await findMembership(db, userId, organizationId);
	if (!membership || !roleCan(membership.role, permissions)) return deny(403);
	return { ok: true, value: membership } as const;
}

export async function requirePlatformAdmin(db: Database, userId: string) {
	if (!(await isPlatformAdmin(db, userId))) return deny(403);
	return { ok: true, value: true } as const;
}

/** Reads a multipart body with a size cap, before buffering it all. */
export async function readForm(request: Request, maxBytes: number): Promise<FormData | null> {
	const length = Number(request.headers.get("content-length") ?? "0");
	if (length > maxBytes + 64 * 1024) return null;
	try {
		return await request.formData();
	} catch {
		return null;
	}
}
