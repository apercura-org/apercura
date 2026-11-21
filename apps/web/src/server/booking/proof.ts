import { createHmac, randomBytes } from "node:crypto";
import {
	type Challenge,
	createChallenge,
	type DeriveKeyFunction,
	randomInt,
	type Solution,
	verifySolution,
} from "altcha-lib";
import { deriveKey as pbkdf2 } from "altcha-lib/algorithms/pbkdf2";
import { deriveKey as sha } from "altcha-lib/algorithms/sha";
import { z } from "zod";
import type { BookingRuntime } from "./runtime";

/*
 * ALTCHA proof of work before a hold: self-hosted, no key, no third-party
 * service. Challenges are signed with ALTCHA_HMAC_KEY; each solved challenge is
 * accepted once (its signature is burnt in the rate-limit table).
 */

export interface ProofSettings {
	algorithm: "PBKDF2/SHA-256" | "SHA-256";
	/** Iterations per attempt. */
	cost: number;
	/** The secret counter is drawn in this range: the client tries on average half of it. */
	counterMin: number;
	counterMax: number;
	/** Lifetime of a challenge. */
	ttlSeconds: number;
}

/** About a second of work on a mid-range phone. */
export const DEFAULT_PROOF: ProofSettings = {
	algorithm: "PBKDF2/SHA-256",
	cost: 1_000,
	counterMin: 1_000,
	counterMax: 3_000,
	ttlSeconds: 600,
};

const DERIVE: Record<ProofSettings["algorithm"], DeriveKeyFunction> = {
	"PBKDF2/SHA-256": pbkdf2,
	"SHA-256": sha,
};

let processSecret: string | undefined;

function secrets() {
	const configured = process.env.ALTCHA_HMAC_KEY;
	processSecret ??= randomBytes(32).toString("base64");
	const base = configured && configured.length > 0 ? configured : processSecret;
	const derive = (label: string) => createHmac("sha256", base).update(label).digest("base64url");
	return { signature: derive("altcha:challenge"), keySignature: derive("altcha:key") };
}

/** A fresh signed challenge for the booking form. */
export async function createProofChallenge(
	settings: ProofSettings = DEFAULT_PROOF,
	nowMs = Date.now(),
): Promise<Challenge> {
	const { signature, keySignature } = secrets();
	return createChallenge({
		algorithm: settings.algorithm,
		cost: settings.cost,
		counter: randomInt(settings.counterMin, settings.counterMax),
		deriveKey: DERIVE[settings.algorithm],
		expiresAt: new Date(nowMs + settings.ttlSeconds * 1_000),
		hmacSignatureSecret: signature,
		hmacKeySignatureSecret: keySignature,
	});
}

const payloadSchema = z.object({
	challenge: z.object({
		parameters: z
			.object({
				algorithm: z.enum(["PBKDF2/SHA-256", "SHA-256"]),
				nonce: z.string(),
				salt: z.string(),
				cost: z.number(),
				keyLength: z.number(),
				keyPrefix: z.string(),
			})
			.loose(),
		signature: z.string().min(1).max(256),
	}),
	solution: z.object({
		counter: z.number().int().nonnegative(),
		derivedKey: z.string().max(1024),
		time: z.number().optional(),
	}),
});

/** Encodes a solved challenge the way the ALTCHA widget does (base64 JSON). */
export function encodeProof(challenge: Challenge, solution: Solution): string {
	return Buffer.from(JSON.stringify({ challenge, solution }), "utf8").toString("base64");
}

/**
 * Whether `payload` (base64 JSON `{ challenge, solution }`) solves one of our challenges that has
 * not expired and was never used before.
 */
export async function verifyProof(rt: BookingRuntime, payload: string): Promise<boolean> {
	let decoded: z.infer<typeof payloadSchema>;
	try {
		decoded = payloadSchema.parse(JSON.parse(Buffer.from(payload, "base64").toString("utf8")));
	} catch {
		return false;
	}
	const { signature, keySignature } = secrets();
	const challenge = decoded.challenge as unknown as Challenge;
	try {
		const result = await verifySolution({
			challenge,
			solution: decoded.solution,
			deriveKey: DERIVE[decoded.challenge.parameters.algorithm],
			hmacSignatureSecret: signature,
			hmacKeySignatureSecret: keySignature,
		});
		if (!result.verified) {
			return false;
		}
	} catch {
		return false;
	}
	// Replay protection: a solved challenge buys one hold.
	const burnt = createHmac("sha256", signature)
		.update(decoded.challenge.signature)
		.digest("base64url");
	return rt.rateLimit(`altcha:${burnt}`, { max: 1, windowSeconds: DEFAULT_PROOF.ttlSeconds });
}
