/**
 * Generates the SYNTHETIC fixtures in `fixtures/mt/`: the Medicines Authority's register of
 * licensed pharmacies in the API's format (`pharmacies.json`), its record in the European data
 * portal's catalogue (`catalogue.json`) and the Planning Authority's local councils that
 * `etl:places --country mt` reads (`mt-local-councils.geojson`).
 *
 * Every pharmacy and street is made up: names say they are examples (Example, Specimen),
 * licence numbers are of a range of their own (`DL 9xx`), phone numbers too (`2123 4xxx`), and
 * some rows are what the import must skip or quarantine (a hospital in-patient pharmacy, a
 * licence that is not one). Never commit real rows. Deterministic: the same files on every run.
 * Run with `bun run --cwd packages/etl fixtures:mt`.
 *
 * The 68 localities are real codes of the NSO, each drawn as a rectangle of a grid over the
 * islands' box (Malta's 54 to the south-east, Gozo's 14 to the north-west), not their real
 * boundaries.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MT_LOCALITIES } from "@apercura/core/country";

export const MT_FIXTURES = join(import.meta.dirname, "mt");

/** The day the fixture's catalogue record says the register changed. */
export const MT_FIXTURE_DAY = "2026-11-18";

const MALTA_CODES = Object.keys(MT_LOCALITIES).filter((code) => code.startsWith("01"));
const GOZO_CODES = Object.keys(MT_LOCALITIES).filter((code) => code.startsWith("02"));

/** A grid cell of a fixture locality: south-west corner and size, in degrees. */
type Cell = { code: string; west: number; south: number; width: number; height: number };

function grid(codes: readonly string[], box: [number, number, number, number], columns: number) {
	const [west, south, east, north] = box;
	const rows = Math.ceil(codes.length / columns);
	const width = (east - west) / columns;
	const height = (north - south) / rows;
	return codes.map(
		(code, index): Cell => ({
			code,
			west: west + (index % columns) * width,
			south: south + Math.floor(index / columns) * height,
			width,
			height,
		}),
	);
}

/** Malta's 54 localities over its box, Gozo's 14 over Gozo's. */
export const MT_CELLS: readonly Cell[] = [
	...grid(MALTA_CODES, [14.33, 35.8, 14.57, 35.99], 9),
	...grid(GOZO_CODES, [14.19, 36.0, 14.34, 36.08], 7),
];

/** A point inside a locality's cell (`dx`, `dy` from 0 to 1 across it). */
export function pointIn(code: string, dx = 0.5, dy = 0.5): { latitude: number; longitude: number } {
	const cell = MT_CELLS.find((item) => item.code === code);
	if (!cell) throw new Error(`no fixture cell for ${code}`);
	return {
		longitude: Math.round((cell.west + dx * cell.width) * 1e8) / 1e8,
		latitude: Math.round((cell.south + dy * cell.height) * 1e8) / 1e8,
	};
}

export type MtFixturePharmacy = {
	/** 1–122: the licence `DL 9xx` (`DL 9100` from 100), the phone `2123 4xxx`. */
	index: number;
	type: string;
	name: string;
	street: string;
	locality: string;
	postcode: string;
	/** The locality whose cell holds the point, or null for a row without a point. */
	at: string | null;
	/** The licence number as the register writes it (default `DL 9xx`). */
	licence?: string;
	phone?: string | null;
};

export type MtFixtureSet = { day: string; pharmacies: MtFixturePharmacy[] };

/** The licence key of a fixture pharmacy (`DL 901` → `901`). */
export const fixtureKey = (index: number) => `9${String(index).padStart(2, "0")}`;

const COMMUNITY = "Community Pharmacies";

const town = (code: string) => MT_LOCALITIES[code]?.maltese ?? code;

/** A hundred community pharmacies spread over Malta's localities, licences `DL 910`–`DL 9109`. */
const spread: MtFixturePharmacy[] = Array.from({ length: 100 }, (_, i) => {
	const code = MALTA_CODES[(i * 7) % MALTA_CODES.length] ?? "01101";
	return {
		index: 10 + i,
		type: COMMUNITY,
		name: `Example ${["Harbour", "Square", "Parish", "Village", "Corner", "Market"][i % 6]} Pharmacy ${i + 1}`,
		street: `${i + 1}, Triq l-Eżempju`,
		locality: town(code),
		postcode: `EXA ${String(1000 + i)}`,
		at: code,
	};
});

export const MT_PHARMACIES: MtFixtureSet = {
	day: MT_FIXTURE_DAY,
	pharmacies: [
		{
			index: 1,
			type: COMMUNITY,
			name: "Example Valletta Pharmacy",
			street: "1, Triq ir-Repubblika,",
			locality: "Il-Belt Valletta",
			postcode: "VLT 1111",
			at: "01101",
		},
		{
			index: 2,
			type: COMMUNITY,
			name: "Example Sliema\nSeafront Pharmacy",
			street: "2, Triq it-Torri",
			locality: "Tas-Sliema",
			postcode: "slm1022",
			at: "01259",
			phone: "2123 4002 / 7912 3402",
		},
		{
			index: 3,
			type: COMMUNITY,
			name: "Specimen Pharmacy",
			street: "3, Triq il-Kbira",
			locality: "Birkirkara",
			postcode: "BKR 1000",
			at: "01214",
		},
		{
			index: 4,
			type: "Community and Medical Oxygen Pharmacy",
			name: "Example Gozo Pharmacy",
			street: "4, Pjazza l-Indipendenza",
			locality: "Ir-Rabat, Għawdex",
			postcode: "VCT 9000",
			at: "02611",
		},
		{
			// No point: placed by the locality it names, at the locality's centre.
			index: 5,
			type: COMMUNITY,
			name: "Example Luqa Pharmacy",
			street: "5, Triq il-Knisja",
			locality: "Ħal Luqa",
			postcode: "LQA 1000",
			at: null,
		},
		{
			// A postal locality of the next council: placed by its point, in Pietà.
			index: 6,
			type: COMMUNITY,
			name: "Example Gwardamanġa Pharmacy",
			street: "6, Triq Sant'Antnin",
			locality: "L-Imsida",
			postcode: "PTA 1000",
			at: "01247",
			phone: "not a number",
		},
		{
			index: 7,
			type: COMMUNITY,
			name: "Example Qawra Pharmacy",
			street: "7, Triq il-Qawra",
			locality: "St. Paul’s Bay",
			postcode: "SPB 1000",
			at: "01555",
		},
		// Gozo: three pharmacies in Victoria, so its district and locality have listings.
		{
			index: 8,
			type: COMMUNITY,
			name: "Example Victoria Pharmacy",
			street: "8, Triq ir-Repubblika",
			locality: "Ir-Rabat, Għawdex",
			postcode: "VCT 1000",
			at: "02611",
		},
		{
			index: 9,
			type: COMMUNITY,
			name: "Example Citadel Pharmacy",
			street: "9, Pjazza San Ġorġ",
			locality: "Victoria",
			postcode: "VCT 1001",
			at: "02611",
		},
		...spread,
		// Not listed: no public counter.
		{
			index: 120,
			type: "Inpatient Pharmacies",
			name: "Example General Hospital Pharmacy",
			street: "Example Hospital",
			locality: "L-Imsida",
			postcode: "MSD 2090",
			at: "01241",
		},
		{
			index: 121,
			type: "Government Entities Pharmacies",
			name: "Example Government Dispensary",
			street: "91, Triq il-Gvern",
			locality: "Paola",
			postcode: "PLA 1000",
			at: "01145",
		},
		// Quarantined: a licence number that is not one.
		{
			index: 122,
			type: COMMUNITY,
			name: "Example Unlicensed Pharmacy",
			street: "92, Triq l-Eżempju",
			locality: "Il-Mosta",
			postcode: "MST 1000",
			at: "01539",
			licence: "PENDING",
		},
	],
};

function registerRow(pharmacy: MtFixturePharmacy, lineNo: number) {
	const point = pharmacy.at ? pointIn(pharmacy.at, 0.3 + (pharmacy.index % 5) * 0.1, 0.6) : null;
	return {
		ID: String(lineNo),
		Type: pharmacy.type,
		Licence_No: pharmacy.licence ?? `DL ${fixtureKey(pharmacy.index)}`,
		Pharmacy_Name: pharmacy.name,
		Pharmacy_Address: pharmacy.street,
		Locality: pharmacy.locality,
		Post_Code: pharmacy.postcode,
		Telephone_No:
			pharmacy.phone === undefined
				? `2123 4${String(pharmacy.index).padStart(3, "0")}`
				: pharmacy.phone,
		Lattitude: point ? String(point.latitude) : null,
		Longitude: point ? String(point.longitude) : null,
	};
}

/** The register as the API answers it. */
export function pharmaciesJson(set: MtFixtureSet = MT_PHARMACIES): string {
	return `${JSON.stringify({ value: set.pharmacies.map((item, index) => registerRow(item, index + 1)) }, null, "\t")}\n`;
}

/** The register's record in the European data portal, trimmed to what the import reads. */
export function catalogueJson(
	day: string = MT_FIXTURE_DAY,
	overrides: { publisher?: string; licence?: string } = {},
): string {
	return `${JSON.stringify(
		{
			result: {
				id: "0dfe65b7-626f-49ef-ab09-6a6ab8a4db72",
				title: { en: "Licensed Pharmacies in Malta and Gozo" },
				publisher: { type: "Agent", name: overrides.publisher ?? "Medicines Authority" },
				modified: `${day}T13:44:54`,
				distributions: [
					{
						format: { id: "API" },
						license: { id: overrides.licence ?? "https://creativecommons.org/licenses/by/4.0/" },
						access_url: ["https://data.gov.mt/Pharmacy/V1/Pharmacy"],
					},
				],
			},
		},
		null,
		"\t",
	)}\n`;
}

const rectangle = (cell: Cell) => {
	const { west, south, width, height } = cell;
	const round = (value: number) => Math.round(value * 1e6) / 1e6;
	const ring = [
		[west, south],
		[west + width, south],
		[west + width, south + height],
		[west, south + height],
		[west, south],
	].map(([x = 0, y = 0]) => [round(x), round(y)]);
	return { type: "MultiPolygon", coordinates: [[ring]] };
};

/** The Planning Authority's administrative units, as its WFS answers in GeoJSON (trimmed). */
export function localCouncilsGeojson(): string {
	return `${JSON.stringify({
		type: "FeatureCollection",
		features: MT_CELLS.map((cell) => ({
			type: "Feature",
			properties: {
				nationalCode: `MT${cell.code}`,
				name: {
					GeographicalName: {
						spelling: { SpellingOfName: { text: MT_LOCALITIES[cell.code]?.name.toUpperCase() } },
					},
				},
			},
			geometry: rectangle(cell),
		})),
	})}\n`;
}

export function writeMtFixtures(dir: string = MT_FIXTURES, set: MtFixtureSet = MT_PHARMACIES) {
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "pharmacies.json"), pharmaciesJson(set));
	writeFileSync(join(dir, "catalogue.json"), catalogueJson(set.day));
	writeFileSync(join(dir, "mt-local-councils.geojson"), localCouncilsGeojson());
}

if (import.meta.main) {
	writeMtFixtures();
	console.log(`Wrote the Maltese fixtures to ${MT_FIXTURES}`);
}
