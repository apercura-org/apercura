import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { type BookingRuntime, deferWith } from "~/server/booking/runtime";
import { clientRateLimitKey } from "~/server/rate-limit";
import type { Context } from "./init";

/** The booking services' view of a tRPC request. */
export function bookingRuntime(ctx: Context): BookingRuntime {
	const requestId = ctx.headers.get("x-request-id")?.slice(0, 64) || randomUUID();
	return {
		db: ctx.db(),
		nowMs: ctx.now ?? Date.now,
		rateLimit: ctx.rateLimit,
		clientKey: (scope) => clientRateLimitKey(scope, ctx.headers, undefined, { ipv6Prefix64: true }),
		requestId,
		ipHash: clientRateLimitKey("audit", ctx.headers),
		defer: deferWith(
			ctx.defer ??
				((task) => {
					void task();
				}),
		),
	};
}

/**
 * Refuses cross-site requests to public booking mutations: browsers send `Sec-Fetch-Site` on
 * every request, and only our own pages (or a direct navigation) may write.
 */
export function assertSameOrigin(headers: Headers) {
	const site = headers.get("sec-fetch-site");
	if (site !== null && site !== "same-origin" && site !== "none") {
		throw new TRPCError({ code: "FORBIDDEN", message: "CROSS_SITE" });
	}
}

/** Reads one cookie from the request headers. */
export function readCookie(headers: Headers, name: string): string | null {
	for (const part of (headers.get("cookie") ?? "").split(";")) {
		const [key, ...rest] = part.trim().split("=");
		if (key === name) {
			const value = rest.join("=");
			return /^[A-Za-z0-9_-]{20,128}$/.test(value) ? value : null;
		}
	}
	return null;
}
