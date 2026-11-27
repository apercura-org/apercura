/**
 * Kartverket's addresses (Matrikkelen – Adresse, the cadastre's official addresses, CC BY 4.0):
 * the national file, one `;` CSV in a ZIP (`Basisdata_0000_Norge_4258_MatrikkelenAdresse_CSV`),
 * every address with its municipality number, address text, postcode and its point in
 * EUREF89 geographic coordinates (EPSG:4258, `Nord` the latitude, `Øst` the longitude, which
 * WGS 84 matches to within a metre). About 2.6 million lines, 800 MB inflated: the file is
 * streamed and only what the run looks up is kept.
 *
 * An establishment is located at the point of its street address in its municipality (address
 * precision), else at the centre of its postcode, the mean of the postcode's address points
 * (city precision: no map pin).
 */
import { createInterface } from "node:readline";
import { mapColumns } from "../../lib/text";
import { zipEntries, zipEntryStream } from "../../lib/zip";
import { addressKey } from "./text";

/** The national address file (`ETL_NO_ADRESSER_URL`), updated every week or so. */
export const DEFAULT_NO_ADRESSER_URL =
	"https://nedlasting.geonorge.no/geonorge/Basisdata/MatrikkelenAdresse/CSV/Basisdata_0000_Norge_4258_MatrikkelenAdresse_CSV.zip";

/** The inflated CSV's size limit: about 800 MB in November 2026. */
const MAX_CSV_BYTES = 2 * 1024 * 1024 * 1024;

export type LonLat = { longitude: number; latitude: number };

export type AddressIndex = {
	/** Points by address key (`3209|ragnar strøms veg 10`). */
	byAddress: Map<string, LonLat>;
	/** The centre of each postcode looked up (the mean of its address points). */
	byPostcode: Map<string, LonLat>;
	/** Data lines read. */
	lines: number;
	/** The extract date the file gives (`datauttaksdato`, `YYYY-MM-DD`), if any. */
	extractedOn: string | null;
};

const COLUMNS = {
	municipality: "kommunenummer",
	text: "adresseTekstUtenAdressetilleggsnavn",
	epsg: "EPSG-kode",
	north: "Nord",
	east: "Øst",
	postcode: "postnummer",
	extracted: "datauttaksdato",
} as const;

/** The CSV entry of the archive. */
function csvEntry(archive: Buffer): string {
	let name: string | null = null;
	for (const _ of zipEntries(archive, (entry) => {
		if (!name && /\.csv$/i.test(entry)) name = entry;
		return false;
	})) {
	}
	if (!name) throw new Error("not Kartverket's address file: no CSV in the archive");
	return name;
}

/** A point in mainland Norway (with a margin), or null. */
function pointOf(north: string | undefined, east: string | undefined): LonLat | null {
	const latitude = Number(north);
	const longitude = Number(east);
	if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
	if (latitude < 57.5 || latitude > 71.5 || longitude < 4 || longitude > 31.5) return null;
	return { longitude, latitude };
}

/**
 * Reads the points of the addresses the run looks up (`addresses`, as `addressKey` writes them)
 * and the centres of the postcodes `postcodes`. Throws when the archive is not the address file
 * (no CSV, a missing column, another coordinate system, fewer lines than `minLines`).
 */
export async function readAddressIndex(
	archive: Buffer,
	addresses: ReadonlySet<string>,
	postcodes: ReadonlySet<string>,
	minLines = 1,
): Promise<AddressIndex> {
	const stream = zipEntryStream(archive, csvEntry(archive), MAX_CSV_BYTES);
	if (!stream) throw new Error("not Kartverket's address file: unreadable CSV");
	const lines = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });
	const index: AddressIndex = {
		byAddress: new Map(),
		byPostcode: new Map(),
		lines: 0,
		extractedOn: null,
	};
	const sums = new Map<string, { longitude: number; latitude: number; count: number }>();
	let at: Record<keyof typeof COLUMNS, number> | null = null;
	for await (const raw of lines) {
		if (!at) {
			at = mapColumns("matrikkelenAdresse.csv", raw.replace(/^﻿/, "").split(";"), COLUMNS);
			continue;
		}
		if (!raw) continue;
		index.lines++;
		const fields = raw.split(";");
		if (index.lines === 1) {
			if (fields[at.epsg] !== "4258") {
				throw new Error(`not the EPSG:4258 address file (EPSG ${fields[at.epsg]})`);
			}
			const day = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(fields[at.extracted] ?? "");
			if (day) index.extractedOn = `${day[3]}-${day[2]}-${day[1]}`;
		}
		const postcode = fields[at.postcode] ?? "";
		const wantedPostcode = postcodes.has(postcode);
		const key = addressKey(fields[at.municipality] ?? "", fields[at.text] ?? "");
		const wantedAddress = addresses.has(key);
		if (!wantedPostcode && !wantedAddress) continue;
		const point = pointOf(fields[at.north], fields[at.east]);
		if (!point) continue;
		if (wantedAddress && !index.byAddress.has(key)) index.byAddress.set(key, point);
		if (wantedPostcode) {
			const sum = sums.get(postcode) ?? { longitude: 0, latitude: 0, count: 0 };
			sum.longitude += point.longitude;
			sum.latitude += point.latitude;
			sum.count++;
			sums.set(postcode, sum);
		}
	}
	if (!at) throw new Error("not Kartverket's address file: empty CSV");
	if (index.lines < minLines) {
		throw new Error(`the address file holds ${index.lines} lines (at least ${minLines} expected)`);
	}
	for (const [postcode, sum] of sums) {
		index.byPostcode.set(postcode, {
			longitude: Math.round((sum.longitude / sum.count) * 1e6) / 1e6,
			latitude: Math.round((sum.latitude / sum.count) * 1e6) / 1e6,
		});
	}
	return index;
}
