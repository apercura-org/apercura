/**
 * Deterministic practitioner seal.
 *
 * Every practitioner page carries a seal derived only from the RPPS number: the
 * same number always draws the same seal, and two numbers almost never share
 * one. The seal is engraved line work (a ruled outer ring, a tick ring and
 * interlaced guilloché bands), printed in the page's ink. Verified pages print
 * the outer ring in stamp violet; that is the only colour a seal may carry.
 *
 * Everything here is pure: no randomness without a seed, no Date, no DOM.
 */

/** 32-bit FNV-1a hash of a string. */
export function fnv1a(input: string): number {
	let hash = 0x811c9dc5;
	for (let index = 0; index < input.length; index++) {
		hash ^= input.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

/** Mulberry32: a small seeded PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export interface SealBand {
	/** Mean radius of the band, in viewBox units (the seal spans -50..50). */
	radius: number;
	/** Wave amplitude. */
	amplitude: number;
	/** Number of waves around the circle. */
	waves: number;
	/** Phase offset, in radians. */
	phase: number;
	/** Stroke weight. */
	weight: number;
	/** Whether the band is drawn twice in opposite phase, forming a braid. */
	braided: boolean;
}

export interface SealSpec {
	/** Weight of the outer ruled ring. */
	outerWeight: number;
	/** Whether a second, thin ring is ruled inside the outer one. */
	doubleRing: boolean;
	/** Number of radial ticks in the tick ring. */
	ticks: number;
	/** Every `tickAccent`-th tick is drawn long. */
	tickAccent: number;
	/** Tick weight. */
	tickWeight: number;
	/** Guilloché bands, outermost first. */
	bands: SealBand[];
	/** Radius of the central boss. */
	bossRadius: number;
	/** Whether the central boss is filled (solid) or ruled (outline). */
	bossFilled: boolean;
}

const pick = <T>(random: () => number, values: readonly T[]): T =>
	values[Math.floor(random() * values.length)] as T;

const between = (random: () => number, min: number, max: number, step = 0.05) =>
	Number((Math.round((min + random() * (max - min)) / step) * step).toFixed(2));

/** Derives the seal parameters from an RPPS number (any string is accepted). */
export function sealSpec(rpps: string): SealSpec {
	return specFromSeed(`apercura-seal:${rpps.trim()}`);
}

/**
 * Seed of Apercura's own seal. It lives outside the `apercura-seal:` namespace used
 * for practitioners, so no RPPS number can ever produce the brand mark.
 */
export const BRAND_SEAL_SEED = "apercura-brand:booklet-cover";

/** Apercura's own seal, for the home opening and brand marks. Never used on a practitioner page. */
export function brandSealSpec(): SealSpec {
	return specFromSeed(BRAND_SEAL_SEED);
}

function specFromSeed(seed: string): SealSpec {
	const random = mulberry32(fnv1a(seed));

	const bandCount = pick(random, [2, 3, 3, 4] as const);
	const bands: SealBand[] = [];
	let radius = 32.5;
	for (let index = 0; index < bandCount; index++) {
		const amplitude = between(random, 1.6, 4.2);
		bands.push({
			radius: Math.round(radius * 100) / 100,
			amplitude,
			waves: pick(random, [5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const),
			phase: Math.round(random() * Math.PI * 2 * 1000) / 1000,
			weight: between(random, 0.55, 1.5),
			braided: random() < 0.55,
		});
		radius -= (32.5 - 12) / bandCount;
	}

	return {
		outerWeight: between(random, 1.6, 3.4),
		doubleRing: random() < 0.6,
		ticks: pick(random, [36, 40, 48, 54, 60, 72] as const),
		tickAccent: pick(random, [2, 3, 4, 6] as const),
		tickWeight: between(random, 0.6, 1.3),
		bands,
		bossRadius: between(random, 3, 6.5, 0.25),
		bossFilled: random() < 0.5,
	};
}

const round = (value: number) => Math.round(value * 100) / 100;

/** SVG path of one wavy band: r(θ) = radius + amplitude · cos(waves · θ + phase). */
export function bandPath(
	band: Pick<SealBand, "radius" | "amplitude" | "waves" | "phase">,
	samples = 144,
): string {
	let path = "";
	for (let index = 0; index <= samples; index++) {
		const theta = (index / samples) * Math.PI * 2;
		const r = band.radius + band.amplitude * Math.cos(band.waves * theta + band.phase);
		const x = round(r * Math.cos(theta));
		const y = round(r * Math.sin(theta));
		path += `${index === 0 ? "M" : "L"}${x} ${y}`;
	}
	return `${path}Z`;
}

/** SVG path of the tick ring between radii 38.5 and 42.5 (long ticks start at 37). */
export function ticksPath(spec: Pick<SealSpec, "ticks" | "tickAccent">): string {
	let path = "";
	for (let index = 0; index < spec.ticks; index++) {
		const theta = (index / spec.ticks) * Math.PI * 2 - Math.PI / 2;
		const inner = index % spec.tickAccent === 0 ? 37 : 39;
		const outer = 42.5;
		path += `M${round(inner * Math.cos(theta))} ${round(inner * Math.sin(theta))}L${round(outer * Math.cos(theta))} ${round(outer * Math.sin(theta))}`;
	}
	return path;
}
