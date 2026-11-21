import "server-only";
import { createHmac, hkdfSync } from "node:crypto";
import {
	type DataKey,
	decodeKey,
	deriveBlindIndexKey,
	type Keyring,
	parseKeyring,
} from "@apercura/core/crypto";

/*
 * Key material of the application-level encryption, read from the environment
 * on first use: master keys (ENCRYPTION_KEYS, ENCRYPTION_ACTIVE_KEY) and the
 * blind-index key (BLIND_INDEX_KEY). Nothing here ever leaves `server/phi`.
 */

let cachedKeyring: { source: string; keyring: Keyring } | undefined;
let cachedBlindKey: { source: string; key: Buffer } | undefined;
const orgIndexKeys = new Map<string, Buffer>();

/** Unwrapped organization data keys, by organization, newest version first. */
export const dataKeyCache = new Map<string, DataKey[]>();

/** Whether booking can encrypt: the three variables are set. */
export function phiConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
	return Boolean(env.ENCRYPTION_KEYS && env.ENCRYPTION_ACTIVE_KEY && env.BLIND_INDEX_KEY);
}

export function keyring(): Keyring {
	const source = `${process.env.ENCRYPTION_KEYS ?? ""}|${process.env.ENCRYPTION_ACTIVE_KEY ?? ""}`;
	if (cachedKeyring?.source !== source) {
		cachedKeyring = {
			source,
			keyring: parseKeyring(process.env.ENCRYPTION_KEYS, process.env.ENCRYPTION_ACTIVE_KEY),
		};
		dataKeyCache.clear();
	}
	return cachedKeyring.keyring;
}

function blindIndexMasterKey(): Buffer {
	const source = process.env.BLIND_INDEX_KEY ?? "";
	if (cachedBlindKey?.source !== source) {
		cachedBlindKey = { source, key: decodeKey(source, "BLIND_INDEX_KEY") };
		orgIndexKeys.clear();
	}
	return cachedBlindKey.key;
}

/** HKDF key of one organization's blind indexes. */
export function organizationIndexKey(organizationId: string): Buffer {
	const master = blindIndexMasterKey();
	let key = orgIndexKeys.get(organizationId);
	if (key === undefined) {
		key = deriveBlindIndexKey(master, organizationId);
		orgIndexKeys.set(organizationId, key);
	}
	return key;
}

/**
 * Key that derives manage tokens (HKDF of BLIND_INDEX_KEY with its own salt and info, so it is
 * unrelated to any blind-index key).
 */
export function manageTokenKey(): Buffer {
	return Buffer.from(
		hkdfSync(
			"sha256",
			blindIndexMasterKey(),
			Buffer.from("apercura.manage-token", "utf8"),
			Buffer.from("manage-token:v1", "utf8"),
			32,
		),
	);
}

/** HMAC-SHA256 with the manage-token key, as base64url (43 characters, 256 bits). */
export function manageTokenMac(message: string): string {
	return createHmac("sha256", manageTokenKey()).update(message, "utf8").digest("base64url");
}
