import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { serverEnv } from "~/env";
import { getDb } from "~/server/db";
import { trustedProxyCount, withClientIpHeader } from "./client-ip";
import { getAuth } from "./index";
import { hasSecondFactor, secondFactors } from "./membership";

/** Reads the session for a set of request headers (tRPC context, route handlers). */
export async function getSessionFor(requestHeaders: Headers) {
	return getAuth().api.getSession({
		headers: withClientIpHeader(requestHeaders, trustedProxyCount(serverEnv.TRUSTED_PROXY_COUNT)),
	});
}

/** The current request's session in Server Components, read once per request. */
export const getServerSession = cache(async () => getSessionFor(await headers()));

export type ProAccess =
	| { state: "signed-out" }
	/** Signed in with a password only and no second factor yet: must enrol one. */
	| { state: "enrol"; session: NonNullable<Awaited<ReturnType<typeof getSessionFor>>> }
	/** Has a second factor but this session has not proved it. */
	| { state: "challenge"; session: NonNullable<Awaited<ReturnType<typeof getSessionFor>>> }
	| { state: "ready"; session: NonNullable<Awaited<ReturnType<typeof getSessionFor>>> };

/**
 * Where the current visitor stands with strong authentication. Pages use it
 * to redirect; every tRPC procedure checks again on its own.
 */
export const getProAccess = cache(async (): Promise<ProAccess> => {
	const session = await getServerSession();
	if (!session) {
		return { state: "signed-out" };
	}
	if (session.session.mfaVerifiedAt) {
		return { state: "ready", session };
	}
	const factors = await secondFactors(getDb(), session.user.id);
	return hasSecondFactor(factors) ? { state: "challenge", session } : { state: "enrol", session };
});
