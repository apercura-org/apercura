/**
 * Generates the SYNTHETIC fixtures in `fixtures/gb/`: files in the exact formats of the UK
 * lists (the headerless 27-column ODS reports, Public Health Scotland's and the Business
 * Services Organisation's CSVs), of Code-Point Open, OS Open Names, the OSNI gazetteer and
 * the ONS local authority lookup and boundaries, filled with fictitious practices.
 *
 * Every practice is made up: names are made-up words (Example, Sample, Placeholder, Fiktiv,
 * Demo…), the "persons" some practices are named after are invented (`DR A EXAMPLE`),
 * streets do not exist, postcodes end in `Z` letters, codes are in ranges the real lists do
 * not use (`A99xxx`, `V99xxx`, `FX0xx`, `89xxx`), and phone numbers are in the ranges Ofcom
 * reserves for drama (`01632 960xxx`, `020 7946 0xxx`, `0121 496 0xxx`…). Fillers bring each
 * list above the import's row floors. Never commit real rows. Run with
 * `bun run --cwd packages/etl fixtures:gb`.
 *
 * The local authorities, regions and towns are real public names and ONS/OS codes, with
 * approximate points and square boundaries: a small subset of the official layers.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const GB_FIXTURES = join(import.meta.dirname, "gb");

/** Real local authorities (ONS 2026 codes) with a square boundary around them (WGS 84). */
export const GB_LADS: {
	code: string;
	name: string;
	region: string | null;
	nation: string;
	/** West, south, east, north. */
	box: [number, number, number, number];
}[] = [
	{
		code: "E06000004",
		name: "Stockton-on-Tees",
		region: "E12000001",
		nation: "E92000001",
		box: [-1.5, 54.45, -1.15, 54.68],
	},
	{
		code: "E09000007",
		name: "Camden",
		region: "E12000007",
		nation: "E92000001",
		box: [-0.22, 51.51, -0.1, 51.58],
	},
	{
		code: "E08000025",
		name: "Birmingham",
		region: "E12000005",
		nation: "E92000001",
		box: [-2.05, 52.38, -1.72, 52.6],
	},
	{
		code: "W06000015",
		name: "Cardiff",
		region: null,
		nation: "W92000004",
		box: [-3.35, 51.42, -3.05, 51.56],
	},
	{
		code: "S12000049",
		name: "Glasgow City",
		region: null,
		nation: "S92000003",
		box: [-4.4, 55.78, -4.07, 55.93],
	},
	{
		code: "S12000036",
		name: "City of Edinburgh",
		region: null,
		nation: "S92000003",
		box: [-3.4, 55.87, -3.05, 56.01],
	},
	{
		code: "N09000003",
		name: "Belfast",
		region: null,
		nation: "N92000002",
		box: [-6.05, 54.53, -5.8, 54.66],
	},
	{
		code: "N09000010",
		name: "Newry, Mourne and Down",
		region: null,
		nation: "N92000002",
		box: [-6.6, 54.0, -5.5, 54.4],
	},
];

/**
 * OS Open Names populated places (real names and identifiers, approximate British National
 * Grid points): towns and cities are kept, a suburban area and a hamlet are not, and Cardiff
 * is published with its Welsh name first.
 */
const OPEN_NAMES: [string, string, string, string, string, string, number, number][] = [
	// id, NAME1, NAME1_LANG, NAME2, NAME2_LANG, LOCAL_TYPE, x, y
	["osgb4000000074559324", "Stockton-on-Tees", "", "", "", "Town", 444542, 518966],
	["osgb4000000074559320", "Yarm", "", "", "", "Town", 441907, 512820],
	["osgb4000000074575843", "Billingham", "", "", "", "Town", 445567, 523819],
	["osgb4000000099000001", "Exampleby", "", "", "", "Hamlet", 446000, 520000],
	["osgb4000000074540884", "Birmingham", "", "", "", "City", 406689, 286822],
	["osgb4000000074554911", "Caerdydd", "cym", "Cardiff", "eng", "City", 318371, 176329],
	["osgb4000000074580391", "Glasgow", "", "", "", "City", 260107, 665646],
	["osgb4000000074558316", "Edinburgh", "", "", "", "City", 325847, 674007],
	["osgb4000000074559954", "Kentish Town", "", "", "", "Suburban Area", 529066, 185193],
];

/** The OSNI gazetteer: real Northern Irish town names and Irish Grid points. */
const OSNI_TOWNS: [string, number, number, number][] = [
	["BELFAST", 333800, 374000, 49],
	["CARRYDUFF", 336500, 365200, 82],
	["NEWRY", 308500, 326500, 273],
];

/** Code-Point Open: fictitious postcodes near the towns, with their authority. */
export const GB_POSTCODES: [string, number, number, string, number][] = [
	// postcode, eastings, northings, LAD, positional quality
	["TS18 1ZA", 444600, 518900, "E06000004", 10],
	["TS18 1ZB", 444700, 519100, "E06000004", 10],
	["TS15 9ZZ", 441950, 512700, "E06000004", 10],
	["TS23 1ZZ", 445600, 523700, "E06000004", 10],
	["TS21 9ZZ", 0, 0, "E06000004", 90],
	["NW5 1ZZ", 529000, 185200, "E09000007", 10],
	["B1 1ZZ", 406700, 286800, "E08000025", 10],
	["CF10 1ZZ", 318400, 176300, "W06000015", 10],
	["G1 1ZZ", 260100, 665600, "S12000049", 10],
	["G41 9ZZ", 258000, 662500, "S12000049", 10],
	["EH1 1ZZ", 325800, 674000, "S12000036", 10],
	["EH2 9ZZ", 325300, 674100, "S12000036", 10],
];

/** One headerless ODS line of 27 quoted fields. */
function odsLine(values: Record<number, string>): string {
	return Array.from({ length: 27 }, (_, index) => `"${values[index] ?? ""}"`).join(",");
}

type OdsCase = {
	code: string;
	name: string;
	lines: [string, string?, string?];
	town: string;
	postcode: string;
	status?: string;
	closed?: string;
	phone?: string;
	roles?: string;
	primaryRole?: string;
	parent?: string;
};

const ods = (item: OdsCase) =>
	odsLine({
		0: item.code,
		1: item.name,
		2: "Y63",
		3: "QHM",
		4: item.lines[0],
		5: item.lines[1] ?? "",
		6: item.lines[2] ?? "",
		7: item.town,
		9: item.postcode,
		10: "20000401",
		11: item.closed ?? "",
		12: item.status ?? (item.parent ? "" : "ACTIVE"),
		13: item.primaryRole ?? (item.parent ? "" : "B"),
		14: item.parent ?? "16C",
		15: "20200401",
		17: item.phone ?? "",
		21: "1",
		25: item.roles ?? "",
	});

/**
 * Hand-written GP practices (England and Wales): one in a town, one named after a person
 * (shown under its premises), one named after a person with a street only, one closed, a
 * prescribing cost centre that is not a GP practice, one in a London borough without a town,
 * one in Birmingham, one in Cardiff, one in Yarm.
 */
export const GB_GP_CASES: OdsCase[] = [
	{
		code: "A99001",
		name: "THE EXAMPLE SURGERY",
		lines: ["HEALTH CENTRE", "SAMPLE STREET"],
		town: "STOCKTON-ON-TEES",
		postcode: "TS18 1ZA",
		phone: "01632 960001",
		roles: "RO76",
	},
	{
		code: "A99002",
		name: "DR A EXAMPLE & PARTNERS",
		lines: ["FICTIONAL MEDICAL CENTRE", "2 PLACEHOLDER ROAD"],
		town: "STOCKTON-ON-TEES",
		postcode: "TS18 1ZB",
		phone: "01632 960002",
		roles: "RO76",
	},
	{
		code: "A99003",
		name: "CLOSED EXAMPLE SURGERY",
		lines: ["3 SAMPLE STREET"],
		town: "STOCKTON-ON-TEES",
		postcode: "TS18 1ZA",
		status: "INACTIVE",
		closed: "20250331",
		roles: "RO76",
	},
	{
		code: "Y99004",
		name: "EXAMPLE OUT OF HOURS SERVICE",
		lines: ["4 SAMPLE STREET"],
		town: "STOCKTON-ON-TEES",
		postcode: "TS18 1ZA",
		roles: "RO80",
	},
	{
		code: "A99005",
		name: "KENTISH EXAMPLE PRACTICE",
		lines: ["5 DEMO GROVE"],
		town: "LONDON",
		postcode: "NW5 1ZZ",
		phone: "020 7946 0005",
		roles: "RO76",
	},
	{
		code: "M99006",
		name: "SAMPLE ROAD SURGERY",
		lines: ["6 SAMPLE ROAD"],
		town: "BIRMINGHAM",
		postcode: "B1 1ZZ",
		phone: "0121 496 0006",
		roles: "RO76",
	},
	{
		code: "W99007",
		name: "MEDDYGFA ENGHRAIFFT",
		lines: ["7 HEOL ENGHRAIFFT"],
		town: "CARDIFF",
		postcode: "CF10 1ZZ",
		phone: "029 2018 0007",
		roles: "RO76",
	},
	{
		code: "A99008",
		name: "YARM EXAMPLE PRACTICE",
		lines: ["8 DEMO LANE", "YARM"],
		town: "YARM",
		postcode: "TS15 9ZZ",
		phone: "01632 960008",
		roles: "RO76",
	},
	{
		code: "A99009",
		name: "MR B SAMPLE",
		lines: ["9 PLACEHOLDER ROAD"],
		town: "STOCKTON-ON-TEES",
		postcode: "TS18 1ZB",
		roles: "RO76",
	},
];

/** Branch surgeries: one of A99001 in Billingham, one of an unknown practice, one closed. */
export const GB_BRANCH_CASES: OdsCase[] = [
	{
		code: "A9B1Z",
		name: "BILLINGHAM EXAMPLE BRANCH",
		lines: ["1 BRANCH WAY"],
		town: "BILLINGHAM",
		postcode: "TS23 1ZZ",
		parent: "A99001",
	},
	{
		code: "A9B2Z",
		name: "ORPHAN EXAMPLE BRANCH",
		lines: ["2 BRANCH WAY"],
		town: "BILLINGHAM",
		postcode: "TS23 1ZZ",
		parent: "A99990",
	},
	{
		code: "A9B3Z",
		name: "CLOSED EXAMPLE BRANCH",
		lines: ["3 BRANCH WAY"],
		town: "BILLINGHAM",
		postcode: "TS23 1ZZ",
		parent: "A99001",
		closed: "20240101",
	},
];

/** Dental practices: one in Stockton, one named after a person, one in a prison (left out). */
export const GB_DENTAL_CASES: OdsCase[] = [
	{
		code: "V99001",
		name: "EXAMPLE DENTAL PRACTICE",
		lines: ["10 SAMPLE STREET"],
		town: "STOCKTON-ON-TEES",
		postcode: "TS18 1ZA",
	},
	{
		code: "V99002",
		name: "MR C SAMPLE",
		lines: ["11 PLACEHOLDER ROAD"],
		town: "STOCKTON-ON-TEES",
		postcode: "TS18 1ZB",
	},
	{
		code: "V99003",
		name: "HMP EXAMPLE DENTAL SUITE",
		lines: ["12 SECURE WAY"],
		town: "STOCKTON-ON-TEES",
		postcode: "TS18 1ZB",
	},
];

/** Pharmacies: one in Stockton, an appliance contractor (left out). */
export const GB_PHARMACY_CASES: OdsCase[] = [
	{
		code: "FX001",
		name: "EXAMPLE PHARMACY",
		lines: ["13 SAMPLE STREET"],
		town: "STOCKTON-ON-TEES",
		postcode: "TS18 1ZA",
		phone: "01632 960013",
		primaryRole: "RO182",
	},
	{
		code: "FX002",
		name: "EXAMPLE APPLIANCES LTD",
		lines: ["14 SAMPLE STREET"],
		town: "STOCKTON-ON-TEES",
		postcode: "TS18 1ZA",
		primaryRole: "RO94",
	},
];

/** Fillers above the row floors of the import's guards (`GB_LIMITS.minRows`). */
export const GB_FILLERS = {
	gp: 300,
	branches: 100,
	dental: 500,
	pharmacies: 500,
	scotlandGp: 40,
	scotlandDental: 50,
	scotlandPharmacies: 60,
	niGp: 15,
	niDental: 15,
} as const;

const pad = (value: number, width: number) => String(value).padStart(width, "0");
const fillerPostcode = (index: number) => (index % 2 === 0 ? "TS18 1ZA" : "TS18 1ZB");

function csv(rows: (string | number | null)[][]): string {
	const quote = (value: string | number | null) => {
		const text = value === null ? "" : String(value);
		return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
	};
	return `${rows.map((row) => row.map(quote).join(",")).join("\n")}\n`;
}

export type GbFixtureSet = {
	gp: OdsCase[];
	dental: OdsCase[];
	pharmacies: OdsCase[];
	/** Appended to the English GP fillers' street (a mass change, for the circuit breakers). */
	fillerStreetSuffix?: string;
};

export const GB_PRACTICES: GbFixtureSet = {
	gp: GB_GP_CASES,
	dental: GB_DENTAL_CASES,
	pharmacies: GB_PHARMACY_CASES,
};

export function writeGbFixtures(dir: string, set: GbFixtureSet = GB_PRACTICES) {
	mkdirSync(dir, { recursive: true });
	const write = (name: string, content: string) => writeFileSync(join(dir, name), content);

	const gpFillers = Array.from({ length: GB_FILLERS.gp }, (_, index) =>
		ods({
			code: `B${pad(90000 + index, 5)}`,
			name: `FILLER EXAMPLE SURGERY ${pad(index, 4)}`,
			lines: [`${index + 100} FILLER STREET${set.fillerStreetSuffix ?? ""}`],
			town: "STOCKTON-ON-TEES",
			postcode: fillerPostcode(index),
			phone: `01632 960${pad(100 + (index % 900), 3)}`,
			roles: "RO76",
		}),
	);
	write("epraccur.csv", `${[...set.gp.map(ods), ...gpFillers].join("\r\n")}\r\n`);

	const branchFillers = Array.from({ length: GB_FILLERS.branches }, (_, index) =>
		ods({
			code: `B9${pad(index, 3)}Z`,
			name: `FILLER BRANCH ${pad(index, 3)}`,
			lines: [`${index + 1} FILLER BRANCH ROAD`],
			town: "BILLINGHAM",
			postcode: "TS23 1ZZ",
			parent: `B${pad(90000 + index, 5)}`,
		}),
	);
	write("ebranchs.csv", `${[...GB_BRANCH_CASES.map(ods), ...branchFillers].join("\r\n")}\r\n`);

	const dentalFillers = Array.from({ length: GB_FILLERS.dental }, (_, index) =>
		ods({
			code: `V9${pad(10000 + index, 5)}`,
			name: "DENTAL SURGERY",
			lines: [`${index + 100} FILLER DENTAL ROAD`],
			town: "STOCKTON-ON-TEES",
			postcode: fillerPostcode(index),
		}),
	);
	write("egdpprac.csv", `${[...set.dental.map(ods), ...dentalFillers].join("\r\n")}\r\n`);

	const pharmacyFillers = Array.from({ length: GB_FILLERS.pharmacies }, (_, index) =>
		ods({
			code: `FY${String.fromCharCode(65 + (index % 26))}${pad(Math.floor(index / 26), 2)}`,
			name: `FILLER EXAMPLE PHARMACY ${pad(index, 4)}`,
			lines: [`${index + 100} FILLER PHARMACY ROAD`],
			town: "STOCKTON-ON-TEES",
			postcode: fillerPostcode(index),
			primaryRole: "RO182",
		}),
	);
	write("edispensary.csv", `${[...set.pharmacies.map(ods), ...pharmacyFillers].join("\r\n")}\r\n`);

	// Public Health Scotland: header lines, mixed case.
	write(
		"phs-gp.csv",
		csv([
			[
				"PracticeCode",
				"GPPracticeName",
				"PracticeListSize",
				"AddressLine1",
				"AddressLine2",
				"AddressLine3",
				"AddressLine4",
				"Postcode",
				"TelephoneNumber",
				"PracticeType",
				"HB",
				"HSCP",
				"DataZone",
				"GPCluster",
			],
			[
				"89001",
				"Example Medical Centre",
				1000,
				"Example Medical Centre",
				"1 Sample Street",
				"Glasgow",
				null,
				"G1 1ZZ",
				"0141 496 0001",
				"GMS",
				"S08000031",
				"S37000034",
				"S01000001",
				"Example Cluster",
			],
			[
				"89002",
				"Drs Demo, Test & Mock",
				1000,
				"Placeholder Health Centre",
				"2 Sample Street",
				"Edinburgh",
				null,
				"EH1 1ZZ",
				"0131 496 0002",
				"GMS",
				"S08000024",
				"S37000012",
				"S01000002",
				"Example Cluster",
			],
			...Array.from({ length: GB_FILLERS.scotlandGp }, (_, index) => [
				String(89100 + index),
				`Filler Example Practice ${pad(index, 3)}`,
				1000,
				`${index + 10} Filler Street`,
				"Edinburgh",
				null,
				null,
				"EH2 9ZZ",
				null,
				"GMS",
				"S08000024",
				"S37000012",
				"S01000002",
				"Example Cluster",
			]),
		]),
	);
	write(
		"phs-dental.csv",
		csv([
			[
				"Dental_Practice_Code",
				"address1",
				"address2",
				"address3",
				"pc7",
				"HB",
				"HBQF",
				"HSCP",
				"HSCPQF",
				"CA",
				"CAQF",
				"DataZone",
				"DataZoneQF",
				"Registrations",
				"RegistrationsQF",
			],
			[
				"8901",
				"EXAMPLE DENTAL CARE",
				"3 SAMPLE STREET",
				"SHAWLANDS, GLASGOW",
				"G419ZZ",
				"S08000031",
				null,
				"S37000034",
				null,
				"S12000049",
				null,
				"S01000003",
				null,
				"1000",
				null,
			],
			...Array.from({ length: GB_FILLERS.scotlandDental }, (_, index) => [
				String(8910 + index),
				`FILLER DENTAL CARE ${pad(index, 3)}`,
				`${index + 10} FILLER DENTAL STREET`,
				"GLASGOW",
				"G1 1ZZ",
				"S08000031",
				null,
				"S37000034",
				null,
				"S12000049",
				null,
				"S01000003",
				null,
				"1000",
				null,
			]),
		]),
	);
	write(
		"phs-dispensers.csv",
		csv([
			[
				"DispCode",
				"DispLocationName",
				"DispLocationAddress1",
				"DispLocationAddress2",
				"DispLocationAddress3",
				"DispLocationAddress4",
				"DispLocationPostcode",
				"DispLocationTelNo",
				"Claim PD Number of Paid Items",
				"HB2019",
				"HSCP2019",
				"DATAZONE2011",
			],
			[
				"8999",
				"EXAMPLE CHEMISTS LTD",
				"4 SAMPLE STREET",
				"GLASGOW",
				"NA",
				"NA",
				"G1 1ZZ",
				"0141 496 0004",
				"100",
				"S08000031",
				"S37000034",
				"S01000004",
			],
			...Array.from({ length: GB_FILLERS.scotlandPharmacies }, (_, index) => [
				String(89000 + index),
				`FILLER EXAMPLE CHEMIST ${pad(index, 3)}`,
				`${index + 10} FILLER CHEMIST STREET`,
				"EDINBURGH",
				"NA",
				"NA",
				"EH2 9ZZ",
				null,
				"100",
				"S08000024",
				"S37000012",
				"S01000005",
			]),
		]),
	);

	// Business Services Organisation (Northern Ireland): partners' names, never shown.
	write(
		"bso-gp.csv",
		csv([
			[
				"PracNo",
				"PracticeName",
				"Address1",
				"Address2",
				"Address3",
				"Postcode",
				"LCG",
				"Registered_Patients",
				"",
			],
			[
				"901",
				"Dr. EXAMPLE & PARTNERS             ",
				"EXAMPLE GROUP PRACTICE",
				"5 SAMPLE AVENUE",
				"BELFAST",
				"BT9 9ZZ",
				"Belfast",
				"5000",
				"",
			],
			[
				"902",
				"Dr. SAMPLE & PARTNERS",
				"CARRYDUFF EXAMPLE SURGERY",
				"6 PLACEHOLDER ROAD",
				"CARRYDUFF",
				"BT8 9ZZ",
				"South Eastern",
				"4000",
				"",
			],
			...Array.from({ length: GB_FILLERS.niGp }, (_, index) => [
				String(910 + index),
				`Dr. FILLER${index} & PARTNERS`,
				`FILLER EXAMPLE SURGERY ${pad(index, 2)}`,
				`${index + 10} FILLER ROAD`,
				"NEWRY",
				"BT35 9ZZ",
				"Southern",
				"3000",
				"",
			]),
			["", "", "", "", "", "", "", "", ""],
		]).replace(/\n/g, "\r\n"),
	);
	write(
		"bso-dental.csv",
		csv([
			["ADDRESS", "POSTCODE", "TELEPHONE_NO", "DENTIST_TYPE", "LCG", "LGD", "Assembly Area"],
			[
				"EXAMPLE DENTAL PRACTICE, 7 SAMPLE AVENUE, BELFAST",
				"BT9 9ZY",
				"028 9649 6007",
				"GDS",
				"BELFAST",
				"BELFAST",
				"BELFAST SOUTH",
			],
			[
				"8 PLACEHOLDER STREET, NEWRY",
				"BT35 9ZY",
				"028 9649 6008",
				"GDS",
				"SOUTHERN",
				"NEWRY, MOURNE AND DOWN",
				"NEWRY AND ARMAGH",
			],
			...Array.from({ length: GB_FILLERS.niDental }, (_, index) => [
				`FILLER DENTAL SURGERY ${pad(index, 2)}, ${index + 10} FILLER STREET, NEWRY`,
				"BT35 9ZX",
				null,
				"GDS",
				"SOUTHERN",
				"NEWRY, MOURNE AND DOWN",
				"NEWRY AND ARMAGH",
			]),
		]).replace(/\n/g, "\r\n"),
	);

	// Code-Point Open: one CSV of the archive (headerless).
	write(
		"codepoint.csv",
		`${GB_POSTCODES.map(([postcode, x, y, lad, quality]) =>
			[
				`"${postcode}"`,
				quality,
				x,
				y,
				`"${lad.startsWith("S") ? "S92000003" : lad.startsWith("W") ? "W92000004" : "E92000001"}"`,
				'""',
				'""',
				'""',
				`"${lad}"`,
				'""',
			].join(","),
		).join("\n")}\n`,
	);

	// The ONS lookup (ArcGIS JSON) and boundaries (GeoJSON).
	write(
		"lad-lookup.json",
		`${JSON.stringify(
			{
				features: GB_LADS.map((lad) => ({
					attributes: {
						LAD26CD: lad.code,
						LAD26NM: lad.name,
						RGN26CD: lad.region,
						CTRY26CD: lad.nation,
					},
				})),
			},
			null,
			1,
		)}\n`,
	);
	write(
		"lad-boundaries.geojson",
		`${JSON.stringify({
			type: "FeatureCollection",
			features: GB_LADS.map(({ code, name, box: [west, south, east, north] }) => ({
				type: "Feature",
				properties: {
					LAD26CD: code,
					LAD26NM: name,
					LONG: (west + east) / 2,
					LAT: (south + north) / 2,
				},
				geometry: {
					type: "Polygon",
					coordinates: [
						[
							[west, south],
							[east, south],
							[east, north],
							[west, north],
							[west, south],
						],
					],
				},
			})),
		})}\n`,
	);
	// OS Open Names: one CSV of the release (headerless, 34 columns).
	write(
		"open-names.csv",
		`${OPEN_NAMES.map(([id, name1, lang1, name2, lang2, localType, x, y]) => {
			const fields = Array.from({ length: 34 }, () => "");
			fields[0] = id;
			fields[2] = name1;
			fields[3] = lang1;
			fields[4] = name2;
			fields[5] = lang2;
			fields[6] = "populatedPlace";
			fields[7] = localType;
			fields[8] = String(x);
			fields[9] = String(y);
			return fields.join(",");
		}).join("\n")}\n`,
	);
	write(
		"osni-place-names.csv",
		`PLACENAME,X,Y,OBJECTID\n${OSNI_TOWNS.map((row) => row.join(",")).join("\n")}\n`,
	);
}

if (import.meta.main) {
	writeGbFixtures(GB_FIXTURES);
	console.log(`Wrote the synthetic UK fixtures to ${GB_FIXTURES}`);
}
