import "server-only";
import {
	type DataKey,
	decryptBytes,
	decryptField,
	encryptBytes,
	encryptField,
	fieldAad,
	type Keyring,
	parseKeyring,
} from "@apercura/core/crypto";
import { serverEnv } from "~/env";

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

let keyring: Keyring | undefined;

/** True when ENCRYPTION_KEYS and ENCRYPTION_ACTIVE_KEY are set. */
export function platformKeyConfigured(): boolean {
	return Boolean(serverEnv.ENCRYPTION_KEYS && serverEnv.ENCRYPTION_ACTIVE_KEY);
}

function getKeyring(): Keyring {
	keyring ??= parseKeyring(serverEnv.ENCRYPTION_KEYS, serverEnv.ENCRYPTION_ACTIVE_KEY);
	return keyring;
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

/** For tests: forget the parsed keyring. */
export function resetPlatformKeyring() {
	keyring = undefined;
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
