/**
 * Generates the SYNTHETIC fixtures in `fixtures/cy/`: the Ministry of Health's three lists in
 * their exact formats (`farmakeia.csv`, the Pharmaceutical Services' private pharmacies with
 * their pharmacist's name and house telephone; `nosokomeia.csv`, the state hospitals with their
 * points; `kentra-ygeias.csv`, the state health centres), CYSTAT's census table as its PxWeb
 * database answers (`apografi-2021.json`, JSON-stat 2.0) and Cyprus Post's workbook of postcodes
 * and LAU codes (`tk-lau.xlsx`) that `etl:places --country cy` reads.
 *
 * Every facility, street and person is made up: names say they are examples (Παράδειγμα,
 * Υπόδειγμα), registration numbers start from numbers no real row uses, phone numbers are in a
 * range of their own, and every pharmacy names a made-up pharmacist ("Δοκιμαστής Δοκιμή") with a
 * made-up house telephone number and a made-up landmark, so the tests can check they are never
 * stored. Never commit real rows. Deterministic: the same files on every run. Run with
 * `bun run --cwd packages/etl fixtures:cy`.
 *
 * The districts, municipalities and communities are real (CYSTAT codes and names, Cyprus Post's
 * postcodes and centres), as are two units the census did not count: Famagusta and Kyrenia, in
 * the areas where the Government does not exercise effective control.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeXlsxSheets } from "../src/lib/xlsx";

export const CY_FIXTURES = join(import.meta.dirname, "cy");

/** The fixture's units: code, census label, Greek and Latin names, centre, postcodes, population. */
export const CY_UNITS: {
	code: string;
	census: string | null;
	name: string;
	latin: string;
	district: string;
	latitude: number;
	longitude: number;
	postcodes: string[];
	population: number | null;
}[] = [
	{
		code: "1000",
		census: "Λευκωσία - Σύνολο",
		name: "Λευκωσία",
		latin: "Lefkosia ",
		district: "Λευκωσία",
		latitude: 35.1806,
		longitude: 33.4046,
		postcodes: ["1010", "1011", "1015"],
		population: 56479,
	},
	{
		code: "1012",
		census: "Στρόβολος - Σύνολο",
		name: "Στρόβολος",
		latin: "Strovolos ",
		district: "Λευκωσία",
		latitude: 35.1392,
		longitude: 33.3437,
		postcodes: ["2003", "2029"],
		population: 71123,
	},
	{
		code: "1013",
		census: "Αγλαντζιά ή Αγλαγγιά",
		name: "Αγλαντζιά ή Αγλαγγιά",
		latin: "Aglantzia or Aglangia",
		district: "Λευκωσία",
		latitude: 35.1453,
		longitude: 33.4165,
		postcodes: ["2101"],
		population: 21510,
	},
	{
		code: "3100",
		census: "Αγία Νάπα",
		name: "Αγία Νάπα",
		latin: "Agia Napa",
		district: "Αμμόχωστος",
		latitude: 34.9864,
		longitude: 33.9989,
		postcodes: ["5330"],
		population: 3712,
	},
	{
		code: "4000",
		census: "Λάρνακα - Σύνολο",
		name: "Λάρνακα",
		latin: "Larnaka",
		district: "Λάρνακα",
		latitude: 34.9173,
		longitude: 33.6272,
		postcodes: ["6010", "6023"],
		population: 51468,
	},
	{
		code: "5000",
		census: "Λεμεσός - Σύνολο",
		name: "Λεμεσός",
		latin: "Lemesos",
		district: "Λεμεσός",
		latitude: 34.6855,
		longitude: 33.033,
		postcodes: ["3010", "3011"],
		population: 107970,
	},
	{
		code: "6000",
		census: "Πάφος - Σύνολο",
		name: "Πάφος",
		latin: "Pafos",
		district: "Πάφος",
		latitude: 34.772,
		longitude: 32.4297,
		postcodes: ["8010", "8020"],
		population: 37297,
	},
	// Not counted by the census: no place.
	{
		code: "3000",
		census: null,
		name: "Αμμόχωστος",
		latin: "Ammochostos",
		district: "Αμμόχωστος",
		latitude: 35.1149,
		longitude: 33.9192,
		postcodes: ["5000"],
		population: null,
	},
	{
		code: "2000",
		census: null,
		name: "Κερύνεια",
		latin: "Keryneia",
		district: "Κερύνεια",
		latitude: 35.3285,
		longitude: 33.3137,
		postcodes: ["9000"],
		population: null,
	},
];

/** A pharmacy row as the list writes it (the pharmacist's columns made up, never read). */
export type CyPharmacyRow = {
	district: string;
	number: string;
	street: string;
	town: string;
	postcode: string;
	phone: string;
};

/** The pharmacist and landmark every row names: the tests check they are never stored. */
export const CY_PHARMACIST = {
	surname: "Δοκιμαστής",
	name: "Δοκιμή",
	house: "99000001",
	landmark: "Δίπλα από το κατάστημα Δοκιμή",
};

export const CY_PHARMACIES: CyPharmacyRow[] = [
	{
		district: "Λευκωσία",
		number: "101",
		street: "Οδός Παραδείγματος 12",
		town: "Λευκωσία",
		postcode: "1010",
		phone: "22000101",
	},
	{
		district: "Λευκωσία",
		number: "102",
		street: "Λεωφ. Υποδείγματος 5, Κατ. 2",
		town: "Στρόβολος",
		postcode: "2003",
		phone: "22 000102",
	},
	{
		district: "Λάρνακα",
		number: "103",
		street: "Οδός Παραδείγματος 51Γ",
		town: "Λάρνακα",
		postcode: "6023",
		phone: "24000103",
	},
	// The town repeated after the street is dropped.
	{
		district: "Αμμόχωστος",
		number: "104",
		street: "Λεωφ. Παραδείγματος 2, Αγία Νάπα",
		town: "Αγία Νάπα",
		postcode: "5330",
		phone: "23000104",
	},
	// A postcode Cyprus Post's table does not know: placed by its town.
	{
		district: "Λεμεσός",
		number: "105",
		street: "Οδός Παραδείγματος 7",
		town: "Λεμεσός",
		postcode: "3999",
		phone: "25000105",
	},
	// The same pharmacy as 101 (a second pharmacist): one page, 101's.
	{
		district: "Λευκωσία",
		number: "106",
		street: "Οδός  Παραδείγματος 12",
		town: "Λευκωσία",
		postcode: "1010",
		phone: "22000106",
	},
	// A mobile number: not shown.
	{
		district: "Πάφος",
		number: "107",
		street: "Οδός Υποδείγματος 9",
		town: "Πάφος",
		postcode: "8010",
		phone: "99000107",
	},
	// Nowhere known: left out.
	{
		district: "Πάφος",
		number: "108",
		street: "Οδός Παραδείγματος 3",
		town: "Άγνωστο Χωριό",
		postcode: "8999",
		phone: "26000108",
	},
	// No registration number: quarantined.
	{
		district: "Λάρνακα",
		number: "x109",
		street: "Οδός Παραδείγματος 4",
		town: "Λάρνακα",
		postcode: "6010",
		phone: "24000109",
	},
];

const TOWNS: [string, string, string, string][] = [
	["Λευκωσία", "Λευκωσία", "1011", "22"],
	["Λευκωσία", "Στρόβολος", "2029", "22"],
	["Λευκωσία", "Αγλαντζιά", "2101", "22"],
	["Λάρνακα", "Λάρνακα", "6010", "24"],
	["Λεμεσός", "Λεμεσός", "3011", "25"],
	["Πάφος", "Πάφος", "8020", "26"],
	["Αμμόχωστος", "Αγία Νάπα", "5330", "23"],
];

/**
 * Pharmacies enough to pass the list's floors and to let one page go without tripping the
 * breakers (under 1%), four of them sharing one switchboard number.
 */
export function fillerPharmacies(count = 156): CyPharmacyRow[] {
	return Array.from({ length: count }, (_, index) => {
		const [district, town, postcode, area] = TOWNS[index % TOWNS.length] as [
			string,
			string,
			string,
			string,
		];
		return {
			district,
			number: String(201 + index),
			street: `Οδός Υποδείγματος ${100 + index}`,
			town,
			postcode,
			phone: index < 4 ? "22000999" : `${area}00${String(2000 + index)}`,
		};
	});
}

export const CY_HOSPITALS: [string, string, string, string, string][] = [
	[
		"Γενικό Νοσοκομείο Παραδείγματος",
		"Οδός Παραδείγματος 215, 2029 Στρόβολος Λευκωσία",
		"22000201",
		"35.1275",
		"33.3775",
	],
	[
		"Νοσοκομείο Παραδείγματος Λεμεσού",
		"Οδός Υποδείγματος, Λεμεσός",
		"25000202",
		"34.7064",
		"32.9844",
	],
	["Αγροτικό Νοσοκομείο Παραδείγματος", "Αγία Νάπα", "23000203", "", ""],
	// The address on two lines, as the real list writes one.
	[
		"Νοσοκομείο Υποδείγματος Πάφου",
		"Οδός Υποδείγματος 4, 8020\nΠάφος",
		"26000204",
		"34.7889",
		"32.446",
	],
];

export const CY_CENTRES: [string, string, string][] = [
	["Κέντρο Υγείας Παραδείγματος Στροβόλου", "22000301; 22000302", "22000399"],
	["Κέντρο Υγείας Παραδείγματος Λάρνακας", "24000303", "24000399"],
	["Κέντρο Υγείας Παραδείγματος Αγίας Νάπας", "23000304", "23000399"],
	["Κέντρο Υγείας Παραδείγματος Λευκωσίας", "22000305", "22000398"],
	["Κέντρο Υγείας Παραδείγματος Λεμεσού", "25000306", "25000399"],
	["Κέντρο Υγείας Παραδείγματος Πάφου", "26000307", "26000399"],
	["Κέντρο Υγείας Παραδείγματος Αγλαντζιάς", "22000308", "22000397"],
	["Κέντρο Υγείας Υποδείγματος Στροβόλου", "22000309", "22000396"],
	["Κέντρο Υγείας Υποδείγματος Λεμεσού", "25000310", "25000398"],
	["Κέντρο Υγείας Υποδείγματος Λάρνακας", "24000311", "24000398"],
	// Its name names no place: left out.
	["Κέντρο Υγείας Παραδείγματος", "22000312", "22000395"],
];

const quote = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
const csv = (rows: readonly (readonly string[])[]) =>
	`\uFEFF${rows.map((row) => row.map(quote).join(",")).join("\r\n")}\r\n`;

export function pharmaciesCsv(rows: readonly CyPharmacyRow[]): string {
	return csv([
		[
			"District",
			"S/N",
			"Surname",
			"Name",
			"Address",
			"Address Additional Info",
			"City / Community",
			"Postal Code",
			"Telephone",
			"House Telephone No.",
			"",
		],
		...rows.map((row) => [
			row.district,
			row.number,
			CY_PHARMACIST.surname,
			CY_PHARMACIST.name,
			row.street,
			CY_PHARMACIST.landmark,
			row.town,
			row.postcode,
			row.phone,
			CY_PHARMACIST.house,
			"",
		]),
	]);
}

export function hospitalsCsv(rows: readonly (readonly string[])[] = CY_HOSPITALS): string {
	return csv([
		["Hospital", "Address", "Tel", "Info_URL", "latitude", "longitude"],
		...rows.map(([name = "", address = "", tel = "", latitude = "", longitude = ""]) => [
			name,
			address,
			tel,
			"https://example.invalid/nosokomeio",
			latitude,
			longitude,
		]),
	]);
}

export function centresCsv(rows: readonly (readonly string[])[] = CY_CENTRES): string {
	return csv([["Name", "Tel", "Fax"], ...rows.map((row) => [...row])]);
}

/** CYSTAT's census table as its PxWeb database answers it (JSON-stat 2.0). */
export function censusJson(): string {
	const area = "ΕΠΑΡΧΙΑ, ΔΗΜΟΣ/ΚΟΙΝΟΤΗΤΑ, ΕΝΟΡΙΑ";
	const measure = "ΚΑΤΟΙΚΙΕΣ, ΝΟΙΚΟΚΥΡΙΑ, ΙΔΡΥΜΑΤΑ, ΠΛΗΘΥΣΜΟΣ";
	const entries: [string, string, number][] = [
		["ΣΥΝΟΛΟ", "ΣΥΝΟΛΟ ΕΠΑΡΧΙΩΝ", 923381],
		["1", "ΕΠΑΡΧΙΑ ΛΕΥΚΩΣΙΑΣ", 350035],
		// A quarter (ενορία) of a municipality: not a place of its own.
		["100001", "Λευκωσία - Άγιος Ανδρέας", 5579],
	];
	for (const unit of CY_UNITS) {
		if (unit.census && unit.population !== null) {
			entries.push([unit.code, unit.census, unit.population]);
		}
	}
	return `${JSON.stringify(
		{
			version: "2.0",
			class: "dataset",
			label: `Κατοικίες, Νοικοκυριά, Ιδρύματα και Πληθυσμός που Καταγράφηκαν κατά Επαρχία, Δήμο/Κοινότητα και Ενορία 1.10.2021`,
			source: "Στατιστική Υπηρεσία Κύπρου",
			updated: "2025-04-16T05:00:00Z",
			id: [area, measure],
			size: [entries.length, 1],
			dimension: {
				[area]: {
					label: area,
					category: {
						index: Object.fromEntries(entries.map(([code], index) => [code, index])),
						label: Object.fromEntries(entries.map(([code, label]) => [code, label])),
					},
				},
				[measure]: {
					label: measure,
					category: { index: { "7": 0 }, label: { "7": "Σύνολο Πληθυσμού" } },
				},
			},
			value: entries.map(([, , value]) => value),
		},
		null,
		"\t",
	)}\n`;
}

/** Cyprus Post's workbook: postcodes and LAU codes on its first sheet. */
export function postcodesXlsx(): Buffer {
	const header = [
		"Postal Code",
		"Postal_Code_Name_GR",
		"Postal_Code_Name_EN",
		"District_GR",
		"District_EN",
		"LAU2_Code",
		"LAU2_Name_GR",
		"LAU2 Name_EN",
		"LAU2_Latitude",
		"LAU2_Longitude",
	];
	const rows = CY_UNITS.flatMap((unit) =>
		unit.postcodes.map((postcode) => [
			postcode,
			unit.name,
			unit.latin.trim(),
			unit.district,
			unit.district,
			unit.code,
			unit.name,
			unit.latin,
			String(unit.latitude),
			String(unit.longitude),
		]),
	);
	return writeXlsxSheets(
		[
			{ name: "Postal Codes Vs LAU2 Codes", rows: [header, ...rows] },
			{ name: "LAU CY 2016-2021", rows: [["NUTS 3 CODE", "LAU CODE", "LAU NAME NATIONAL"]] },
		],
		{ deflate: true },
	);
}

export type CyFixtureSet = {
	pharmacies: CyPharmacyRow[];
	hospitals: (readonly string[])[];
	centres: (readonly string[])[];
};

export const CY_FACILITIES: CyFixtureSet = {
	pharmacies: [...CY_PHARMACIES, ...fillerPharmacies()],
	hospitals: CY_HOSPITALS,
	centres: CY_CENTRES,
};

export function writeCyFixtures(dir: string, set: CyFixtureSet = CY_FACILITIES) {
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "farmakeia.csv"), pharmaciesCsv(set.pharmacies));
	writeFileSync(join(dir, "nosokomeia.csv"), hospitalsCsv(set.hospitals));
	writeFileSync(join(dir, "kentra-ygeias.csv"), centresCsv(set.centres));
	writeFileSync(join(dir, "apografi-2021.json"), censusJson());
	writeFileSync(join(dir, "tk-lau.xlsx"), postcodesXlsx());
}

if (import.meta.main) {
	writeCyFixtures(CY_FIXTURES);
	console.log(`Wrote the synthetic Cypriot fixtures to ${CY_FIXTURES}`);
}
