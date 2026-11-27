/**
 * Generates the SYNTHETIC fixtures in `fixtures/ie/`: the PSI's register of pharmacies (the
 * XLSX extract with its `Extract` and `Terms & Conditions of Use` sheets), HIQA's register of
 * designated centres for older people (the CSV export, with a byte-order mark and quoted
 * commas), the HSE's Health Atlas layers of hospitals and health centres (ArcGIS GeoJSON, with
 * their items' licence), Tailte Éireann's 26 counties, the CSO's census towns and the
 * gazetteer's points, filled with fictitious facilities.
 *
 * Every facility is made up: names are made-up words (Example, Sample, Exampleton, Sampla),
 * streets do not exist, phone numbers are made up (`… 999 …`), Eircodes are invented in the
 * right form. The columns a page never reads are filled with invented values ("Fixture Owner
 * Limited", "Fixture Person In Charge", a provider "A. N. Example") so the tests can check they
 * are never stored. Never commit real rows. Run with `bun run --cwd packages/etl fixtures:ie`.
 *
 * The county codes and the census towns' codes and names are the real public ones, but every
 * boundary is a made-up rectangle: the 26 counties are cells of a grid over Ireland's extent,
 * each town a small square inside its county's cell (Athlone's reaches across the border into
 * Roscommon's, as the real town does).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { IE_COUNTIES, IE_PROVINCES } from "@apercura/core/country";
import { writeXlsxSheets } from "../src/lib/xlsx";

export const IE_FIXTURES = join(import.meta.dirname, "ie");

/** The counties in the grid's order, six to a row from the north-west: Roscommon then Westmeath, side by side. */
const GRID = [
	"50000", // Donegal
	"200000", // Sligo
	"110000", // Leitrim
	"20000", // Cavan
	"170000", // Monaghan
	"140000", // Louth
	"150000", // Mayo
	"190000", // Roscommon
	"230000", // Westmeath
	"130000", // Longford
	"160000", // Meath
	"260000", // Dublin
	"60000", // Galway
	"180000", // Offaly
	"100000", // Laois
	"80000", // Kildare
	"250000", // Wicklow
	"10000", // Carlow
	"30000", // Clare
	"210000", // Tipperary
	"90000", // Kilkenny
	"240000", // Wexford
	"120000", // Limerick
	"220000", // Waterford
	"70000", // Kerry
	"40000", // Cork
];

const CELL = { width: 0.8, height: 0.7, west: -10.4, north: 55.1 };

/** A county's cell: west, south, east, north. */
function cell(county: string): [number, number, number, number] {
	const index = GRID.indexOf(county);
	if (index < 0) throw new Error(`no cell for ${county}`);
	const west = CELL.west + (index % 6) * CELL.width;
	const north = CELL.north - Math.floor(index / 6) * CELL.height;
	return [west, north - CELL.height, west + CELL.width, north];
}

const round = (value: number) => Math.round(value * 1e5) / 1e5;

const rectangle = (west: number, south: number, east: number, north: number) => ({
	type: "Polygon",
	coordinates: [
		[
			[round(west), round(south)],
			[round(east), round(south)],
			[round(east), round(north)],
			[round(west), round(north)],
			[round(west), round(south)],
		],
	],
});

/**
 * Census towns: code, name as the census writes it, county, and the square's south-west corner
 * and size inside the county's cell (fractions of the cell).
 */
const TOWNS: [string, string, string, number, number, number][] = [
	["02341", "Dublin city and suburbs", "260000", 0.2, 0.2, 0.6],
	["17364", "Cork city and suburbs", "40000", 0.2, 0.2, 0.5],
	["26305", "Galway city and suburbs", "60000", 0.5, 0.4, 0.3],
	["27299", "An Spidéal", "60000", 0.1, 0.4, 0.15],
	["20497", "Limerick city and suburbs", "120000", 0.3, 0.3, 0.4],
	["24643", "Waterford city and suburbs", "220000", 0.3, 0.3, 0.4],
	["30252", "Boyle", "190000", 0.2, 0.7, 0.15],
	["13188", "Mullingar", "230000", 0.5, 0.5, 0.2],
	["33094", "Ballybofey-Stranorlar", "50000", 0.2, 0.2, 0.15],
	["33091", "Letterkenny", "50000", 0.6, 0.6, 0.2],
	["01639", "Carlow", "10000", 0.3, 0.6, 0.2],
	["01640", "Muinebeag (Bagenalstown)", "10000", 0.3, 0.1, 0.15],
	["08171", "Abbeyleix", "100000", 0.2, 0.2, 0.15],
	["08167", "Portlaoise", "100000", 0.6, 0.6, 0.2],
	["19840", "Killarney", "70000", 0.3, 0.2, 0.2],
	["19849", "Tralee", "70000", 0.3, 0.6, 0.2],
	["31143", "Sligo", "200000", 0.4, 0.4, 0.2],
	["16562", "Ennis", "30000", 0.4, 0.4, 0.2],
	["14596", "Wexford", "240000", 0.4, 0.3, 0.2],
	["29321", "Ballina", "150000", 0.4, 0.6, 0.2],
	["22496", "Ballina", "210000", 0.1, 0.1, 0.15],
	["11416", "Navan", "160000", 0.4, 0.4, 0.2],
];

/** A town's square: west, south, east, north. */
function townBox(code: string): [number, number, number, number] {
	if (code === "13200") {
		// Athlone, in Westmeath, reaches across the Shannon into Roscommon.
		const [west, south] = cell("230000");
		return [west - 0.05, south + 0.3, west + 0.15, south + 0.45];
	}
	const town = TOWNS.find((entry) => entry[0] === code);
	if (!town) throw new Error(`no town ${code}`);
	const [, , county, dx, dy, size] = town;
	const [west, south] = cell(county);
	return [
		west + dx * CELL.width,
		south + dy * CELL.height,
		west + (dx + size) * CELL.width,
		south + (dy + size) * CELL.height,
	];
}

/** A point inside a town, `t` of the way across its square (0–1, both ways). */
function inTown(code: string, t = 0.5, u = t): [number, number] {
	const [west, south, east, north] = townBox(code);
	return [round(west + (east - west) * t), round(south + (north - south) * u)];
}

/** A point in a county's cell outside every town (its north-east corner). */
function outsideTowns(county: string): [number, number] {
	const [, , east, north] = cell(county);
	return [round(east - 0.03), round(north - 0.03)];
}

const geojson = (features: object[]) =>
	`${JSON.stringify({ type: "FeatureCollection", crs: { type: "name", properties: { name: "EPSG:4326" } }, features }, null, 1)}\n`;

function counties(): string {
	return geojson(
		GRID.map((code, index) => {
			const county = IE_COUNTIES[code];
			if (!county) throw new Error(code);
			return {
				type: "Feature",
				id: index + 1,
				geometry: rectangle(...cell(code)),
				properties: {
					CO_ID: code,
					ENGLISH: county.name.toUpperCase(),
					GAEILGE: county.irish,
					PROVINCE: IE_PROVINCES[county.province],
				},
			};
		}),
	);
}

function towns(): string {
	const all = [...TOWNS.map((town) => [town[0], town[1]] as const), ["13200", "Athlone"] as const];
	return geojson(
		all.map(([code, name], index) => ({
			type: "Feature",
			geometry: rectangle(...townBox(code)),
			properties: { BUA_CODE: code, BUA_NAME: name, T1_1AGETT_Norm: 20_000 - index * 500 },
		})),
	);
}

function placenames(): string {
	const point = (english: string, irish: string, county: string, at: [number, number]) => ({
		type: "Feature",
		geometry: { type: "Point", coordinates: at },
		properties: { English_Na: english, Irish_Name: irish, County: county },
	});
	const [athloneWest, athloneSouth] = townBox("13200");
	return geojson([
		point("Tallaght", "Tamhlacht", "DUBLIN", inTown("02341", 0.3, 0.2)),
		point("Blanchardstown", "Baile Bhlainséir", "DUBLIN", inTown("02341", 0.2, 0.8)),
		point("Ballincollig", "Baile an Chollaigh", "CORK", inTown("17364", 0.1, 0.5)),
		point("Spiddle", "An Spidéal", "GALWAY", inTown("27299")),
		// Monksland: the part of Athlone in Roscommon.
		point("Monksland", "Cluain Uí Bhrain", "ROSCOMMON", [
			round(athloneWest + 0.02),
			round(athloneSouth + 0.07),
		]),
		// Outside every town: not another name of any.
		point("Kilsample", "Cill Sampla", "KERRY", outsideTowns("70000")),
	]);
}

// ---------------------------------------------------------------------------
// The PSI's register of pharmacies
// ---------------------------------------------------------------------------

/** Towns of the filler rows: the town as a register writes it and its county column. */
const FILLER_TOWNS: [string, string, string][] = [
	// [town column, PSI county, HIQA county]
	["Dublin 8", "Dublin 8", "Dublin"],
	["Cork", "Co. Cork", "Cork"],
	["Galway", "Co. Galway", "Galway"],
	["Limerick", "Co. Limerick", "Limerick"],
	["Waterford", "Co. Waterford", "Waterford"],
	["Mullingar", "Co. Westmeath", "Westmeath"],
	["Letterkenny", "Co. Donegal", "Donegal"],
	["Carlow", "Co. Carlow", "Carlow"],
	["Portlaoise", "Co. Laois", "Laois"],
	["Tralee", "Co. Kerry", "Kerry"],
	["Sligo", "Co. Sligo", "Sligo"],
	["Ennis", "Co. Clare", "Clare"],
	["Wexford", "Co. Wexford", "Wexford"],
	["Ballina", "Co. Mayo", "Mayo"],
	["Navan", "Co. Meath", "Meath"],
];

/** An invented Eircode of the right form (`X91 X905`). */
const eircode = (routing: string, index: number) => `${routing} X${String(900 + index).slice(-3)}`;

const PSI_HEADER = [
	"Registration Number",
	"Trading Name",
	"Street 1",
	"Street 2",
	"Street 3",
	"Town",
	"Eircode",
	"County",
	"RPB Owner",
];

const PSI_TERMS = [
	["Details about re-use of Pharmaceutical Society of Ireland (PSI) information"],
	[
		"The PSI complies with the Regulations on the re-use of Public Sector Information and it encourages the re-use of the information that it produces.",
	],
	["Generally re-use is subject to the following conditions. You must:"],
	[
		"•   Acknowledge the source and copyright of the PSI in cases where you supply the information to others",
	],
	["•   Reproduce the information accurately"],
	["•   Not use the information in a misleading way"],
	[
		"•   Not use the information for the principal purpose of advertising or promoting a particular product or service",
	],
];

/** The special rows of the register: each one case of the placing and naming rules. */
export const PSI_CASES = {
	/** Town column empty, county a Dublin postal district: placed in Dublin by the district. */
	district: "9001",
	/** A gazetteer locality inside Dublin: placed by another name. */
	alias: "9002",
	/** Athlone written in Co. Roscommon (Monksland): the town across the border. */
	otherCounty: "9003",
	/** A village outside every census town: placed in County Kerry only, unlocated. */
	countyOnly: "9004",
	/** A part of a compound town name (Ballybofey-Stranorlar). */
	compound: "9005",
	/** Douglas: a documented other name of Cork (a suburb the gazetteer has no point for). */
	manualAlias: "9006",
	/** A name in capitals, cased. */
	upperCase: "9007",
} as const;

export function psiWorkbook({ terms = true }: { terms?: boolean } = {}): Buffer {
	const row = (
		id: string,
		name: string,
		streets: [string, string, string],
		town: string,
		code: string,
		county: string,
	) => [id, name, ...streets, town, code, county, "Fixture Owner Limited"];
	const rows: string[][] = [
		row(
			PSI_CASES.district,
			"Example Pharmacy Blanchardstown",
			["Unit 1", "Example Centre", ""],
			"",
			"D15 X901",
			"Dublin 15",
		),
		row(
			PSI_CASES.alias,
			"Sample Pharmacy Tallaght",
			["2 Example Street", "", ""],
			"Tallaght",
			"D24 X902",
			"Dublin 24",
		),
		row(
			PSI_CASES.otherCounty,
			"Example Pharmacy Monksland",
			["Unit 3", "Example Retail Park", "Monksland"],
			"Athlone",
			"N37 X903",
			"Co. Roscommon",
		),
		row(
			PSI_CASES.countyOnly,
			"Example Village Pharmacy",
			["Main Street", "", ""],
			"Sampleville",
			"V93 X904",
			"Co. Kerry",
		),
		row(
			PSI_CASES.compound,
			"Sample Pharmacy Stranorlar",
			["Example Road", "", ""],
			"Stranorlar",
			"F93 X905",
			"Co. Donegal",
		),
		row(
			PSI_CASES.manualAlias,
			"Example Pharmacy Douglas",
			["Unit 4", "Example Village Centre", ""],
			"Douglas",
			"T12 X906",
			"Co. Cork",
		),
		row(
			PSI_CASES.upperCase,
			"SAMPLE CHEMIST",
			["1 EXAMPLE SQUARE", "", ""],
			"Boyle",
			"F52 X907",
			"Co. Roscommon",
		),
		// Broken: a registration number that is not one, quarantined.
		row(
			"PSI-X",
			"Example Broken Pharmacy",
			["Example Street", "", ""],
			"Cork",
			"T12 X908",
			"Co. Cork",
		),
	];
	for (let index = 0; index < 215; index++) {
		const [town, county] = FILLER_TOWNS[index % FILLER_TOWNS.length] ?? ["Cork", "Co. Cork"];
		rows.push(
			row(
				String(10_000_000 + index),
				`Example Pharmacy No. ${index + 1}`,
				[`${index + 1} Example Street`, "", ""],
				town,
				eircode(county.startsWith("Dublin") ? "D08" : "T12", index % 100),
				county,
			),
		);
	}
	const extract = [
		["Pharmaceutical Society of Ireland", "", "", "", "", "", "", "", ""],
		["This data is correct at: 02.11.2026", "", "", "", "", "", "", "", ""],
		PSI_HEADER,
		...rows,
	];
	return writeXlsxSheets(
		[
			{ name: "Extract", rows: extract },
			...(terms ? [{ name: "Terms & Conditions of Use", rows: PSI_TERMS }] : []),
		],
		{ deflate: true },
	);
}

// ---------------------------------------------------------------------------
// HIQA's register of designated centres for older people
// ---------------------------------------------------------------------------

const HIQA_HEADER = [
	"Centre_ID",
	"Centre_Title",
	"Centre_Address",
	"County",
	"Maximum_Occupancy",
	"Centre_Phone",
	"Person_in_Charge",
	"Person_in_Charge_Phone",
	"Registration_Provider",
	"Registration_Provider_Address",
	"Registration_Provider_Phone",
	"Registration_Date",
	"Registration_Expiry_Date",
	"Expiry_Date_Note",
	"CRO_Registration_Number",
	"Management_Contacts",
	"Registration_Number",
	"Chief_Inspector_Note",
	"Registration_Conditions",
	"URL",
];

/** The special centres: each one case of the placing and operator rules. */
export const HIQA_CASES = {
	/** In Boyle, run by a company (stored). */
	company: "901",
	/** Run by an individual: the provider is never stored. */
	individual: "902",
	/** No town in the address: placed in County Dublin only. */
	noTown: "903",
	/** A gazetteer locality inside Cork (Ballincollig). */
	alias: "904",
	/** The same facility as an HSE community hospital (same Eircode): HIQA's page wins. */
	hseTwin: "905",
	/** Run by partners ("… and …", with a CRO number): never stored. */
	partners: "906",
	/** Run by the HSE. */
	hse: "907",
} as const;

/** The Eircode HIQA's centre 905 and the HSE's community hospital share. */
export const TWIN_EIRCODE = "R32 X999";

const csvField = (value: string) =>
	/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export function hiqaExport(): string {
	const centre = (
		id: string,
		title: string,
		address: string,
		county: string,
		options: {
			capacity?: string;
			phone?: string;
			provider?: string;
			cro?: string;
			note?: string;
			url?: string;
		} = {},
	) => [
		id,
		title,
		address,
		county,
		options.capacity ?? "40",
		options.phone ?? "071 999 0101",
		"Fixture Person In Charge",
		"087 999 0000",
		options.provider ?? "Example Care Homes Limited",
		"1 Fixture Provider Road, Example Town",
		"01 999 0000",
		"01/01/2024",
		"01/01/2027",
		"",
		options.cro ?? "999001",
		"Fixture Manager, Fixture Director",
		"OSV-0000000",
		options.note ?? "",
		"Fixture condition: the registered provider shall …",
		options.url ??
			`https://www.hiqa.ie/areas-we-work/find-a-centre/${title
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-|-$/g, "")}`,
	];
	const rows: string[][] = [
		centre(
			HIQA_CASES.company,
			"Sample Nursing Home Boyle",
			"Example Avenue, Boyle, F52 X911",
			"Roscommon",
			{
				capacity: "63",
				phone: "071 999 0111",
			},
		),
		centre(
			HIQA_CASES.individual,
			"Example House Nursing Home",
			"Example Lane, Killarney, V93X912",
			"Kerry",
			{
				provider: "A. N. Example",
				cro: "",
				capacity: "",
			},
		),
		centre(HIQA_CASES.noTown, "Sample Lodge Nursing Home", "Example Park, D06 X913", "Dublin", {
			note: "Fixture note of the Chief Inspector",
		}),
		centre(
			HIQA_CASES.alias,
			"Example Nursing Home Ballincollig",
			"Example Road, Ballincollig, T12 X914",
			"Cork",
			{
				url: "https://example.org/find-a-centre/not-hiqa",
			},
		),
		centre(
			HIQA_CASES.hseTwin,
			"Sample Community Nursing Unit",
			`Exampleton Road, Abbeyleix, ${TWIN_EIRCODE}`,
			"Laois",
			{
				provider: "Health Service Executive",
				cro: "",
			},
		),
		centre(HIQA_CASES.partners, "Sample Care Centre", "Example Street, Ennis, V95 X916", "Clare", {
			provider: "Example One and Example Two",
		}),
		centre(
			HIQA_CASES.hse,
			"Example Community Hospital Navan",
			"Hospital Grounds, Navan, C15 X917",
			"Meath",
			{
				provider: "Health Service Executive",
				cro: "",
			},
		),
		// Broken: a centre id that is not one, quarantined.
		centre("C-1", "Example Broken Nursing Home", "Example Road, Cork, T12 X918", "Cork"),
	];
	for (let index = 0; index < 60; index++) {
		const [town, , county] = FILLER_TOWNS[index % FILLER_TOWNS.length] ?? ["Cork", "", "Cork"];
		const code = eircode(county === "Dublin" ? "D08" : "T12", 50 + (index % 50));
		rows.push(
			centre(
				String(1_000 + index),
				`Sample Nursing Home No. ${index + 1}`,
				`${index + 1} Example Road, ${town}, ${code}`,
				county,
				{
					capacity: String(20 + index),
					phone: `01 999 ${String(1_000 + index)}`,
					provider: index % 3 === 0 ? "Health Service Executive" : "Example Care Homes Limited",
					cro: index % 3 === 0 ? "" : "999001",
				},
			),
		);
	}
	return `\uFEFF${[HIQA_HEADER, ...rows].map((row) => row.map(csvField).join(",")).join("\r\n")}\r\n`;
}

// ---------------------------------------------------------------------------
// The HSE's Health Atlas layers
// ---------------------------------------------------------------------------

/** The special hospitals and health centres, by their name in the layer. */
export const HSE_CASES = {
	/** A community hospital named by its town only: "Exampleton Community Hospital". */
	townOnly: "Exampleton",
	/** A community hospital whose first address line is its name: "Saint Example's Hospital". */
	lineName: "Sampleford",
	/** The HIQA centre 905's twin (same Eircode): not imported. */
	twin: "Sample Community Hospital",
	/** A health centre whose name was encoded twice. */
	mojibake: "Ionad SlÃƒÂ¡inte Sampla",
	/** A health centre named by its street only: "Example Road Health Centre". */
	streetOnly: "Example Road",
} as const;

const hospital = (
	id: number,
	name: string,
	subcategory: string,
	lines: (string | null)[],
	code: string | null,
	at: [number, number],
) => ({
	type: "Feature",
	id,
	geometry: { type: "Point", coordinates: at },
	properties: {
		OBJECTID: id,
		category: "Hospital",
		subcategory,
		name,
		address1: lines[0] ?? null,
		address2: lines[1] ?? null,
		address3: lines[2] ?? null,
		address4: lines[3] ?? null,
		Eircode: code,
		POINT_X: at[0],
		POINT_Y: at[1],
	},
});

export function hseHospitals(): string {
	const features = [
		hospital(
			1,
			HSE_CASES.townOnly,
			"Community",
			["Example Road", "Killarney", "Co. Kerry"],
			"V93 X921",
			inTown("19840"),
		),
		hospital(
			2,
			HSE_CASES.lineName,
			"Community",
			["Saint Example's Hospital", "Example Street", "Tralee", "Co. Kerry"],
			"V92 X922",
			inTown("19849"),
		),
		hospital(
			3,
			HSE_CASES.twin,
			"Community",
			["Exampleton Road", "Abbeyleix", "Co. Laois"],
			TWIN_EIRCODE,
			inTown("08171"),
		),
		hospital(
			4,
			"Example University Hospital",
			"General/Acute",
			["Example Road", "Dublin 9"],
			"D09 X924",
			inTown("02341", 0.6),
		),
		hospital(
			5,
			"Example Private Clinic",
			"Private General",
			["Example Court", "Cork"],
			"T12 X925",
			inTown("17364", 0.6),
		),
		hospital(
			6,
			"Sample Maternity Hospital",
			"Maternity",
			["Example Street", "Dublin 2"],
			"D02 X926",
			inTown("02341", 0.4),
		),
		// Outside every town: placed in County Mayo, at its own point.
		hospital(
			7,
			"Example District Hospital,  ",
			"Community",
			["Example Lane", "Co. Mayo"],
			null,
			outsideTowns("150000"),
		),
	];
	for (let index = 0; index < 12; index++) {
		const town = TOWNS[index % TOWNS.length];
		if (!town) continue;
		features.push(
			hospital(
				10 + index,
				`Example General Hospital No. ${index + 1}`,
				"General/Acute",
				[`${index + 1} Example Road`, town[1].replace(/ city and suburbs$/, "")],
				null,
				inTown(town[0], 0.3 + (index % 4) * 0.1),
			),
		);
	}
	return geojson(features);
}

const healthCentre = (
	id: number,
	name: string,
	lines: (string | null)[],
	at: [number, number] | null,
) => ({
	type: "Feature",
	id,
	geometry: at ? { type: "Point", coordinates: at } : null,
	properties: {
		OBJECTID: id,
		name,
		alternate_name: null,
		category: "Health Centre",
		subcategory: id % 2 === 0 ? "NULL" : null,
		address1: lines[0] ?? null,
		address2: lines[1] ?? null,
		address3: lines[2] ?? null,
		address4: lines[3] ?? null,
		address5: lines[4] ?? null,
		// Swapped, as in the layer: `lat` holds the longitude.
		lat: at ? at[0] : null,
		lon: at ? at[1] : null,
		POINT_Z: null,
	},
});

export function hseHealthCentres(): string {
	const features = [
		healthCentre(
			1,
			" Sample Health Centre, ",
			["Example Lane", "Ennis", "Co. Clare", null, "V95 X931"],
			inTown("16562"),
		),
		healthCentre(
			2,
			HSE_CASES.mojibake,
			["Example Road", "An Spidéal", "Co. Galway", "H91 X932"],
			inTown("27299"),
		),
		healthCentre(
			3,
			HSE_CASES.streetOnly,
			["Example Road", "Letterkenny", "Co. Donegal."],
			inTown("33091"),
		),
		// Outside every town: placed in County Sligo at its own point.
		healthCentre(
			4,
			"Example Rural Health Centre",
			["Example Townland", "Co. Sligo"],
			outsideTowns("200000"),
		),
		// Broken: no point, quarantined.
		healthCentre(5, "Example Pointless Health Centre", ["Example Street", "Cork"], null),
	];
	for (let index = 0; index < 100; index++) {
		const town = TOWNS[index % TOWNS.length];
		if (!town) continue;
		features.push(
			healthCentre(
				10 + index,
				`Example Health Centre No. ${index + 1}`,
				[`${index + 1} Example Street`, town[1].replace(/ city and suburbs$/, "")],
				inTown(town[0], 0.2 + (index % 7) * 0.1, 0.3 + (index % 5) * 0.1),
			),
		);
	}
	return geojson(features);
}

/** An ArcGIS item, as the layers' items publish their licence and last change. */
export function hseItem(title: string, licence = true): string {
	return `${JSON.stringify(
		{
			id: "fixture",
			title,
			modified: Date.UTC(2025, 11, 18, 9, 53, 51),
			licenseInfo: licence
				? "<p><a href='https://creativecommons.org/licenses/by/4.0/'>https://creativecommons.org/licenses/by/4.0/</a></p><p>This GeoHive content is published as open data, it is licenced under a Creative Commons Attribution 4.0 International (CC BY 4.0) licence.</p>"
				: "<p>All rights reserved.</p>",
			numViews: 1234,
		},
		null,
		"\t",
	)}\n`;
}

export function generateIeFixtures(dir: string = IE_FIXTURES): void {
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "ie-counties.geojson"), counties());
	writeFileSync(join(dir, "ie-towns.geojson"), towns());
	writeFileSync(join(dir, "ie-placenames-1.geojson"), placenames());
	writeFileSync(join(dir, "psi-pharmacies.xlsx"), psiWorkbook());
	writeFileSync(join(dir, "hiqa-older-persons.csv"), hiqaExport());
	writeFileSync(join(dir, "hse-hospitals.geojson"), hseHospitals());
	writeFileSync(join(dir, "hse-hospitals.item.json"), hseItem("Hospitals - HSE Ireland"));
	writeFileSync(join(dir, "hse-health-centres.geojson"), hseHealthCentres());
	writeFileSync(join(dir, "hse-health-centres.item.json"), hseItem("Health Centres - HSE Ireland"));
}

if (import.meta.main) {
	generateIeFixtures();
	console.log(`Irish fixtures written to ${IE_FIXTURES}`);
}
