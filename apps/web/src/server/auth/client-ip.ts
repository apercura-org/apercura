/**
 * Client IP resolution behind a known number of reverse proxies.
 *
 * Each proxy appends the address it received the request from to
 * `X-Forwarded-For`, so with N trusted proxies the client is the N-th entry
 * from the right. Entries further left are written by the client and ignored.
 * With no trusted proxy the header is not trusted at all.
 */

/** Header Better Auth reads the client IP from. Always rewritten by us, never taken from the client. */
export const CLIENT_IP_HEADER = "x-apercura-client-ip";

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6 = /^[0-9a-f:.]+$/i;

function isIp(value: string) {
	return IPV4.test(value) || (value.includes(":") && IPV6.test(value));
}

export function resolveClientIp(forwardedFor: string | null, trustedProxyCount: number) {
	if (!forwardedFor || !Number.isInteger(trustedProxyCount) || trustedProxyCount < 1) {
		return null;
	}
	const hops = forwardedFor
		.split(",")
		.map((hop) => hop.trim())
		.filter(Boolean);
	const candidate = hops[hops.length - trustedProxyCount];
	return candidate && isIp(candidate) ? candidate : null;
}

/** Copies the request headers with our client IP header set (or removed). */
export function withClientIpHeader(headers: Headers, trustedProxyCount: number): Headers {
	const next = new Headers(headers);
	next.delete(CLIENT_IP_HEADER);
	const ip = resolveClientIp(headers.get("x-forwarded-for"), trustedProxyCount);
	if (ip) {
		next.set(CLIENT_IP_HEADER, ip);
	}
	return next;
}

/** Reads TRUSTED_PROXY_COUNT defensively (it is unvalidated in builds that skip env validation). */
export function trustedProxyCount(value: unknown): number {
	const count = Number(value ?? 0);
	return Number.isInteger(count) && count > 0 ? count : 0;
}
