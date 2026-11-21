/**
 * Pure parts of the rate limiter, kept apart so they can be unit tested
 * without a database.
 */

/** Start of the fixed window that contains `nowMs`. */
export function windowStart(nowMs: number, windowSeconds: number): Date {
	const size = windowSeconds * 1000;
	return new Date(Math.floor(nowMs / size) * size);
}

/**
 * Client IP address as seen through `trustedProxies` reverse proxies: the
 * entry of `X-Forwarded-For` added by the outermost trusted proxy. With no
 * trusted proxy the header is ignored (anyone can forge it) and every client
 * shares one key: the app cannot tell clients apart without a proxy.
 */
export function clientIp(headers: Headers, trustedProxies: number): string {
	if (trustedProxies > 0) {
		const chain = (headers.get("x-forwarded-for") ?? "")
			.split(",")
			.map((entry) => entry.trim())
			.filter(Boolean);
		const ip = chain[chain.length - trustedProxies];
		if (ip) return ip;
	}
	return "direct";
}
