/// <reference types="node" />
import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	type DataKey,
	DecryptionError,
	decryptField,
	encryptField,
	fieldAad,
	generateDek,
	needsRewrap,
	tokenKeyVersion,
	unwrapDek,
	wrapDek,
} from "./envelope";
import { parseKeyring } from "./keyring";

const key = () => randomBytes(32).toString("base64");
const K1 = key();
const K2 = key();

describe("parseKeyring", () => {
	it("parses the comma-separated <id>:<base64> format of keys:generate", () => {
		const keyring = parseKeyring(`1:${K1}, 2:${K2}`, "2");
		expect(keyring.activeId).toBe("2");
		expect([...keyring.keys.keys()]).toEqual(["1", "2"]);
		expect(keyring.keys.get("1")).toEqual(Buffer.from(K1, "base64"));
	});

	it.each([
		["", "1"],
		[undefined, "1"],
		[`1:${K1}`, "2"],
		[`1:${K1}`, undefined],
		[`1:${K1},1:${K2}`, "1"],
		[K1, "1"],
		["1:not-base64!", "1"],
		[`1:${randomBytes(16).toString("base64")}`, "1"],
		[`a:b:${K1}`, "a"],
	])("rejects %j with active key %j", (keys, active) => {
		expect(() => parseKeyring(keys, active)).toThrow(RangeError);
	});

	it("never puts key material in error messages", () => {
		const short = randomBytes(16).toString("base64");
		expect(() => parseKeyring(`1:${short}`, "1")).toThrow(
			expect.objectContaining({ message: expect.not.stringContaining(short) }),
		);
	});
});

describe("data key wrapping", () => {
	it("round-trips and records the master key id", () => {
		const keyring = parseKeyring(`1:${K1}`, "1");
		const dek = generateDek();
		expect(dek).toHaveLength(32);
		const wrapped = wrapDek(dek, keyring);
		expect(wrapped).toMatch(/^enc:v1:1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]+$/);
		expect(unwrapDek(wrapped, keyring)).toEqual(dek);
	});

	it("keeps old wraps readable after a rotation and wraps new keys with the active one", () => {
		const before = parseKeyring(`1:${K1}`, "1");
		const after = parseKeyring(`1:${K1},2:${K2}`, "2");
		const dek = generateDek();
		const old = wrapDek(dek, before);
		expect(unwrapDek(old, after)).toEqual(dek);
		expect(needsRewrap(old, after)).toBe(true);
		const rewrapped = wrapDek(unwrapDek(old, after), after);
		expect(tokenKeyVersion(rewrapped)).toBe("2");
		expect(needsRewrap(rewrapped, after)).toBe(false);
		expect(unwrapDek(rewrapped, after)).toEqual(dek);
		expect(() => unwrapDek(rewrapped, before)).toThrow(DecryptionError);
	});

	it("binds a wrapped key to its context", () => {
		const keyring = parseKeyring(`1:${K1}`, "1");
		const wrapped = wrapDek(generateDek(), keyring, "organization_keys.dek.org-a");
		expect(() => unwrapDek(wrapped, keyring, "organization_keys.dek.org-b")).toThrow(
			DecryptionError,
		);
	});

	it("rejects data keys of the wrong size", () => {
		expect(() => wrapDek(randomBytes(16), parseKeyring(`1:${K1}`, "1"))).toThrow(RangeError);
	});
});

describe("field encryption", () => {
	const dek: DataKey = { version: "3", key: generateDek() };
	const aad = fieldAad("appointments", "patient_email_enc", "0b5c1e2a");

	it("round-trips text, including empty and non-ASCII values", () => {
		for (const value of ["", "Léa Dupont-Ngô", "a@example.org", "😀".repeat(100)]) {
			const token = encryptField(value, dek, aad);
			expect(token.startsWith("enc:v1:3:")).toBe(true);
			expect(decryptField(token, dek, aad)).toBe(value);
		}
	});

	it("uses a fresh IV each time", () => {
		expect(encryptField("same", dek, aad)).not.toBe(encryptField("same", dek, aad));
	});

	it("refuses a ciphertext moved to another row or column", () => {
		const token = encryptField("secret", dek, aad);
		expect(() =>
			decryptField(token, dek, fieldAad("appointments", "patient_email_enc", "ffffffff")),
		).toThrow(DecryptionError);
		expect(() =>
			decryptField(token, dek, fieldAad("appointments", "patient_phone_enc", "0b5c1e2a")),
		).toThrow(DecryptionError);
	});

	it("detects tampering with any part of the token", () => {
		const token = encryptField("secret", dek, aad);
		const [prefix, format, version, iv, sealed] = token.split(":") as [
			string,
			string,
			string,
			string,
			string,
		];
		const flip = (value: string, index: number) => {
			const bytes = Buffer.from(value, "base64url");
			bytes[index] = (bytes[index] as number) ^ 1;
			return bytes.toString("base64url");
		};
		const variants = [
			[prefix, format, version, flip(iv, 0), sealed],
			[prefix, format, version, iv, flip(sealed, 0)],
			[prefix, format, version, iv, flip(sealed, Buffer.from(sealed, "base64url").length - 1)],
			[prefix, format, version, iv, sealed.slice(0, -2)],
			[prefix, "v2", version, iv, sealed],
			[prefix, format, version, iv],
			[prefix, format, version, `${iv}=`, sealed],
		];
		for (const parts of variants) {
			expect(() => decryptField(parts.join(":"), dek, aad)).toThrow(DecryptionError);
		}
		expect(() => decryptField("not a token", dek, aad)).toThrow(DecryptionError);
	});

	it("picks the data key version recorded in the token", () => {
		const next: DataKey = { version: "4", key: generateDek() };
		const token = encryptField("secret", dek, aad);
		expect(decryptField(token, [next, dek], aad)).toBe("secret");
		expect(() => decryptField(token, next, aad)).toThrow(DecryptionError);
		const forged = token.replace("enc:v1:3:", "enc:v1:4:");
		expect(() => decryptField(forged, [next, dek], aad)).toThrow(DecryptionError);
	});

	it("validates its inputs", () => {
		expect(() => encryptField("x", { version: "3", key: randomBytes(31) }, aad)).toThrow(
			RangeError,
		);
		expect(() => encryptField("x", { version: "a:b", key: generateDek() }, aad)).toThrow(
			RangeError,
		);
		expect(() => fieldAad("appointments", "", "1")).toThrow(RangeError);
	});
});
