/// <reference types="node" />
import type { Buffer } from "node:buffer";
import { decodeKey } from "./encoding";

/** Key ids appear in ciphertext tokens, so they are restricted to a URL-safe alphabet. */
export const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

/** Master keys (KEKs) by id, and the id used to wrap new data keys. */
export interface Keyring {
	readonly activeId: string;
	readonly keys: ReadonlyMap<string, Buffer>;
}

/**
 * Parses `ENCRYPTION_KEYS` (comma-separated `<id>:<base64 32-byte key>`, e.g. `1:…,2:…`) and
 * `ENCRYPTION_ACTIVE_KEY`. Old keys stay in the list after a rotation so existing data keys can
 * still be unwrapped.
 *
 * @throws RangeError on an empty list, a malformed entry, a duplicate id or an unknown active id.
 */
export function parseKeyring(
	encryptionKeys: string | undefined,
	activeKeyId: string | undefined,
): Keyring {
	const entries = (encryptionKeys ?? "")
		.split(",")
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
	if (entries.length === 0) {
		throw new RangeError("ENCRYPTION_KEYS is empty");
	}
	const keys = new Map<string, Buffer>();
	for (const [index, entry] of entries.entries()) {
		const separator = entry.indexOf(":");
		const id = separator === -1 ? "" : entry.slice(0, separator).trim();
		if (!KEY_ID_PATTERN.test(id)) {
			throw new RangeError(`ENCRYPTION_KEYS entry #${index + 1} must look like <id>:<base64 key>`);
		}
		if (keys.has(id)) {
			throw new RangeError(`ENCRYPTION_KEYS has a duplicate key id "${id}"`);
		}
		keys.set(id, decodeKey(entry.slice(separator + 1), `ENCRYPTION_KEYS key "${id}"`));
	}
	const activeId = (activeKeyId ?? "").trim();
	if (!keys.has(activeId)) {
		throw new RangeError(`ENCRYPTION_ACTIVE_KEY "${activeId}" is not in ENCRYPTION_KEYS`);
	}
	return { activeId, keys };
}
