/**
 * Cross-site request refusal for every state-changing request the app serves
 * itself (tRPC, uploads). Session cookies are `SameSite=Lax`, which already
 * keeps them off cross-site POSTs; this also refuses same-site ones (a sibling
 * subdomain of a shared hosting domain) and requests that carry no cookie.
 *
 * Browsers send `Sec-Fetch-Site` on every request: only `same-origin` (our
 * pages) and `none` (typed by the person) may write. Older browsers send
 * `Origin` instead, which must be ours. Requests with neither header are not
 * from a browser page (server calls, scripts) and are let through: they
 * cannot ride on a visitor's cookies.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isCrossSiteWrite(
	request: { method: string; headers: Headers; url: string },
	allowedOrigins: readonly (string | undefined)[],
): boolean {
	if (SAFE_METHODS.has(request.method.toUpperCase())) return false;
	const site = request.headers.get("sec-fetch-site");
	if (site !== null) return site !== "same-origin" && site !== "none";
	const origin = request.headers.get("origin");
	if (origin === null) return false;
	const allowed = new Set<string>();
	for (const candidate of [...allowedOrigins, request.url]) {
		if (!candidate) continue;
		try {
			allowed.add(new URL(candidate).origin);
		} catch {
			// Ignore an unparsable configuration value.
		}
	}
	return !allowed.has(origin);
}

/** The app's own origins: APP_URL and, when set apart, BETTER_AUTH_URL. */
export function appOrigins(env: NodeJS.ProcessEnv = process.env): (string | undefined)[] {
	return [env.APP_URL, env.BETTER_AUTH_URL];
}

/** 403 for a cross-site write, or null when the request may proceed. */
export function refuseCrossSite(request: Request): Response | null {
	if (!isCrossSiteWrite(request, appOrigins())) return null;
	return Response.json({ error: "CROSS_SITE" }, { status: 403 });
}
