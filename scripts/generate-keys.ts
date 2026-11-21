/**
 * Prints fresh random secrets for a local `.env` file.
 * Each value is 32 random bytes encoded as base64.
 */
import { randomBytes } from "node:crypto";

const key = (): string => randomBytes(32).toString("base64");

console.log(`ENCRYPTION_KEYS=1:${key()}`);
console.log("ENCRYPTION_ACTIVE_KEY=1");
console.log(`BLIND_INDEX_KEY=${key()}`);
console.log(`BETTER_AUTH_SECRET=${key()}`);
console.log(`RATE_LIMIT_KEY=${key()}`);
console.log(`ALTCHA_HMAC_KEY=${key()}`);
