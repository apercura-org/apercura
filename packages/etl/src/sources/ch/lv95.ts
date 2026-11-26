/**
 * Swiss coordinates (CH1903+ / LV95, EPSG:2056, and the former LV03, EPSG:21781) to WGS 84, with
 * swisstopo's approximate formulas ("Näherungslösungen für die direkte Transformation
 * CH1903 ⇔ WGS84"): about a metre off, finer than a street address needs. Pure functions.
 */

export type LonLat = { longitude: number; latitude: number };

/**
 * A point of the Swiss grid in WGS 84. `east` and `north` in metres, LV95 (`2600000`,
 * `1200000` at the old observatory of Bern) or LV03 (`600000`, `200000`); null when the
 * point is not in or near Switzerland.
 */
export function swissGridToWgs84(east: number, north: number): LonLat | null {
	if (!Number.isFinite(east) || !Number.isFinite(north)) return null;
	// LV95 adds 2,000,000 m east and 1,000,000 m north to LV03.
	const e = east > 1_000_000 ? east - 2_000_000 : east;
	const n = north > 1_000_000 ? north - 1_000_000 : north;
	// Roughly the country and a margin: LV03 east 480–840 km, north 60–310 km.
	if (e < 460_000 || e > 860_000 || n < 40_000 || n > 320_000) return null;
	const y = (e - 600_000) / 1_000_000;
	const x = (n - 200_000) / 1_000_000;
	const lon = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y * y * y;
	const lat =
		16.9023892 +
		3.238272 * x -
		0.270978 * y * y -
		0.002528 * x * x -
		0.0447 * y * y * x -
		0.014 * x * x * x;
	// The formulas give units of 10,000 arc-seconds.
	return { longitude: (lon * 100) / 36, latitude: (lat * 100) / 36 };
}

/** True when a WGS 84 point is within Switzerland's bounding box (a margin included). */
export function inSwitzerland(point: LonLat): boolean {
	return (
		point.longitude >= 5.8 &&
		point.longitude <= 10.6 &&
		point.latitude >= 45.7 &&
		point.latitude <= 47.9
	);
}
