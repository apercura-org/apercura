/**
 * Ordnance Survey Code-Point Open (Open Government Licence): every current postcode unit of
 * Great Britain with its point (British National Grid, EPSG:27700) and the ONS code of its
 * local authority district. One ZIP of CSV files, one per postcode area (`Data/CSV/ts.csv`),
 * headerless: postcode, positional quality, eastings, northings, country, NHS regional and
 * health authority, county, district, ward (`Doc/Code-Point_Open_Column_Headers.csv`).
 * Updated quarterly; the stable download URL redirects to the latest release.
 *
 * A postcode point is the mean of its delivery addresses (about 15): a practice is placed at
 * street precision, never shown as if at its door. Northern Ireland is not in Code-Point Open.
 */
import { normalizeGbPostcode } from "@apercura/core";
import { zipEntries } from "../../lib/zip";
import { csvRecords, decodeText } from "./types";

/** The OS Downloads API's stable link to the latest Code-Point Open CSV. */
export const DEFAULT_GB_POSTCODES_URL =
	"https://api.os.uk/downloads/v1/products/CodePointOpen/downloads?area=GB&format=CSV&redirect";

/** Code-Point Open's "no coordinates" quality: the postcode is not located. */
const NO_COORDINATES = 90;

export type GbPostcodePoint = {
	/** Eastings and northings, EPSG:27700. */
	x: number;
	y: number;
	/** ONS local authority district code (`E06000004`). */
	ladCode: string | null;
};

/**
 * The points of the `wanted` postcodes, read from the Code-Point Open archive (or from one
 * CSV of it, for fixtures). Other postcodes are not kept: the import needs a few tens of
 * thousands of the 1.7 million.
 */
export function readCodePoint(
	archive: Buffer,
	wanted: ReadonlySet<string>,
): Map<string, GbPostcodePoint> {
	const points = new Map<string, GbPostcodePoint>();
	const isZip = archive.length > 4 && archive.readUInt32LE(0) === 0x04034b50;
	const texts = isZip
		? (function* () {
				for (const entry of zipEntries(archive, (name) => /^Data\/CSV\/[a-z]+\.csv$/i.test(name))) {
					yield decodeText(entry.data);
				}
			})()
		: [decodeText(archive)];
	let files = 0;
	for (const text of texts) {
		files++;
		for (const { fields } of csvRecords(text)) {
			const postcode = normalizeGbPostcode(fields[0]);
			if (!postcode || !wanted.has(postcode)) continue;
			const quality = Number(fields[1]);
			const x = Number(fields[2]);
			const y = Number(fields[3]);
			if (quality >= NO_COORDINATES || !Number.isFinite(x) || !Number.isFinite(y) || x <= 0) {
				continue;
			}
			const lad = (fields[8] ?? "").trim();
			points.set(postcode, { x, y, ladCode: /^[EWS]\d{8}$/.test(lad) ? lad : null });
		}
	}
	if (files === 0) throw new Error("Code-Point Open: no postcode file in the archive");
	return points;
}
