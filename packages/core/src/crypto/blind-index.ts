/// <reference types="node" />
import { Buffer } from "node:buffer";
import { createHmac, hkdfSync } from "node:crypto";
import { normalizeEmail, normalizePhone } from "./phone";

export type BlindIndexKind = "email" | "phone";

const HKDF_SALT = Buffer.from("apercura.blind-index", "utf8");
const KEY_LENGTH = 32;

/**
 * Derives the blind-index key of one organization from `BLIND_INDEX_KEY` with HKDF-SHA256.
 * Different organizations get unrelated indexes, so a patient cannot be linked across practices.
 */
export function deriveBlindIndexKey(masterKey: Uint8Array, organizationId: string): Buffer {
	if (masterKey.length < KEY_LENGTH) {
		throw new RangeError(`Blind index master key must be at least ${KEY_LENGTH} bytes`);
	}
	if (organizationId.length === 0) {
		throw new RangeError("organizationId is required");
	}
	const info = Buffer.from(`blind-index:v1:${organizationId}`, "utf8");
	return Buffer.from(hkdfSync("sha256", masterKey, HKDF_SALT, info, KEY_LENGTH));
}

/**
 * Keyed, searchable fingerprint of an email or phone number: HMAC-SHA256 of the normalized value
 * (see `normalizeEmail`, `normalizePhone`), truncated to 128 bits, as 32 hex characters.
 *
 * @throws RangeError when the value cannot be normalized.
 */
export function blindIndex(value: string, key: Uint8Array, kind: BlindIndexKind): string {
	const normalized = kind === "email" ? normalizeEmail(value) : normalizePhone(value);
	return createHmac("sha256", key)
		.update(`${kind}:${normalized}`, "utf8")
		.digest("hex")
		.slice(0, 32);
}
