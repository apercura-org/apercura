import { describe, expect, it } from "vitest";
import {
	generateManageToken,
	generateOtp,
	generateOtpSalt,
	hashOtp,
	hashToken,
	safeEqual,
	verifyOtp,
	verifyToken,
} from "./tokens";

describe("manage tokens", () => {
	it("are 256-bit base64url values stored as SHA-256 hex", () => {
		const token = generateManageToken();
		expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(generateManageToken()).not.toBe(token);
		expect(hashToken("abc")).toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
		);
		expect(verifyToken(token, hashToken(token))).toBe(true);
		expect(verifyToken(`${token}x`, hashToken(token))).toBe(false);
	});
});

describe("one-time codes", () => {
	it("are six digits", () => {
		for (let i = 0; i < 200; i += 1) {
			expect(generateOtp()).toMatch(/^\d{6}$/);
		}
	});

	it("verify against a salted hash only", () => {
		const salt = generateOtpSalt();
		const hash = hashOtp("004217", salt);
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
		expect(verifyOtp("004217", salt, hash)).toBe(true);
		expect(verifyOtp("004218", salt, hash)).toBe(false);
		expect(verifyOtp("004217", generateOtpSalt(), hash)).toBe(false);
		expect(hashOtp("004217", generateOtpSalt())).not.toBe(hash);
		expect(verifyOtp("4217", salt, hashOtp("4217", salt))).toBe(false);
		expect(() => hashOtp("004217", "")).toThrow(RangeError);
	});

	it("compare strings safely", () => {
		expect(safeEqual("abc", "abc")).toBe(true);
		expect(safeEqual("abc", "abd")).toBe(false);
		expect(safeEqual("abc", "abcd")).toBe(false);
	});
});
