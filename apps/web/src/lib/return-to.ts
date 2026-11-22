/**
 * Where to go back after signing in or up, carried as `?suite=` through the
 * sign-in, second-factor, enrolment, sign-up and email-confirmation pages.
 *
 * Only an allowlist of internal practitioner-space paths is accepted, parsed
 * into a typed route (never echoed back as a raw string), so the parameter
 * can never become an open redirect: the claim of one RPPS, or one team
 * invitation (an invited person creates their account first).
 */

export const RETURN_PARAM = "suite";

export type ReturnTo =
	| { pathname: "/pro/revendiquer"; query: { rpps: string } }
	| { pathname: "/pro/revendiquer/[id]"; params: { id: string } }
	| { pathname: "/pro/invitation/[id]"; params: { id: string } };

const CLAIM_START = /^(?:\/en)?\/pro\/revendiquer$/;
const CLAIM =
	/^(?:\/en)?\/pro\/revendiquer\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const INVITATION =
	/^(?:\/en)?\/pro\/invitation\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const RPPS = /^\d{11}$/;

/** The allowlisted route a `?suite=` value designates, or null for anything else. */
export function parseReturnTo(raw: unknown): ReturnTo | null {
	if (typeof raw !== "string" || raw.length > 200) return null;
	// Relative paths only: no scheme, no host, no protocol-relative or backslash tricks.
	if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
	let url: URL;
	try {
		url = new URL(raw, "http://internal.invalid");
	} catch {
		return null;
	}
	if (url.origin !== "http://internal.invalid" || url.hash) return null;
	if (CLAIM_START.test(url.pathname)) {
		const rpps = url.searchParams.get("rpps") ?? "";
		const keys = [...url.searchParams.keys()];
		if (!RPPS.test(rpps) || keys.length !== 1) return null;
		return { pathname: "/pro/revendiquer", query: { rpps } };
	}
	const claim = CLAIM.exec(url.pathname);
	if (claim?.[1] && url.search === "") {
		return { pathname: "/pro/revendiquer/[id]", params: { id: claim[1] } };
	}
	const invitation = INVITATION.exec(url.pathname);
	if (invitation?.[1] && url.search === "") {
		return { pathname: "/pro/invitation/[id]", params: { id: invitation[1] } };
	}
	return null;
}

/** The `?suite=` value of a route (locale-free: these paths are the same in every locale). */
export function serializeReturnTo(target: ReturnTo): string {
	switch (target.pathname) {
		case "/pro/revendiquer":
			return `/pro/revendiquer?rpps=${target.query.rpps}`;
		case "/pro/revendiquer/[id]":
			return `/pro/revendiquer/${target.params.id}`;
		case "/pro/invitation/[id]":
			return `/pro/invitation/${target.params.id}`;
	}
}

/** Adds `?suite=` to a route's query when there is somewhere to come back to. */
export function withReturnTo<Path extends string>(
	pathname: Path,
	target: ReturnTo | null,
): { pathname: Path; query?: Record<string, string> } {
	return target ? { pathname, query: { [RETURN_PARAM]: serializeReturnTo(target) } } : { pathname };
}

/** In the browser: the allowlisted return target of the current URL, if any. */
export function currentReturnTo(): ReturnTo | null {
	if (typeof window === "undefined") return null;
	return parseReturnTo(new URLSearchParams(window.location.search).get(RETURN_PARAM));
}
