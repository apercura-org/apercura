/**
 * Signed cache revalidation requests (import -> web app).
 *
 * The sender signs `{timestamp}.{body}` with HMAC-SHA256 and the shared
 * REVALIDATE_SECRET. The receiver rejects stale timestamps (replays) and
 * compares signatures in constant time.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const REVALIDATE_SIGNATURE_HEADER = "x-apercura-signature";
export const REVALIDATE_TIMESTAMP_HEADER = "x-apercura-timestamp";

/** Maximum number of tags in one request. */
export const REVALIDATE_MAX_TAGS = 100;
/** Next.js rejects longer cache tags. */
export const REVALIDATE_MAX_TAG_LENGTH = 256;
/** Accepted clock skew between sender and receiver, in seconds. */
export const REVALIDATE_MAX_SKEW_SECONDS = 300;

/**
 * The tag of every sitemap query. The import sends it with any change, and the app expires
 * it at once (`expire: 0`) instead of serving the old sitemaps once more.
 */
export const SITEMAP_CACHE_TAG = "sitemap";

export function signRevalidation(secret: string, timestamp: number, body: string): string {
	return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export type RevalidationCheck =
	| { ok: true }
	| { ok: false; reason: "missing" | "stale" | "mismatch" };

export function verifyRevalidation(input: {
	secret: string;
	body: string;
	signature: string | null;
	timestamp: string | null;
	now?: number;
}): RevalidationCheck {
	if (!input.signature || !input.timestamp || !/^\d{1,12}$/.test(input.timestamp)) {
		return { ok: false, reason: "missing" };
	}
	const timestamp = Number(input.timestamp);
	const now = Math.floor((input.now ?? Date.now()) / 1000);
	if (Math.abs(now - timestamp) > REVALIDATE_MAX_SKEW_SECONDS) {
		return { ok: false, reason: "stale" };
	}
	const expected = Buffer.from(signRevalidation(input.secret, timestamp, input.body), "hex");
	const received = /^[0-9a-f]{64}$/i.test(input.signature)
		? Buffer.from(input.signature, "hex")
		: Buffer.alloc(0);
	if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
		return { ok: false, reason: "mismatch" };
	}
	return { ok: true };
}

/** Validates the tag list of a revalidation request body. */
export function parseRevalidationTags(value: unknown): string[] | null {
	if (typeof value !== "object" || value === null) return null;
	const tags = (value as { tags?: unknown }).tags;
	if (!Array.isArray(tags) || tags.length === 0 || tags.length > REVALIDATE_MAX_TAGS) return null;
	for (const tag of tags) {
		if (typeof tag !== "string" || tag.length === 0 || tag.length > REVALIDATE_MAX_TAG_LENGTH) {
			return null;
		}
	}
	return [...new Set(tags as string[])];
}
