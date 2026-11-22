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
	options: { ipv6Prefix64?: boolean } = {},
): string {
	const resolved = resolveClientIp(
		headers.get("x-forwarded-for"),
		trustedProxyCount(env.TRUSTED_PROXY_COUNT),
	);
	const ip = resolved ? (options.ipv6Prefix64 ? ipBucket(resolved) : resolved) : "direct";
	const digest = createHmac("sha256", hmacKey(env.RATE_LIMIT_KEY)).update(ip).digest("base64url");
	return `${scope}:${digest}`;
}

/**
 * The bucket of an address for per-client limits: an IPv4 address itself (IPv4-mapped IPv6
 * included), or the /64 prefix of an IPv6 address, since one subscriber usually gets a whole /64.
 */
export function ipBucket(ip: string): string {
	const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
	if (mapped?.[1]) {
		return mapped[1];
	}
	if (!ip.includes(":")) {
		return ip;
	}
	const [head = "", tail] = ip.toLowerCase().split("::");
	const left = head ? head.split(":") : [];
	const right = tail === undefined ? [] : tail ? tail.split(":") : [];
	const missing = Math.max(0, 8 - left.length - right.length);
	const groups = [...left, ...Array<string>(missing).fill("0"), ...right];
	return `${groups
		.slice(0, 4)
		.map((group) => group.replace(/^0+(?=.)/, ""))
		.join(":")}::/64`;
}

/**
 * Rate-limit key of an email address for `scope` (sign-in attempts, sign-up and
 * verification emails per address): a keyed hash of the trimmed, lowercased
 * address, so the table never holds the address itself.
 */
export function emailRateLimitKey(
	scope: string,
	email: string,
	env: { RATE_LIMIT_KEY?: string | undefined } = { RATE_LIMIT_KEY: process.env.RATE_LIMIT_KEY },
): string {
	const digest = createHmac("sha256", hmacKey(env.RATE_LIMIT_KEY))
		.update(`email:${email.trim().toLowerCase()}`)
		.digest("base64url");
	return `${scope}:${digest}`;
}
