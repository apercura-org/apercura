/// <reference types="node" />
import { Buffer } from "node:buffer";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { type DataKey, DecryptionError } from "./envelope";
import { KEY_ID_PATTERN } from "./keyring";

/**
 * Binary counterpart of `encryptField` for files (claim documents): AES-256-GCM
 * with a random 12-byte IV, the key version in the header and the AAD bound
 * to the object. Layout: `APB1` | version length (1 byte) | version | IV |
 * ciphertext | tag.
 */
const MAGIC = Buffer.from("APB1", "ascii");
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function associatedData(version: string, aad: string): Buffer {
	return Buffer.from(`blob:v1:${version}:${aad}`, "utf8");
}

export function encryptBytes(plaintext: Uint8Array, key: DataKey, aad: string): Buffer {
	if (key.key.length !== 32) throw new RangeError("Data key must be 32 bytes");
	if (!KEY_ID_PATTERN.test(key.version)) throw new RangeError("Invalid key version");
	if (!aad) throw new RangeError("aad is required");
	const version = Buffer.from(key.version, "ascii");
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, key.key, iv, { authTagLength: TAG_LENGTH });
	cipher.setAAD(associatedData(key.version, aad));
	return Buffer.concat([
		MAGIC,
		Buffer.from([version.length]),
		version,
		iv,
		cipher.update(plaintext),
		cipher.final(),
		cipher.getAuthTag(),
	]);
}

/** Key version recorded in a blob's header, without decrypting it. */
export function blobKeyVersion(blob: Uint8Array): string {
	const data = Buffer.from(blob.buffer, blob.byteOffset, blob.byteLength);
	const versionLength = data[MAGIC.length] ?? 0;
	if (versionLength === 0 || !data.subarray(0, MAGIC.length).equals(MAGIC)) {
		throw new DecryptionError("Malformed encrypted blob");
	}
	return data.subarray(MAGIC.length + 1, MAGIC.length + 1 + versionLength).toString("ascii");
}

/** @throws DecryptionError on a malformed blob, an unknown key version, tampering or a wrong AAD. */
export function decryptBytes(
	blob: Uint8Array,
	keys: DataKey | readonly DataKey[],
	aad: string,
): Buffer {
	const data = Buffer.from(blob.buffer, blob.byteOffset, blob.byteLength);
	if (data.length < MAGIC.length + 1 || !data.subarray(0, MAGIC.length).equals(MAGIC)) {
		throw new DecryptionError("Malformed encrypted blob");
	}
	const versionLength = data[MAGIC.length] ?? 0;
	const headerLength = MAGIC.length + 1 + versionLength;
	if (versionLength === 0 || data.length < headerLength + IV_LENGTH + TAG_LENGTH) {
		throw new DecryptionError("Malformed encrypted blob");
	}
	const version = data.subarray(MAGIC.length + 1, headerLength).toString("ascii");
	const candidates: readonly DataKey[] = Array.isArray(keys) ? keys : [keys as DataKey];
	const key = candidates.find((candidate) => candidate.version === version);
	if (!key) throw new DecryptionError(`Unknown key version "${version}"`);
	const iv = data.subarray(headerLength, headerLength + IV_LENGTH);
	const tag = data.subarray(data.length - TAG_LENGTH);
	const body = data.subarray(headerLength + IV_LENGTH, data.length - TAG_LENGTH);
	try {
		const decipher = createDecipheriv(ALGORITHM, key.key, iv, { authTagLength: TAG_LENGTH });
		decipher.setAAD(associatedData(version, aad));
		decipher.setAuthTag(tag);
		return Buffer.concat([decipher.update(body), decipher.final()]);
	} catch {
		throw new DecryptionError();
	}
}
