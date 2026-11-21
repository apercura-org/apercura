import { describe, expect, it } from "vitest";
import {
	parseRevalidationTags,
	REVALIDATE_MAX_TAGS,
	signRevalidation,
	verifyRevalidation,
} from "./revalidation";

const SECRET = "test-secret-not-used-anywhere";
const NOW = 1_800_000_000_000;
const TIMESTAMP = Math.floor(NOW / 1000);

describe("revalidation signatures", () => {
	const body = JSON.stringify({ tags: ["practitioner:1"] });
	const signature = signRevalidation(SECRET, TIMESTAMP, body);

	it("accepts a valid signature", () => {
		expect(
			verifyRevalidation({
				secret: SECRET,
				body,
				signature,
				timestamp: String(TIMESTAMP),
				now: NOW,
			}),
		).toEqual({ ok: true });
	});

	it("rejects a tampered body, a wrong secret or a garbage signature", () => {
		const base = { timestamp: String(TIMESTAMP), now: NOW };
		expect(verifyRevalidation({ ...base, secret: SECRET, body: `${body} `, signature }).ok).toBe(
			false,
		);
		expect(verifyRevalidation({ ...base, secret: "other", body, signature }).ok).toBe(false);
		expect(verifyRevalidation({ ...base, secret: SECRET, body, signature: "zz" })).toEqual({
			ok: false,
			reason: "mismatch",
		});
	});

	it("rejects stale or missing timestamps", () => {
		expect(
			verifyRevalidation({
				secret: SECRET,
				body,
				signature,
				timestamp: String(TIMESTAMP - 301),
				now: NOW,
			}),
		).toEqual({ ok: false, reason: "stale" });
		expect(verifyRevalidation({ secret: SECRET, body, signature, timestamp: null })).toEqual({
			ok: false,
			reason: "missing",
		});
	});
});

describe("parseRevalidationTags", () => {
	it("deduplicates valid tags", () => {
		expect(parseRevalidationTags({ tags: ["a", "b", "a"] })).toEqual(["a", "b"]);
	});

	it.each([
		null,
		{},
		{ tags: [] },
		{ tags: [1] },
		{ tags: [""] },
		{ tags: ["x".repeat(257)] },
		{ tags: Array.from({ length: REVALIDATE_MAX_TAGS + 1 }, (_, index) => `t${index}`) },
	])("rejects %j", (value) => {
		expect(parseRevalidationTags(value)).toBeNull();
	});
});
