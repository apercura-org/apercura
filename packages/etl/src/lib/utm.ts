/**
 * Universal Transverse Mercator to geographic coordinates on the GRS 80 ellipsoid (ETRS89, as
 * good as WGS 84 at a directory's scale): the inverse of Krüger's series to the third order in
 * the third flattening (Karney 2011), accurate to well under a metre inside a zone. Pure.
 */

const A = 6_378_137;
const F = 1 / 298.257222101;
const K0 = 0.9996;
const FALSE_EASTING = 500_000;

const n = F / (2 - F);
const n2 = n * n;
const n3 = n2 * n;
const RECTIFYING_RADIUS = (A / (1 + n)) * (1 + n2 / 4 + (n2 * n2) / 64);
const BETA = [n / 2 - (2 / 3) * n2 + (37 / 96) * n3, n2 / 48 + n3 / 15, (17 / 480) * n3];
const DELTA = [2 * n - (2 / 3) * n2 - 2 * n3, (7 / 3) * n2 - (8 / 5) * n3, (56 / 15) * n3];

/**
 * The longitude and latitude, in degrees, of an easting and northing (metres) of a UTM zone of
 * the northern hemisphere (`32` for EPSG:25832, `33` for EPSG:25833).
 */
export function utmToLonLat(
	easting: number,
	northing: number,
	zone: number,
): { longitude: number; latitude: number } {
	const xi = northing / (K0 * RECTIFYING_RADIUS);
	const eta = (easting - FALSE_EASTING) / (K0 * RECTIFYING_RADIUS);
	let xiPrime = xi;
	let etaPrime = eta;
	for (const [index, beta] of BETA.entries()) {
		const j = 2 * (index + 1);
		xiPrime -= beta * Math.sin(j * xi) * Math.cosh(j * eta);
		etaPrime -= beta * Math.cos(j * xi) * Math.sinh(j * eta);
	}
	const chi = Math.asin(Math.sin(xiPrime) / Math.cosh(etaPrime));
	let latitude = chi;
	for (const [index, delta] of DELTA.entries()) latitude += delta * Math.sin(2 * (index + 1) * chi);
	const centralMeridian = (zone * 6 - 183) * (Math.PI / 180);
	const longitude = centralMeridian + Math.atan2(Math.sinh(etaPrime), Math.cos(xiPrime));
	return { longitude: (longitude * 180) / Math.PI, latitude: (latitude * 180) / Math.PI };
}
