/// <reference types="node" />
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** Constant-time string comparison (both sides are hashed first, so lengths always match). */
export function safeEqual(a: string, b: string): boolean {
	const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
	return timingSafeEqual(digest(a), digest(b)) && a.length === b.length;
}

/** A 256-bit random token for the patient's manage link, base64url (43 characters). */
export function generateManageToken(): string {
	return randomBytes(32).toString("base64url");
}

/** SHA-256 hex of a token: the only form stored in the database. */
export function hashToken(token: string): string {
	return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Whether `token` hashes to `expectedHash`, in constant time. */
export function verifyToken(token: string, expectedHash: string): boolean {
	return safeEqual(hashToken(token), expectedHash);
}

/** A uniformly random 6-digit one-time code, leading zeros kept. */
export function generateOtp(): string {
	return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** A random per-challenge salt for {@link hashOtp}. */
export function generateOtpSalt(): string {
	return randomBytes(16).toString("base64url");
}

/** HMAC-SHA256 hex of a one-time code, keyed by its challenge salt. */
export function hashOtp(code: string, salt: string): string {
	if (salt.length === 0) {
		throw new RangeError("salt is required");
	}
	return createHmac("sha256", salt).update(code, "utf8").digest("hex");
}

/** Whether `code` matches the stored hash, in constant time. Malformed codes never match. */
export function verifyOtp(code: string, salt: string, expectedHash: string): boolean {
	const matches = safeEqual(hashOtp(code, salt), expectedHash);
	return /^\d{6}$/.test(code) && matches;
}
