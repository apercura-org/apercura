/**
 * Estonian coordinates (L-EST97, EPSG:3301: Lambert conformal conic with two standard parallels
 * on the GRS 80 ellipsoid) to WGS 84 and back, with the closed-form projection formulas (Snyder,
 * "Map Projections: A Working Manual", 1987, pp. 107–109). ETRS89, on which L-EST97 rests, and
 * WGS 84 differ by well under a metre: no datum shift. Pure functions.
 *
 * The Land and Spatial Development Board's address points and boundaries are in L-EST97: `x`
 * (easting, about 370,000 to 740,000 m) and `y` (northing, about 6,370,000 to 6,640,000 m). The
 * address file names them the other way round, after the geodetic convention
 * (`VIITEPUNKT_X` is the easting there too, `VIITEPUNKT_Y` the northing).
 */

export type LonLat = { longitude: number; latitude: number };

const A = 6_378_137;
const F = 1 / 298.257222101;
const E2 = 2 * F - F * F;
const E = Math.sqrt(E2);
const RAD = Math.PI / 180;

const PHI1 = 58 * RAD;
const PHI2 = (59 + 1 / 3) * RAD;
const PHI0 = 57.51755393055556 * RAD;
const LAMBDA0 = 24 * RAD;
const FALSE_EASTING = 500_000;
const FALSE_NORTHING = 6_375_000;

const m = (phi: number) => Math.cos(phi) / Math.sqrt(1 - E2 * Math.sin(phi) ** 2);
const t = (phi: number) => {
	const s = Math.sin(phi);
	return Math.tan(Math.PI / 4 - phi / 2) / ((1 - E * s) / (1 + E * s)) ** (E / 2);
};

const N = (Math.log(m(PHI1)) - Math.log(m(PHI2))) / (Math.log(t(PHI1)) - Math.log(t(PHI2)));
const BIG_F = m(PHI1) / (N * t(PHI1) ** N);
const RHO0 = A * BIG_F * t(PHI0) ** N;

/**
 * A point of the Estonian grid in WGS 84, or null when it is not a finite point in or near
 * Estonia (an address without a point reads 0).
 */
export function lest97ToWgs84(x: number, y: number): LonLat | null {
	if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
	if (x < 300_000 || x > 800_000 || y < 6_300_000 || y > 6_700_000) return null;
	const dx = x - FALSE_EASTING;
	const dy = RHO0 - (y - FALSE_NORTHING);
	const rho = Math.sign(N) * Math.hypot(dx, dy);
	const tPrime = (rho / (A * BIG_F)) ** (1 / N);
	const theta = Math.atan2(dx, dy);
	let phi = Math.PI / 2 - 2 * Math.atan(tPrime);
	for (let index = 0; index < 10; index++) {
		const s = Math.sin(phi);
		const next = Math.PI / 2 - 2 * Math.atan(tPrime * ((1 - E * s) / (1 + E * s)) ** (E / 2));
		if (Math.abs(next - phi) < 1e-12) {
			phi = next;
			break;
		}
		phi = next;
	}
	return { longitude: (theta / N + LAMBDA0) / RAD, latitude: phi / RAD };
}

/** A WGS 84 point on the Estonian grid (`x` easting, `y` northing): fixtures and tests. */
export function wgs84ToLest97(point: LonLat): { x: number; y: number } {
	const phi = point.latitude * RAD;
	const rho = A * BIG_F * t(phi) ** N;
	const theta = N * (point.longitude * RAD - LAMBDA0);
	return {
		x: FALSE_EASTING + rho * Math.sin(theta),
		y: FALSE_NORTHING + RHO0 - rho * Math.cos(theta),
	};
}

/** True when a WGS 84 point is within Estonia's bounding box (a margin included). */
export function inEstonia(point: LonLat): boolean {
	return (
		point.longitude >= 21.5 &&
		point.longitude <= 28.5 &&
		point.latitude >= 57.4 &&
		point.latitude <= 59.9
	);
}
