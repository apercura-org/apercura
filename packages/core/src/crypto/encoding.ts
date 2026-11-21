/// <reference types="node" />
import { Buffer } from "node:buffer";

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** Decodes canonical, unpadded base64url; anything else throws. */
export function decodeBase64Url(value: string, what: string): Buffer {
	if (BASE64URL.test(value)) {
		const bytes = Buffer.from(value, "base64url");
		if (bytes.toString("base64url") === value) {
			return bytes;
		}
	}
	throw new RangeError(`${what} is not valid base64url`);
}

/**
 * Decodes a standard base64 key (as printed by `bun run keys:generate`) and checks its length.
 * Error messages never include the key material.
 */
export function decodeKey(value: string, what: string, length = 32): Buffer {
	const trimmed = value.trim();
	const bytes = Buffer.from(trimmed, "base64");
	if (trimmed.length === 0 || bytes.toString("base64") !== trimmed) {
		throw new RangeError(`${what} is not valid base64`);
	}
	if (bytes.length !== length) {
		throw new RangeError(`${what} must decode to ${length} bytes, got ${bytes.length}`);
	}
	return bytes;
}
