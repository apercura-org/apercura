import { describe, expect, it } from "vitest";
import {
	BRAND_SEAL_SEED,
	bandPath,
	brandSealSpec,
	fnv1a,
	mulberry32,
	sealSpec,
	ticksPath,
} from "./seal-spec";

// Synthetic, Luhn-valid numbers that identify no one.
const SYNTHETIC = ["10000000009", "12345678903", "99999999990", "10101010105"];

describe("sealSpec", () => {
	it("is deterministic for the same RPPS", () => {
		for (const rpps of SYNTHETIC) {
			expect(sealSpec(rpps)).toEqual(sealSpec(rpps));
			expect(JSON.stringify(sealSpec(rpps))).toBe(JSON.stringify(sealSpec(` ${rpps} `)));
		}
	});

	it("is stable across releases (snapshot of one synthetic RPPS)", () => {
		expect(sealSpec("10000000009")).toMatchSnapshot();
	});

	it("gives distinct seals to distinct RPPS numbers", () => {
		const seen = new Set<string>();
		const total = 2000;
		for (let index = 0; index < total; index++) {
			seen.add(JSON.stringify(sealSpec(String(10000000000 + index * 7919))));
		}
		expect(seen.size / total).toBeGreaterThan(0.99);
	});

	it("keeps every parameter inside the drawable seal", () => {
		for (let index = 0; index < 500; index++) {
			const spec = sealSpec(String(10000000000 + index));
			expect(spec.outerWeight).toBeGreaterThanOrEqual(1.6);
			expect(spec.outerWeight).toBeLessThanOrEqual(3.4);
			expect(spec.bands.length).toBeGreaterThanOrEqual(2);
			for (const band of spec.bands) {
				expect(band.radius + band.amplitude).toBeLessThan(37);
				expect(band.radius - band.amplitude).toBeGreaterThan(spec.bossRadius);
				expect(band.weight).toBeGreaterThan(0.5);
			}
		}
	});
});

describe("brandSealSpec", () => {
	it("is deterministic and distinct from every sample practitioner seal", () => {
		expect(brandSealSpec()).toEqual(brandSealSpec());
		for (const rpps of SYNTHETIC) {
			expect(JSON.stringify(brandSealSpec())).not.toBe(JSON.stringify(sealSpec(rpps)));
		}
	});

	it("cannot be reached from an RPPS number", () => {
		// Practitioner seeds are namespaced `apercura-seal:`; the brand seed is not.
		expect(BRAND_SEAL_SEED.startsWith("apercura-seal:")).toBe(false);
		expect(JSON.stringify(brandSealSpec())).not.toBe(JSON.stringify(sealSpec(BRAND_SEAL_SEED)));
	});
});

describe("seal geometry", () => {
	it("draws closed band paths with the requested number of samples", () => {
		const path = bandPath({ radius: 30, amplitude: 2, waves: 7, phase: 0 }, 12);
		expect(path.startsWith("M32 0")).toBe(true);
		expect(path.endsWith("Z")).toBe(true);
		expect(path.match(/L/g)).toHaveLength(12);
	});

	it("draws one segment per tick", () => {
		expect(ticksPath({ ticks: 48, tickAccent: 4 }).match(/M/g)).toHaveLength(48);
	});
});

describe("hash and PRNG", () => {
	it("hashes like reference FNV-1a", () => {
		expect(fnv1a("")).toBe(0x811c9dc5);
		expect(fnv1a("a")).toBe(0xe40c292c);
	});

	it("replays the same sequence for the same seed", () => {
		const first = mulberry32(42);
		const second = mulberry32(42);
		const values = Array.from({ length: 5 }, () => first());
		expect(values).toEqual(Array.from({ length: 5 }, () => second()));
		for (const value of values) {
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(1);
		}
	});
});
