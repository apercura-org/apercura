/// <reference types="node" />
import { Buffer } from "node:buffer";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { decodeBase64Url } from "./encoding";
import { KEY_ID_PATTERN, type Keyring } from "./keyring";

const PREFIX = "enc";
const FORMAT = "v1";
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/** Default associated data of a wrapped data key; pass `organization_keys.dek.<orgId>` to bind it. */
export const DEK_AAD = "organization_keys.dek";

/** Thrown when a token is malformed, was tampered with, or does not match its key or AAD. */
export class DecryptionError extends Error {
	constructor(message = "Decryption failed") {
		super(message);
		this.name = "DecryptionError";
	}
}

/** An organization data key and its version (as stored in `organization_keys`). */
export interface DataKey {
	version: string;
	key: Uint8Array;
}

interface ParsedToken {
	version: string;
	iv: Buffer;
	sealed: Buffer;
}

function assertKey(key: Uint8Array, what: string): void {
	if (key.length !== KEY_LENGTH) {
		throw new RangeError(`${what} must be ${KEY_LENGTH} bytes`);
	}
}

function assertVersion(version: string): void {
	if (!KEY_ID_PATTERN.test(version)) {
		throw new RangeError(`Invalid key version "${version}"`);
	}
}

function associatedData(version: string, aad: string): Buffer {
	return Buffer.from(`${PREFIX}:${FORMAT}:${version}:${aad}`, "utf8");
}

function seal(key: Uint8Array, version: string, plaintext: Uint8Array, aad: string): string {
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
	cipher.setAAD(associatedData(version, aad));
	const sealed = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
	return `${PREFIX}:${FORMAT}:${version}:${iv.toString("base64url")}:${sealed.toString("base64url")}`;
}

/** Splits an `enc:v1:{version}:{iv}:{ciphertext+tag}` token. */
function parseToken(token: string): ParsedToken {
	const parts = token.split(":");
	if (parts.length !== 5 || parts[0] !== PREFIX || parts[1] !== FORMAT) {
		throw new DecryptionError("Malformed encrypted token");
	}
	const [, , version = "", iv = "", sealed = ""] = parts;
	try {
		assertVersion(version);
		const parsed = {
			version,
			iv: decodeBase64Url(iv, "IV"),
			sealed: decodeBase64Url(sealed, "Ciphertext"),
		};
		if (parsed.iv.length !== IV_LENGTH || parsed.sealed.length < TAG_LENGTH) {
			throw new RangeError("Bad lengths");
		}
		return parsed;
	} catch {
		throw new DecryptionError("Malformed encrypted token");
	}
}

function open(key: Uint8Array, token: ParsedToken, aad: string): Buffer {
	try {
		const decipher = createDecipheriv(ALGORITHM, key, token.iv, { authTagLength: TAG_LENGTH });
		decipher.setAAD(associatedData(token.version, aad));
		decipher.setAuthTag(token.sealed.subarray(token.sealed.length - TAG_LENGTH));
		const body = token.sealed.subarray(0, token.sealed.length - TAG_LENGTH);
		return Buffer.concat([decipher.update(body), decipher.final()]);
	} catch {
		throw new DecryptionError();
	}
}

/** Key or data-key version recorded in a token, without decrypting it. */
export function tokenKeyVersion(token: string): string {
	return parseToken(token).version;
}

/** A fresh random 32-byte data key (DEK). */
export function generateDek(): Buffer {
	return randomBytes(KEY_LENGTH);
}

/** Encrypts a data key with the active master key; the token records the master key id. */
export function wrapDek(dek: Uint8Array, keyring: Keyring, aad: string = DEK_AAD): string {
	assertKey(dek, "Data key");
	const kek = keyring.keys.get(keyring.activeId);
	if (kek === undefined) {
		throw new RangeError(`Active key "${keyring.activeId}" is missing from the keyring`);
	}
	return seal(kek, keyring.activeId, dek, aad);
}

/** Decrypts a wrapped data key with the master key whose id the token records. */
export function unwrapDek(wrapped: string, keyring: Keyring, aad: string = DEK_AAD): Buffer {
	const token = parseToken(wrapped);
	const kek = keyring.keys.get(token.version);
	if (kek === undefined) {
		throw new DecryptionError(`Unknown master key id "${token.version}"`);
	}
	const dek = open(kek, token, aad);
	if (dek.length !== KEY_LENGTH) {
		throw new DecryptionError();
	}
	return dek;
}

/** Whether a wrapped data key should be re-wrapped with the active master key. */
export function needsRewrap(wrapped: string, keyring: Keyring): boolean {
	return tokenKeyVersion(wrapped) !== keyring.activeId;
}

/** Associated data of an encrypted column: `table.column.rowId`. */
export function fieldAad(table: string, column: string, rowId: string): string {
	if (!table || !column || !rowId) {
		throw new RangeError("table, column and rowId are required");
	}
	return `${table}.${column}.${rowId}`;
}

/**
 * Encrypts a field with AES-256-GCM and a random 12-byte IV. `aad` (see {@link fieldAad}) binds the
 * ciphertext to its row and column, so it cannot be moved elsewhere.
 */
export function encryptField(plaintext: string, dek: DataKey, aad: string): string {
	assertKey(dek.key, "Data key");
	assertVersion(dek.version);
	return seal(dek.key, dek.version, Buffer.from(plaintext, "utf8"), aad);
}

/**
 * Decrypts a field. Pass every live data-key version during a rotation; the token says which one
 * to use.
 *
 * @throws DecryptionError on tampering, a wrong AAD, or an unknown key version.
 */
export function decryptField(
	token: string,
	dek: DataKey | readonly DataKey[],
	aad: string,
): string {
	const parsed = parseToken(token);
	const candidates: readonly DataKey[] = Array.isArray(dek) ? dek : [dek as DataKey];
	const match = candidates.find((candidate) => candidate.version === parsed.version);
	if (match === undefined) {
		throw new DecryptionError(`Unknown data key version "${parsed.version}"`);
	}
	return open(match.key, parsed, aad).toString("utf8");
}
