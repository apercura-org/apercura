/**
 * FINESS+ "Structures" (ANS): one large JSON document (gzip) with the legal
 * entities (`pmej`) and their geographic establishments (`pmej[].ege[]`).
 * Closed establishments are included in the file: only open ones are kept.
 * Coordinates are published in WGS84 (`directionLatitude/Longitude`).
 */
import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { createGunzip } from "node:zlib";
import { establishmentSlug, formatStreetText, toE164Fr } from "@apercura/core";
import { JSONParser } from "@streamparser/json";
import { type CopyValue, openCopy } from "../../lib/copy";
import type { Sql } from "../../lib/db";
import { fetchJson } from "../../lib/files";

type DataGouvResource = {
	id: string;
	title: string;
	format: string | null;
	url: string;
	last_modified: string;
	type: string;
};

/** Resolves the most recent daily JSON.gz resource of the FINESS+ dataset. */
export async function resolveLatestFinessUrl(datasetApiUrl: string): Promise<string> {
	const dataset = await fetchJson<{ resources: DataGouvResource[] }>(datasetApiUrl);
	const candidates = dataset.resources
		.filter((resource) => /json\.gz$/i.test(resource.url) && /journalier/i.test(resource.title))
		.sort((a, b) => b.last_modified.localeCompare(a.last_modified));
	const latest = candidates[0];
	if (!latest) throw new Error("No daily FINESS+ JSON.gz resource found on data.gouv.fr");
	return latest.url;
}

type Address = {
	cogCommune?: string | null;
	codePostal?: string | null;
	coordonneesGeographique?: {
		directionLatitude?: string | null;
		directionLongitude?: string | null;
	} | null;
};

type Establishment = {
	informationsGeneralesEGE?: {
		numFinessEge?: string | null;
		nomEgeLong?: string | null;
		nomEgeCourt?: string | null;
		dateFermeture?: string | null;
	};
	categorieentiteGeographiqueExercice?: string | null;
	adresse?: Address[];
	contact?: { telecom?: { telephone?: string | null } | null }[];
	etatObjet?: string | null;
};

type LegalEntity = { ege?: Establishment[] };

export const STG_FINESS_COLUMNS = [
	"finess_et",
	"name",
	"slug",
	"category_code",
	"commune_code",
	"postcode",
	"latitude",
	"longitude",
	"phone",
] as const;

const clean = (value: string | null | undefined) => {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
};

const coordinate = (value: string | null | undefined, min: number, max: number) => {
	const number = Number(value);
	return value && Number.isFinite(number) && number >= min && number <= max ? String(number) : null;
};

/** Maps an establishment to a staging row, or null when it is closed. */
export function finessRow(establishment: Establishment): CopyValue[] | null {
	const info = establishment.informationsGeneralesEGE;
	const finessEt = clean(info?.numFinessEge);
	if (!finessEt || establishment.etatObjet !== "A" || clean(info?.dateFermeture)) return null;
	const name = formatStreetText(clean(info?.nomEgeLong) ?? clean(info?.nomEgeCourt) ?? "") || null;
	const address = establishment.adresse?.[0];
	const coords = address?.coordonneesGeographique;
	return [
		finessEt,
		name,
		establishmentSlug(name ?? "", finessEt),
		clean(establishment.categorieentiteGeographiqueExercice),
		clean(address?.cogCommune),
		clean(address?.codePostal),
		coordinate(coords?.directionLatitude, -90, 90),
		coordinate(coords?.directionLongitude, -180, 180),
		toE164Fr(establishment.contact?.[0]?.telecom?.telephone),
	];
}

async function isGzip(path: string): Promise<boolean> {
	const handle = await open(path, "r");
	try {
		const buffer = Buffer.alloc(2);
		await handle.read(buffer, 0, 2, 0);
		return buffer[0] === 0x1f && buffer[1] === 0x8b;
	} finally {
		await handle.close();
	}
}

/** Streams the FINESS+ document into `directory.stg_finess` (open establishments only). */
export async function loadFiness(sql: Sql, path: string): Promise<{ total: number; open: number }> {
	const writer = await openCopy(sql, "directory.stg_finess", STG_FINESS_COLUMNS);
	const parser = new JSONParser({ paths: ["$.pmej.*"], keepStack: false });
	const pending: CopyValue[][] = [];
	let total = 0;
	parser.onValue = ({ value }) => {
		for (const establishment of (value as LegalEntity).ege ?? []) {
			total++;
			const row = finessRow(establishment);
			if (row) pending.push(row);
		}
	};
	const input = createReadStream(path, { highWaterMark: 1 << 20 });
	const stream = (await isGzip(path)) ? input.pipe(createGunzip()) : input;
	let open = 0;
	try {
		for await (const chunk of stream) {
			parser.write(chunk as Uint8Array);
			for (const row of pending) await writer.write(row);
			open += pending.length;
			pending.length = 0;
		}
		if (!parser.isEnded) parser.end();
	} finally {
		await writer.end();
	}
	return { total, open };
}
