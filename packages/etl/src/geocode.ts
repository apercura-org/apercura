/**
 * Batch geocoding with the Géoplateforme (IGN) CSV endpoint, during the import
 * only. Results are cached by normalized address in `directory.geocode_cache`.
 *
 * A result is accepted when its score is >= 0.6 and it lands in the expected
 * commune (or in an arrondissement of it). Otherwise the site falls back to
 * the commune centroid with precision `city`.
 */
import { addressKey } from "@apercura/core";
import { sleep, USER_AGENT } from "./lib/files";
import { parseQuotedRecord } from "./lib/text";

export const GEOCODE_MIN_SCORE = 0.6;
/** The endpoint accepts up to 200,000 lines or 50 MB; smaller chunks retry cheaply. */
export const GEOCODE_CHUNK_SIZE = 50_000;

export type GeocodeInput = {
	key: string;
	line: string;
	postcode: string | null;
	citycode: string | null;
};

export type GeocodeResult = {
	key: string;
	latitude: number | null;
	longitude: number | null;
	score: number | null;
	resultType: string | null;
	resultCitycode: string | null;
	precision: "address" | "street" | "city" | null;
};

export function geocodeInput(
	line: string,
	postcode: string | null,
	citycode: string | null,
): GeocodeInput {
	return { key: addressKey(line, postcode, citycode), line, postcode, citycode };
}

const csvField = (value: string | null) =>
	value === null ? "" : /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export function buildGeocodeCsv(inputs: readonly GeocodeInput[]): string {
	const lines = ["key,adresse,postcode,citycode"];
	inputs.forEach((input, index) => {
		lines.push(
			[
				String(index),
				csvField(input.line),
				csvField(input.postcode),
				csvField(input.citycode),
			].join(","),
		);
	});
	return `${lines.join("\n")}\n`;
}

const PRECISION: Readonly<Record<string, GeocodeResult["precision"]>> = {
	housenumber: "address",
	street: "street",
	locality: "street",
	municipality: "city",
};

/** Parses the geocoder CSV answer back into results keyed like the inputs. */
export function parseGeocodeCsv(csv: string, inputs: readonly GeocodeInput[]): GeocodeResult[] {
	const lines = csv.split(/\r?\n/).filter((line) => line !== "");
	const header = parseQuotedRecord(lines[0] ?? "", ",") ?? [];
	const column = (name: string) => header.indexOf(name);
	const keyIndex = column("key");
	const latIndex = column("latitude");
	const lonIndex = column("longitude");
	const scoreIndex = column("result_score");
	const typeIndex = column("result_type");
	const cityIndex = column("result_citycode");
	if ([keyIndex, latIndex, lonIndex, scoreIndex, typeIndex, cityIndex].some((index) => index < 0)) {
		throw new Error(`Unexpected geocoder header: ${lines[0]}`);
	}
	const results: GeocodeResult[] = [];
	for (const line of lines.slice(1)) {
		const fields = parseQuotedRecord(line, ",");
		if (!fields) continue;
		const input = inputs[Number(fields[keyIndex])];
		if (!input) continue;
		const number = (value: string | undefined) =>
			value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
		const resultType = fields[typeIndex] || null;
		results.push({
			key: input.key,
			latitude: number(fields[latIndex]),
			longitude: number(fields[lonIndex]),
			score: number(fields[scoreIndex]),
			resultType,
			resultCitycode: fields[cityIndex] || null,
			precision: resultType ? (PRECISION[resultType] ?? "city") : null,
		});
	}
	return results;
}

/**
 * True when a cached result can be used for a site: good enough score and a
 * commune among `allowedCitycodes` (the site's commune and its arrondissements,
 * or the communes of its postcode when the commune is unknown).
 */
export function acceptGeocode(
	result: Pick<GeocodeResult, "score" | "resultCitycode" | "latitude" | "longitude">,
	allowedCitycodes: ReadonlySet<string>,
): boolean {
	return (
		result.score !== null &&
		result.score >= GEOCODE_MIN_SCORE &&
		result.latitude !== null &&
		result.longitude !== null &&
		result.resultCitycode !== null &&
		allowedCitycodes.has(result.resultCitycode)
	);
}

/** Geocodes inputs in chunks, sequentially (the endpoint is rate-limited). */
export async function geocodeBatch(
	url: string,
	inputs: readonly GeocodeInput[],
	onChunk?: (done: number, total: number) => void,
): Promise<GeocodeResult[]> {
	const results: GeocodeResult[] = [];
	for (let start = 0; start < inputs.length; start += GEOCODE_CHUNK_SIZE) {
		const chunk = inputs.slice(start, start + GEOCODE_CHUNK_SIZE);
		results.push(...(await geocodeChunk(url, chunk)));
		onChunk?.(Math.min(start + chunk.length, inputs.length), inputs.length);
	}
	return results;
}

async function geocodeChunk(
	url: string,
	inputs: readonly GeocodeInput[],
): Promise<GeocodeResult[]> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= 4; attempt++) {
		try {
			const form = new FormData();
			form.append("data", new Blob([buildGeocodeCsv(inputs)], { type: "text/csv" }), "sites.csv");
			form.append("columns", "adresse");
			form.append("postcode", "postcode");
			form.append("citycode", "citycode");
			for (const column of [
				"latitude",
				"longitude",
				"result_score",
				"result_type",
				"result_citycode",
			]) {
				form.append("result_columns", column);
			}
			const response = await fetch(url, {
				method: "POST",
				body: form,
				headers: { "user-agent": USER_AGENT },
			});
			if (response.status === 429 || response.status >= 500) {
				throw new Error(`geocoder answered ${response.status}`);
			}
			if (!response.ok) {
				throw new Error(`geocoder answered ${response.status}: ${await response.text()}`);
			}
			return parseGeocodeCsv(await response.text(), inputs);
		} catch (error) {
			lastError = error;
			await sleep(2_000 * attempt);
		}
	}
	throw new Error("Geocoding failed after 4 attempts", { cause: lastError });
}
