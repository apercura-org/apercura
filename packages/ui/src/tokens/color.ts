/**
 * Minimal OKLCH colour maths: conversion to sRGB and WCAG 2.x contrast.
 *
 * Tokens are authored in OKLCH. Consumers that cannot parse OKLCH (MapLibre
 * styles, Open Graph images) use the hex values derived here, and the unit
 * tests use the contrast helpers to verify every token pair the UI relies on.
 */

export interface Oklch {
	l: number;
	c: number;
	h: number;
	alpha?: number;
}

export type Rgb = readonly [number, number, number];

const NUMBER_PATTERN = /^\d+(?:\.\d+)?$|^\.\d+$/;

function parseComponent(raw: string, allowPercent: boolean, value: string): number {
	const isPercent = allowPercent && raw.endsWith("%");
	const digits = isPercent ? raw.slice(0, -1) : raw;
	if (!NUMBER_PATTERN.test(digits)) {
		throw new Error(`Not an oklch() colour: ${value}`);
	}
	return Number(digits) / (isPercent ? 100 : 1);
}

/**
 * Parses an `oklch(L C H)` or `oklch(L C H / A)` string. Implemented without a
 * backtracking regular expression so it runs in linear time on any input.
 */
export function parseOklch(value: string): Oklch {
	const trimmed = value.trim();
	if (!trimmed.startsWith("oklch(") || !trimmed.endsWith(")")) {
		throw new Error(`Not an oklch() colour: ${value}`);
	}
	const [channels = "", alphaPart, ...rest] = trimmed.slice(6, -1).split("/");
	const parts = channels.trim().split(/\s+/);
	if (rest.length > 0 || parts.length !== 3) {
		throw new Error(`Not an oklch() colour: ${value}`);
	}
	const [l = "", c = "", h = ""] = parts;
	const hue = h.endsWith("deg") ? h.slice(0, -3) : h;
	const result: Oklch = {
		l: parseComponent(l, true, value),
		c: parseComponent(c, false, value),
		h: parseComponent(hue, false, value),
	};
	if (alphaPart !== undefined) {
		result.alpha = parseComponent(alphaPart.trim(), true, value);
	}
	return result;
}

/** Converts OKLCH to linear-light sRGB channels (unclamped). */
export function oklchToLinearSrgb({ l, c, h }: Oklch): Rgb {
	const hue = (h * Math.PI) / 180;
	const a = c * Math.cos(hue);
	const b = c * Math.sin(hue);

	const lPrime = l + 0.3963377774 * a + 0.2158037573 * b;
	const mPrime = l - 0.1055613458 * a - 0.0638541728 * b;
	const sPrime = l - 0.0894841775 * a - 1.291485548 * b;

	const lCube = lPrime ** 3;
	const mCube = mPrime ** 3;
	const sCube = sPrime ** 3;

	return [
		4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube,
		-1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube,
		-0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube,
	];
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function encodeSrgb(linear: number): number {
	const value = clamp01(linear);
	return value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
}

/** Converts an OKLCH string to a `#rrggbb` hex string (gamut-clipped, alpha ignored). */
export function oklchToHex(value: string): string {
	const linear = oklchToLinearSrgb(parseOklch(value));
	return `#${linear
		.map((channel) =>
			Math.round(encodeSrgb(channel) * 255)
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}`;
}

/** WCAG 2.x relative luminance of an OKLCH colour. */
export function relativeLuminance(value: string): number {
	const [r, g, b] = oklchToLinearSrgb(parseOklch(value)).map(clamp01) as [number, number, number];
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two opaque OKLCH colours (1 to 21). */
export function contrastRatio(foreground: string, background: string): number {
	const first = relativeLuminance(foreground);
	const second = relativeLuminance(background);
	const [light, dark] = first > second ? [first, second] : [second, first];
	return (light + 0.05) / (dark + 0.05);
}
