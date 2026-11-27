/**
 * Finnish coordinates (ETRS-TM35FIN, EPSG:3067: transverse Mercator on the GRS 80 ellipsoid,
 * central meridian 27° E, scale 0.9996, false easting 500,000 m, the UTM zone 35 grid extended
 * over all of Finland) to WGS 84 and back, with Krüger's series to the sixth order (as in the
 * National Land Survey's JHS 197 recommendation, appendix 1). ETRS89, on which ETRS-TM35FIN
 * rests, and WGS 84 differ by well under a metre: no datum shift. Pure functions.
 *
 * The Finnish Service Catalogue (PTV) gives a service location's point in ETRS-TM35FIN, under
 * names that swap the convention: `latitude` is the northing (about 6,600,000 to 7,800,000 m),
 * `longitude` the easting (about 50,000 to 750,000 m).
 */

export type LonLat = { longitude: number; latitude: number };

const A = 6_378_137;
const F = 1 / 298.257222101;
const K0 = 0.9996;
const LAMBDA0 = 27;
const FALSE_EASTING = 500_000;
const RAD = Math.PI / 180;

const N1 = F / (2 - F);
const A1 = (A / (1 + N1)) * (1 + N1 ** 2 / 4 + N1 ** 4 / 64);
const E2 = F * (2 - F);
const E = Math.sqrt(E2);

/** Krüger's coefficients from the meridian to the ellipsoid (inverse, δ) and back (forward, α). */
const DELTA = [
	N1 / 2 - (2 / 3) * N1 ** 2 + (37 / 96) * N1 ** 3 - (1 / 360) * N1 ** 4,
	(1 / 48) * N1 ** 2 + (1 / 15) * N1 ** 3 - (437 / 1440) * N1 ** 4,
	(17 / 480) * N1 ** 3 - (37 / 840) * N1 ** 4,
	(4397 / 161280) * N1 ** 4,
];
const ALPHA = [
	N1 / 2 - (2 / 3) * N1 ** 2 + (5 / 16) * N1 ** 3 + (41 / 180) * N1 ** 4,
	(13 / 48) * N1 ** 2 - (3 / 5) * N1 ** 3 + (557 / 1440) * N1 ** 4,
	(61 / 240) * N1 ** 3 - (103 / 140) * N1 ** 4,
	(49561 / 161280) * N1 ** 4,
];

/**
 * A point of the Finnish grid (`northing`, `easting`) in WGS 84, or null when it is not a finite
 * point in or near Finland (a location without a point reads 0).
 */
export function tm35finToWgs84(northing: number, easting: number): LonLat | null {
	if (!Number.isFinite(northing) || !Number.isFinite(easting)) return null;
	if (northing < 6_550_000 || northing > 7_850_000 || easting < 0 || easting > 800_000) return null;
	const xi = northing / (K0 * A1);
	const eta = (easting - FALSE_EASTING) / (K0 * A1);
	let xiPrime = xi;
	let etaPrime = eta;
	for (let j = 1; j <= 4; j++) {
		const d = DELTA[j - 1] ?? 0;
		xiPrime -= d * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
		etaPrime -= d * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
	}
	const chi = Math.asin(Math.sin(xiPrime) / Math.cosh(etaPrime));
	// The conformal latitude back to the geodetic one, by iteration.
	let phi = chi;
	for (let index = 0; index < 10; index++) {
		const s = Math.sin(phi);
		const next =
			2 * Math.atan(Math.tan(Math.PI / 4 + chi / 2) * ((1 + E * s) / (1 - E * s)) ** (E / 2)) -
			Math.PI / 2;
		if (Math.abs(next - phi) < 1e-13) {
			phi = next;
			break;
		}
		phi = next;
	}
	const lambda = LAMBDA0 * RAD + Math.atan(Math.sinh(etaPrime) / Math.cos(xiPrime));
	return { longitude: lambda / RAD, latitude: phi / RAD };
}

/** A WGS 84 point on the Finnish grid (`northing`, `easting`): fixtures and tests. */
export function wgs84ToTm35fin(point: LonLat): { northing: number; easting: number } {
	const phi = point.latitude * RAD;
	const lambda = (point.longitude - LAMBDA0) * RAD;
	const s = Math.sin(phi);
	const chi =
		2 * Math.atan(Math.tan(Math.PI / 4 + phi / 2) * ((1 - E * s) / (1 + E * s)) ** (E / 2)) -
		Math.PI / 2;
	const xiPrime = Math.atan(Math.tan(chi) / Math.cos(lambda));
	const etaPrime = Math.atanh(Math.cos(chi) * Math.sin(lambda));
	let xi = xiPrime;
	let eta = etaPrime;
	for (let j = 1; j <= 4; j++) {
		const a = ALPHA[j - 1] ?? 0;
		xi += a * Math.sin(2 * j * xiPrime) * Math.cosh(2 * j * etaPrime);
		eta += a * Math.cos(2 * j * xiPrime) * Math.sinh(2 * j * etaPrime);
	}
	return { northing: K0 * A1 * xi, easting: FALSE_EASTING + K0 * A1 * eta };
}

/** True when a WGS 84 point is within Finland's bounding box (a margin included, Åland too). */
export function inFinland(point: LonLat): boolean {
	return (
		point.longitude >= 19 &&
		point.longitude <= 32 &&
		point.latitude >= 59.4 &&
		point.latitude <= 70.2
	);
}
