/**
 * The Land and Spatial Development Board's addresses with their postcodes (Maa- ja Ruumiamet,
 * address data system ADS, "CSV-formaadis väljavõte aadressidest koos posti sihtnumbritega",
 * CC0 1.0, rebuilt on the 5th of every month): one CSV in a ZIP, `;`, every address in force
 * with its id (`ADR_ID`), postcode, short and full address and its point in L-EST97
 * (`VIITEPUNKT_X` the easting, `VIITEPUNKT_Y` the northing). About 1.4 million lines: the
 * file is streamed and only the addresses the run looks up are kept.
 *
 * The registers write their addresses as the ADS normalizes them, so a place of activity is
 * located by its full address, compared without case and spacing, and a pharmacy by its
 * address id.
 */
import { createInterface } from "node:readline";
import { mapColumns } from "../../lib/text";
import { zipEntries, zipEntryStream } from "../../lib/zip";
import { type LonLat, lest97ToWgs84 } from "./lest97";
import { addressKey } from "./names";

/** The ADS address file (`ETL_EE_ADS_URL`). */
export const DEFAULT_EE_ADS_URL = "https://geoportaal.maaruum.ee/docs/aadress/sihtnumbrid.zip";

export type AdsAddress = { point: LonLat | null; postcode: string | null };

export type AdsIndex = {
	byAddress: Map<string, AdsAddress>;
	byId: Map<string, AdsAddress>;
	/** Data lines read. */
	lines: number;
};

const COLUMNS = {
	id: "ADR_ID",
	postcode: "SIHTNUMBER",
	full: "TAISAADRESS",
	x: "VIITEPUNKT_X",
	y: "VIITEPUNKT_Y",
} as const;

/** The CSV entry of the archive (`sihtnumbrid.csv`). */
function csvEntry(archive: Buffer): string {
	let name: string | null = null;
	for (const _ of zipEntries(archive, (entry) => {
		if (!name && /\.csv$/i.test(entry)) name = entry;
		return false;
	})) {
	}
	if (!name) throw new Error("not the ADS address file: no CSV in the archive");
	return name;
}

/**
 * Reads the addresses of the archive the run looks up: the full addresses `addresses` (as
 * `addressKey` writes them) and the ids `ids`. Throws when the archive is not the address file
 * (no CSV, a missing column, fewer lines than a real extract when `minLines` says so).
 */
export async function readAdsIndex(
	archive: Buffer,
	addresses: ReadonlySet<string>,
	ids: ReadonlySet<string>,
	minLines = 1,
): Promise<AdsIndex> {
	const stream = zipEntryStream(archive, csvEntry(archive));
	if (!stream) throw new Error("not the ADS address file: unreadable CSV");
	const lines = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });
	const index: AdsIndex = { byAddress: new Map(), byId: new Map(), lines: 0 };
	let at: Record<keyof typeof COLUMNS, number> | null = null;
	for await (const raw of lines) {
		const line = raw.replace(/^﻿/, "");
		if (!at) {
			at = mapColumns("sihtnumbrid.csv", line.split(";"), COLUMNS);
			continue;
		}
		if (!line) continue;
		index.lines++;
		const fields = line.split(";");
		const id = fields[at.id] ?? "";
		const full = addressKey(fields[at.full] ?? "");
		const wantedById = ids.has(id);
		const wantedByAddress = addresses.has(full);
		if (!wantedById && !wantedByAddress) continue;
		const postcode = fields[at.postcode] ?? "";
		const entry: AdsAddress = {
			point: lest97ToWgs84(Number(fields[at.x]), Number(fields[at.y])),
			postcode: /^[1-9]\d{4}$/.test(postcode) ? postcode : null,
		};
		if (wantedById) index.byId.set(id, entry);
		if (wantedByAddress) index.byAddress.set(full, entry);
	}
	if (!at) throw new Error("not the ADS address file: empty CSV");
	if (index.lines < minLines) {
		throw new Error(
			`the ADS address file holds ${index.lines} lines (at least ${minLines} expected)`,
		);
	}
	return index;
}
