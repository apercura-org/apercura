import { createHmac, randomBytes } from "node:crypto";
import { resolveClientIp, trustedProxyCount } from "./auth/client-ip";

/** Random key for this process when RATE_LIMIT_KEY is not configured. */
let processKey: Buffer | undefined;

function hmacKey(configured: string | undefined): string | Buffer {
	if (configured) return configured;
	processKey ??= randomBytes(32);
	return processKey;
}

/**
 * Rate-limit key of an anonymous client for `scope`: a keyed hash (HMAC-SHA256
 * with RATE_LIMIT_KEY) of its IP address, so the table never holds a raw IP.
 * The IP is read through TRUSTED_PROXY_COUNT proxies only; without a trusted
 * proxy every client shares one bucket, since the app cannot tell them apart.
 */
export function clientRateLimitKey(
	scope: string,
	headers: Headers,
	env: { RATE_LIMIT_KEY?: string | undefined; TRUSTED_PROXY_COUNT?: unknown } = {
		RATE_LIMIT_KEY: process.env.RATE_LIMIT_KEY,
		TRUSTED_PROXY_COUNT: process.env.TRUSTED_PROXY_COUNT,
	},
): string {
	const ip =
		resolveClientIp(headers.get("x-forwarded-for"), trustedProxyCount(env.TRUSTED_PROXY_COUNT)) ??
		"direct";
	const digest = createHmac("sha256", hmacKey(env.RATE_LIMIT_KEY)).update(ip).digest("base64url");
	return `${scope}:${digest}`;
}
