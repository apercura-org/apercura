import "server-only";
import {
	blobKeyVersion,
	type DataKey,
	decryptBytes,
	decryptField,
	encryptBytes,
	encryptField,
	fieldAad,
	type Keyring,
	parseKeyring,
	tokenKeyVersion,
} from "@apercura/core/crypto";

/*
 * The only module besides ~/server/phi allowed to import the crypto package
 * (see biome.json): it never touches patient data. It also hands the claims
 * their token and one-time-code helpers, so nothing else imports the crypto.
 *
 * The platform key: data that belongs to no practice (claim documents, the
 * free text of reports and removal requests) is encrypted with the master
 * keys of ENCRYPTION_KEYS directly, the active one for new data. The AAD binds
 * every ciphertext to its table, column and row, and is distinct from the
 * `organization_keys.dek` AAD used to wrap practice keys.
 */

let cached: { source: string; keyring: Keyring } | undefined;

/** True when ENCRYPTION_KEYS and ENCRYPTION_ACTIVE_KEY are set. */
export function platformKeyConfigured(): boolean {
	return Boolean(process.env.ENCRYPTION_KEYS && process.env.ENCRYPTION_ACTIVE_KEY);
}

/** The master keys, re-read when the environment changes (as in ~/server/phi/keys). */
function getKeyring(): Keyring {
	const source = `${process.env.ENCRYPTION_KEYS ?? ""}|${process.env.ENCRYPTION_ACTIVE_KEY ?? ""}`;
	if (cached?.source !== source) {
		cached = {
			source,
			keyring: parseKeyring(process.env.ENCRYPTION_KEYS, process.env.ENCRYPTION_ACTIVE_KEY),
		};
	}
	return cached.keyring;
}

function activeKey(): DataKey {
	const ring = getKeyring();
	return { version: ring.activeId, key: ring.keys.get(ring.activeId) as Uint8Array };
}

function allKeys(): DataKey[] {
	return [...getKeyring().keys].map(([version, key]) => ({ version, key }));
}

const aadOf = (table: string, column: string, rowId: string) =>
	`platform:${fieldAad(table, column, rowId)}`;

export function sealText(text: string, table: string, column: string, rowId: string): string {
	return encryptField(text, activeKey(), aadOf(table, column, rowId));
}

export function openText(token: string, table: string, column: string, rowId: string): string {
	return decryptField(token, allKeys(), aadOf(table, column, rowId));
}

export function sealBytes(bytes: Uint8Array, table: string, column: string, rowId: string) {
	return encryptBytes(bytes, activeKey(), aadOf(table, column, rowId));
}

export function openBytes(blob: Uint8Array, table: string, column: string, rowId: string) {
	return decryptBytes(blob, allKeys(), aadOf(table, column, rowId));
}

/**
 * Key rotation: the same text under the active master key, or null when it
 * already is (see ~/server/keys/rotation).
 */
export function resealText(token: string, table: string, column: string, rowId: string) {
	if (tokenKeyVersion(token) === getKeyring().activeId) return null;
	return sealText(openText(token, table, column, rowId), table, column, rowId);
}

/** Key rotation: the same bytes under the active master key, or null when they already are. */
export function resealBytes(blob: Uint8Array, table: string, column: string, rowId: string) {
	if (blobKeyVersion(blob) === getKeyring().activeId) return null;
	return sealBytes(openBytes(blob, table, column, rowId), table, column, rowId);
}

/** For tests: forget the parsed keyring. */
export function resetPlatformKeyring() {
	cached = undefined;
}

export {
	generateManageToken,
	generateOtp,
	generateOtpSalt,
	hashOtp,
	hashToken,
	safeEqual,
	verifyOtp,
} from "@apercura/core/crypto";
