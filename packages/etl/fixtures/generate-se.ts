/**
 * Generates the SYNTHETIC fixtures in `fixtures/se/`: Läkemedelsverket's register of licensed
 * pharmacies (the export to Excel, its sheet of pharmacies and its `Filter` sheet), Västra
 * Götalandsregionen's health centres (the CSV, with a byte-order mark and SWEREF 99 TM points),
 * the two lists' DCAT distributions naming their licence, and SCB's digital boundaries (a ZIP of
 * shapefile ZIPs), filled with fictitious facilities.
 *
 * Every facility is made up: names are made-up words (Exempel, Exempelby), streets do not exist,
 * GLNs are invented under a made-up company prefix with a valid check digit, HSA-ids carry a
 * made-up unit part (`FX…`). The holders' organisation numbers are made up with a valid check
 * digit; one holder is a sole trader whose number is shaped like a personal identity number
 * ("Fixture Person Apotek", `811218-9876`) so the tests can check it is never stored. Never
 * commit real rows. Run with `bun run --cwd packages/etl fixtures:se`.
 *
 * The county and municipality codes and names are the real public ones, but every boundary is a
 * made-up rectangle in SWEREF 99 TM, roughly where the municipality is.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeDbf, writeShpPolygons } from "../src/lib/shapefile";
import { writeXlsxSheets } from "../src/lib/xlsx";
import { writeStoredZip } from "../src/lib/zip";
import { CC_BY_4_URI, CC0_1_URI } from "../src/sources/se/types";

export const SE_FIXTURES = join(import.meta.dirname, "se");

/** Municipalities of the fixtures: code, name, rectangle (west, south, east, north, metres). */
export const SE_FIXTURE_MUNICIPALITIES: readonly [
	string,
	string,
	[number, number, number, number],
][] = [
	["0114", "Upplands Väsby", [660_000, 6_590_000, 670_000, 6_600_000]],
	["0180", "Stockholm", [660_000, 6_570_000, 680_000, 6_590_000]],
	["0980", "Gotland", [680_000, 6_300_000, 740_000, 6_440_000]],
	["1280", "Malmö", [365_000, 6_155_000, 380_000, 6_165_000]],
	["1440", "Ale", [320_000, 6_410_000, 330_000, 6_425_000]],
	["1480", "Göteborg", [310_000, 6_390_000, 330_000, 6_410_000]],
	["1488", "Trollhättan", [330_000, 6_450_000, 345_000, 6_465_000]],
	["1490", "Borås", [370_000, 6_390_000, 390_000, 6_410_000]],
	["2039", "Malung-Sälen", [380_000, 6_750_000, 420_000, 6_800_000]],
];

/** Counties of the fixtures' boundaries: code, SCB's short name, rectangle. */
const COUNTIES: readonly [string, string, [number, number, number, number]][] = [
	["01", "Stockholms", [650_000, 6_560_000, 690_000, 6_610_000]],
	["09", "Gotlands", [675_000, 6_290_000, 745_000, 6_450_000]],
	["12", "Skåne", [355_000, 6_145_000, 390_000, 6_175_000]],
	["14", "Västra Götalands", [300_000, 6_380_000, 400_000, 6_480_000]],
	["20", "Dalarnas", [370_000, 6_740_000, 430_000, 6_810_000]],
];

/** A rectangle as a clockwise ring (a shapefile's outer ring). */
const ring = ([west, south, east, north]: [number, number, number, number]) => [
	{ x: west, y: south },
	{ x: west, y: north },
	{ x: east, y: north },
	{ x: east, y: south },
	{ x: west, y: south },
];

/** A shapefile archive (`.dbf`, `.shp`, `.prj`) of rectangles, as SCB packs each layer. */
function layer(
	base: string,
	fields: [string, string],
	areas: readonly [string, string, [number, number, number, number]][],
): Buffer {
	const dbf = writeDbf(
		[
			{ name: fields[0], type: "C", length: fields[0] === "LnKod" ? 2 : 4 },
			{ name: fields[1], type: "C", length: 20 },
		],
		areas.map(([code, name]) => ({ [fields[0]]: code, [fields[1]]: name })),
		{ encoding: "latin1" },
	);
	return writeStoredZip([
		{ name: `${base}.dbf`, data: dbf },
		{ name: `${base}.shp`, data: writeShpPolygons(areas.map(([, , box]) => [ring(box)])) },
		{ name: `${base}.prj`, data: Buffer.from('PROJCS["SWEREF99 TM"]') },
	]);
}

/** SCB's archive: one ZIP per layer, inside one ZIP. */
export function scbArchive(): Buffer {
	return writeStoredZip([
		{
			name: "LanSweref99TM.zip",
			data: layer("Lan_Sweref99TM_region", ["LnKod", "LnNamn"], COUNTIES),
		},
		{
			name: "Kommun_Sweref99TM.zip",
			data: layer("Kommun_Sweref99TM", ["KnKod", "KnNamn"], SE_FIXTURE_MUNICIPALITIES),
		},
	]);
}

/** A GLN under the made-up company prefix `7359999`, with its GS1 check digit. */
export function fixtureGln(n: number): string {
	const body = `7359999${String(n).padStart(5, "0")}`;
	let sum = 0;
	for (let index = 0; index < 12; index++) sum += Number(body[index]) * (index % 2 === 0 ? 1 : 3);
	return `${body}${(10 - (sum % 10)) % 10}`;
}

/** A legal person's organisation number under `559999`, with its Luhn check digit (`559999-0012`). */
export function fixtureOrgNumber(n: number): string {
	const body = `559999${String(n).padStart(3, "0")}`;
	let sum = 0;
	for (let index = 0; index < 9; index++) {
		let digit = Number(body[index]) * (index % 2 === 0 ? 2 : 1);
		if (digit > 9) digit -= 9;
		sum += digit;
	}
	const check = (10 - (sum % 10)) % 10;
	return `${body.slice(0, 6)}-${body.slice(6)}${check}`;
}

/** The pharmacies' cases the tests look up, by GLN. */
export const APOTEK_CASES = {
	/** A holder written with a double space (`Exempel Apotek  AB`). */
	stockholm: fixtureGln(1),
	/** A cell of several GLNs, the last one truncated: the first is the key. */
	severalGlns: fixtureGln(2),
	severalGlnsOther: fixtureGln(3),
	/** Closed to the public: not listed. */
	closed: fixtureGln(4),
	/** A sole trader holder: the holder is never stored. */
	soleTrader: fixtureGln(5),
	/** A county written in lower case (`Västra götaland`). */
	lowerCounty: fixtureGln(6),
	/** A post town that is the municipality in other casing (`Upplands väsby`). */
	townCasing: fixtureGln(7),
	/** A post town that is not the municipality (`Exempelby` in Ale). */
	otherTown: fixtureGln(8),
	/** A hyphenated municipality written in another casing (`Malung-sälen`). */
	hyphen: fixtureGln(9),
	/** Gotland, a county of one municipality. */
	gotland: fixtureGln(10),
	/** A municipality the boundaries do not know: quarantined, not placed. */
	unknownMunicipality: fixtureGln(11),
} as const;

/** The holder name of the sole trader, which must never be stored. */
export const SOLE_TRADER_HOLDER = "Fixture Person Apotek";

const APOTEK_HEADER = [
	"Län",
	"Kommun",
	"Apotekets namn",
	"Besöksadress",
	"Postnummer",
	"Ort",
	"Tillståndshavare",
	"Tillståndshavare org.nr.",
	"Tillstånd diarienr",
	"Tillstånd giltigt från",
	"GLN-kod",
];

type ApotekOptions = { holder?: string; number?: string; caseNumber?: string; from?: string };

function apotekRows(): string[][] {
	const chain = "Exempel Apotek  AB";
	const chainNumber = fixtureOrgNumber(1);
	const row = (
		place: [county: string, municipality: string],
		name: string,
		street: string,
		postcode: string,
		town: string,
		gln: string,
		{
			holder = chain,
			number = chainNumber,
			caseNumber = `5.9.3-2020-0${gln.slice(-6, -1)}`,
			from = "43891",
		}: ApotekOptions = {},
	) => [...place, name, street, postcode, town, holder, number, caseNumber, from, gln];
	const wrongGln = fixtureGln(12);
	const rows: string[][] = [
		row(
			["Stockholm", "Stockholm"],
			"Exempelapoteket Centrum",
			"Exempelgatan 1",
			"111 22",
			"Stockholm",
			APOTEK_CASES.stockholm,
			{ from: "42248" },
		),
		row(
			["Stockholm", "Stockholm"],
			"Exempelapoteket Sjukhuset",
			"Exempelsjukhuset",
			"171 76",
			"Stockholm",
			`${APOTEK_CASES.severalGlns}, ${APOTEK_CASES.severalGlnsOther}, 73599990`,
			{ from: "2020-03-01" },
		),
		row(
			["Stockholm", "Stockholm"],
			"Exempelapoteket Dos (stängt för allmänheten)",
			"Exempelvägen 2",
			"118 27",
			"Stockholm",
			APOTEK_CASES.closed,
		),
		row(
			["Skåne", "Malmö"],
			"Exempels Apotek",
			"Exempeltorget 3",
			"211 24",
			"Malmö",
			APOTEK_CASES.soleTrader,
			{ holder: SOLE_TRADER_HOLDER, number: "811218-9876" },
		),
		row(
			["Västra götaland", "Göteborg"],
			"Exempelapoteket Hisingen",
			"Exempelgatan 4",
			"417 05",
			"Göteborg",
			APOTEK_CASES.lowerCounty,
			{ from: "" },
		),
		row(
			["Stockholm", "Upplands Väsby"],
			"Exempelapoteket Väsby",
			"Exempelvägen 5",
			"194 40",
			"Upplands väsby",
			APOTEK_CASES.townCasing,
		),
		row(
			["Västra Götaland", "Ale"],
			"Exempelapoteket Exempelby",
			"Exempelvägen 6",
			"449 30",
			"Exempelby",
			APOTEK_CASES.otherTown,
		),
		row(
			["Dalarna", "Malung-sälen"],
			"Exempelapoteket Fjället",
			"Exempelvägen 7",
			"780 67",
			"Sälen",
			APOTEK_CASES.hyphen,
		),
		row(
			["Gotland", "Gotland"],
			"Exempelapoteket Visby",
			"Exempelgatan 8",
			"621 49",
			"Visby",
			APOTEK_CASES.gotland,
		),
		row(
			["Stockholm", "Exempelstad"],
			"Exempelapoteket Ingenstans",
			"Exempelgatan 9",
			"199 99",
			"Exempelstad",
			APOTEK_CASES.unknownMunicipality,
		),
		// A GLN whose check digit is wrong: quarantined.
		row(
			["Stockholm", "Stockholm"],
			"Exempelapoteket Fel",
			"Exempelgatan 10",
			"111 23",
			"Stockholm",
			`${wrongGln.slice(0, 12)}${(Number(wrongGln.slice(12)) + 1) % 10}`,
		),
		// The same GLN twice: the second row is skipped.
		row(
			["Stockholm", "Stockholm"],
			"Exempelapoteket Centrum (kopia)",
			"Exempelgatan 1",
			"111 22",
			"Stockholm",
			APOTEK_CASES.stockholm,
		),
	];
	// Ordinary pharmacies, enough for each listing.
	const towns: [string, string, string][] = [
		["Stockholm", "Stockholm", "113"],
		["Västra Götaland", "Göteborg", "411"],
		["Västra Götaland", "Borås", "503"],
		["Västra Götaland", "Trollhättan", "461"],
		["Skåne", "Malmö", "212"],
	];
	let n = 20;
	for (const [county, town, prefix] of towns) {
		for (let index = 1; index <= 4; index++) {
			n++;
			rows.push(
				row(
					[county, town],
					`Exempelapoteket ${town} ${index}`,
					`Exempelgatan ${n}`,
					`${prefix} ${String(10 + index)}`,
					town,
					fixtureGln(n),
					index % 2 === 0
						? {}
						: { holder: "Exempelkedjan Sverige AB", number: fixtureOrgNumber(2) },
				),
			);
		}
	}
	return rows;
}

/** The export to Excel; `filtered` writes the `Filter` sheet a filtered search leaves. */
export function apotekWorkbook({ filtered = false }: { filtered?: boolean } = {}): Buffer {
	return writeXlsxSheets(
		[
			{ name: "2026-11-27", rows: [APOTEK_HEADER, ...apotekRows()] },
			{
				name: "Filter",
				rows: [
					[
						"Listan är gjord på ett urval av apotek baserat på det filter användaren valt när filen genererades.",
					],
					["Varje rad nedan har infriats i urvalet som presenteras i listan"],
					[],
					[filtered ? "Län: Stockholm" : "Inget filter aktivt"],
				],
			},
		],
		{ deflate: true },
	);
}

/** The health centres' cases the tests look up, by HSA-id. */
export const VC_CASES = {
	/** Inside Göteborg's boundary, run by a company. */
	company: "SE2321000131-FX0001",
	/** Run by Närhälsan, the region's own unit. */
	region: "SE2321000131-FX0002",
	/** Outside every boundary, its post town a municipality (Trollhättan). */
	postTown: "SE2321000131-FX0003",
	/** Outside every boundary and post town, 3 km from Göteborg's. */
	nearest: "SE2321000131-FX0004",
	/** In Stockholm, outside the region: quarantined. */
	outside: "SE2321000131-FX0005",
} as const;

const VC_HEADER = ["id", "hsaid", "namn", "foretag", "adress", "postnummer", "postort", "x", "y"];

/** A line of the CSV: id, HSA-id, name, operator, street, postcode, post town, northing, easting. */
const vc = (...fields: string[]) => fields;

function vcRows(): string[][] {
	const company = "Exempel Vård AB";
	const rows: string[][] = [
		vc(
			"1",
			VC_CASES.company,
			"Exempel Vårdcentral Centrum",
			company,
			"Exempelgatan 1",
			"41103",
			"Göteborg",
			"6400000",
			"320000",
		),
		vc(
			"2",
			VC_CASES.region,
			"Närhälsan Exempel vårdcentral",
			"Närhälsan",
			"Exempelgatan 2",
			"41104",
			"Göteborg",
			"6402000",
			"322000",
		),
		vc(
			"3",
			VC_CASES.postTown,
			"Exempel Läkarhus",
			"Exempel Läkarhus AB",
			"Exempelvägen 3",
			"46130",
			"Trollhättan",
			"6470000",
			"338000",
		),
		vc(
			"4",
			VC_CASES.nearest,
			"Exempelö Vårdcentral",
			company,
			"Exempelvägen 4",
			"43090",
			"Exempelö",
			"6395000",
			"307000",
		),
		vc(
			"5",
			VC_CASES.outside,
			"Exempel Vårdcentral Stockholm",
			company,
			"Exempelgatan 5",
			"11122",
			"Stockholm",
			"6580000",
			"670000",
		),
		// An HSA-id that is not one: quarantined.
		vc(
			"6",
			"XX-1",
			"Exempel Fel",
			company,
			"Exempelgatan 6",
			"41105",
			"Göteborg",
			"6400500",
			"320500",
		),
		// The same HSA-id twice: the second line is skipped.
		vc(
			"7",
			VC_CASES.company,
			"Exempel Vårdcentral Centrum",
			company,
			"Exempelgatan 1",
			"41103",
			"Göteborg",
			"6400000",
			"320000",
		),
	];
	const towns: [string, string, number, number][] = [
		["Göteborg", "411", 6_405_000, 315_000],
		["Borås", "503", 6_400_000, 380_000],
		["Ale", "449", 6_415_000, 325_000],
		["Trollhättan", "461", 6_455_000, 337_000],
	];
	let n = 10;
	for (const [town, prefix, north, east] of towns) {
		for (let index = 1; index <= 3; index++) {
			n++;
			rows.push(
				vc(
					String(n),
					`SE2321000131-FX00${n}`,
					`Exempel Vårdcentral ${town} ${index}`,
					index === 1 ? "Närhälsan" : "Exempel Primärvård AB",
					`Exempelvägen ${n}`,
					`${prefix}${30 + index}`,
					town,
					String(north + index * 100),
					String(east + index * 100),
				),
			);
		}
	}
	return rows;
}

const csvField = (value: string) =>
	/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/** The CSV distribution, with its byte-order mark. */
export function vardcentralerCsv(): string {
	return `\uFEFF${[VC_HEADER, ...vcRows()].map((row) => row.map(csvField).join(",")).join("\r\n")}\r\n`;
}

/** A DCAT distribution as EntryScape serves it (RDF/JSON), naming `licence`. */
export function licenceJson(resource: string, licence: string): string {
	return `${JSON.stringify(
		{
			[resource]: {
				"http://purl.org/dc/terms/license": [{ type: "uri", value: licence }],
				"http://purl.org/dc/terms/title": [{ type: "literal", value: "Fixture", lang: "sv" }],
				"http://www.w3.org/1999/02/22-rdf-syntax-ns#type": [
					{ type: "uri", value: "http://www.w3.org/ns/dcat#Distribution" },
				],
			},
		},
		null,
		"\t",
	)}\n`;
}

export function generateSeFixtures(dir: string = SE_FIXTURES): void {
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "scb-granser.zip"), scbArchive());
	writeFileSync(join(dir, "apotek.xlsx"), apotekWorkbook());
	writeFileSync(
		join(dir, "apotek.licence.json"),
		licenceJson("https://catalog.lakemedelsverket.se/store/1/resource/37", CC_BY_4_URI),
	);
	writeFileSync(join(dir, "vardcentraler.csv"), vardcentralerCsv());
	writeFileSync(
		join(dir, "vardcentraler.licence.json"),
		licenceJson("https://vgregion.entryscape.net/store/7/resource/48", CC0_1_URI),
	);
}

if (import.meta.main) {
	generateSeFixtures();
	console.log(`Swedish fixtures written to ${SE_FIXTURES}`);
}
