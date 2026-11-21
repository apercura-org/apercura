import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptBytes, encryptBytes } from "./blob";
import { DecryptionError } from "./envelope";

const v1 = { version: "1", key: randomBytes(32) };
const v2 = { version: "2", key: randomBytes(32) };

describe("encrypted blobs", () => {
	it("round-trips bytes with the key version in the header", () => {
		const plain = randomBytes(4096);
		const sealed = encryptBytes(plain, v1, "claim_documents.object.doc-1");
		expect(sealed.subarray(0, 4).toString("ascii")).toBe("APB1");
		expect(sealed.includes(plain.subarray(0, 64))).toBe(false);
		expect(decryptBytes(sealed, [v2, v1], "claim_documents.object.doc-1")).toEqual(plain);
	});

	it("refuses another object's AAD, a tampered byte or an unknown key", () => {
		const sealed = encryptBytes(Buffer.from("cps card"), v1, "a");
		expect(() => decryptBytes(sealed, v1, "b")).toThrow(DecryptionError);
		const tampered = Buffer.from(sealed);
		tampered[tampered.length - 20] = (tampered[tampered.length - 20] ?? 0) ^ 1;
		expect(() => decryptBytes(tampered, v1, "a")).toThrow(DecryptionError);
		expect(() => decryptBytes(sealed, v2, "a")).toThrow(DecryptionError);
		expect(() => decryptBytes(Buffer.from("nope"), v1, "a")).toThrow(DecryptionError);
	});
});
