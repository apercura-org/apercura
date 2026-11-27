/**
 * Generates the SYNTHETIC fixtures in `fixtures/lv/`: the National Health Service's quarterly
 * workbook of GPs in its exact format (`gimenes-arsti.xlsx`: one sheet, `ĢĀ`, its fifteen
 * columns, the `Pasīvi reģistrēts` totals), the Ministry of the Interior's CSV of medical
 * institutions' addresses (`medicinasiestades.csv`) and the State Agency of Medicines' register
 * export (`fdu_register.csv`, its forty columns), filled with fictitious places, and the
 * address register's files that `etl:places --country lv` reads (`aw_novads.csv`,
 * `aw_pilseta.csv`, `aw_pagasts.csv`, `aw_vietu_centroidi.csv`).
 *
 * Every place and person is made up: names are Latvian words for "example" and "sample"
 * (Paraugs, Piemērs, Fiktīvs, Izdomāts), streets do not exist, phone numbers start with 600 (no
 * place of the real files uses them), institution codes start with 9 and pharmacy numbers with
 * 9000. Each GP row also carries a made-up GP identifier and patient counts, and each pharmacy a
 * made-up manager and e-mail, so the tests can check they are never stored. Never commit real
 * rows. Deterministic: the same files on every run. Run with
 * `bun run --cwd packages/etl fixtures:lv`.
 *
 * The territories and their centroids are real public rows of the address register (VZD, CC BY
 * 4.0): a small subset.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeXlsxSheets } from "../src/lib/xlsx";

export const LV_FIXTURES = join(import.meta.dirname, "lv");

// ---------------------------------------------------------------------------
// Places: a real subset of the address register
// ---------------------------------------------------------------------------

const VAR_HEADER = [
	"KODS",
	"TIPS_CD",
	"NOSAUKUMS",
	"VKUR_CD",
	"VKUR_TIPS",
	"APSTIPR",
	"APST_PAK",
	"STATUSS",
	"SORT_NOS",
	"DAT_SAK",
	"DAT_MOD",
	"DAT_BEIG",
	"ATRIB",
	"STD",
];

/** Code, type, name, parent, parent type, status, full name, ATVK, standard name. */
type VarRow = [string, string, string, string, string, string, string, string, string];

export const LV_MUNICIPALITIES: VarRow[] = [
	[
		"100016671",
		"113",
		"Madonas nov.",
		"100000000",
		"101",
		"EKS",
		"Madonas novads",
		"0038001",
		"Madonas nov.",
	],
	[
		"100016768",
		"113",
		"Siguldas nov.",
		"100000000",
		"101",
		"EKS",
		"Siguldas novads",
		"0048000",
		"Siguldas nov.",
	],
	[
		"100016647",
		"113",
		"Valmieras nov.",
		"100000000",
		"101",
		"EKS",
		"Valmieras novads",
		"0054000",
		"Valmieras nov.",
	],
	[
		"100016333",
		"113",
		"Ventspils nov.",
		"100000000",
		"101",
		"EKS",
		"Ventspils novads",
		"0056000",
		"Ventspils nov.",
	],
	[
		"100016501",
		"113",
		"Ādažu nov.",
		"100000000",
		"101",
		"EKS",
		"Ādažu novads",
		"0023000",
		"Ādažu nov.",
	],
	// A municipality of before the 2021 reform: read, never imported.
	[
		"100015645",
		"113",
		"Aglonas nov.",
		"100000000",
		"101",
		"DEL",
		"Aglonas novads",
		"0604300",
		"Aglonas nov.",
	],
];

export const LV_TOWNS: VarRow[] = [
	[
		"100003011",
		"104",
		"Daugavpils",
		"100000000",
		"101",
		"EKS",
		"Daugavpils",
		"0002000",
		"Daugavpils",
	],
	["100003036", "104", "Jūrmala", "100000000", "101", "EKS", "Jūrmala", "0004000", "Jūrmala"],
	[
		"100003438",
		"104",
		"Madona",
		"100016671",
		"113",
		"EKS",
		"Madona",
		"0038220",
		"Madona, Madonas nov.",
	],
	[
		"100003743",
		"104",
		"Mazsalaca",
		"100016647",
		"113",
		"EKS",
		"Mazsalaca",
		"0054200",
		"Mazsalaca, Valmieras nov.",
	],
	[
		"100003768",
		"104",
		"Piltene",
		"100016333",
		"113",
		"EKS",
		"Piltene",
		"0056200",
		"Piltene, Ventspils nov.",
	],
	["100003003", "104", "Rīga", "100000000", "101", "EKS", "Rīga", "0001000", "Rīga"],
	[
		"100003591",
		"104",
		"Sigulda",
		"100016768",
		"113",
		"EKS",
		"Sigulda",
		"0048200",
		"Sigulda, Siguldas nov.",
	],
	[
		"100003807",
		"104",
		"Valmiera",
		"100016647",
		"113",
		"EKS",
		"Valmiera",
		"0054010",
		"Valmiera, Valmieras nov.",
	],
	["100003823", "104", "Ādaži", "100016501", "113", "EKS", "Ādaži", "0023200", "Ādaži, Ādažu nov."],
];

export const LV_PARISHES: VarRow[] = [
	[
		"100013594",
		"105",
		"Allažu pag.",
		"100016768",
		"113",
		"EKS",
		"Allažu pagasts",
		"0048400",
		"Allažu pag., Siguldas nov.",
	],
	[
		"100015130",
		"105",
		"Ances pag.",
		"100016333",
		"113",
		"EKS",
		"Ances pagasts",
		"0056400",
		"Ances pag., Ventspils nov.",
	],
	[
		"100016526",
		"105",
		"Carnikavas pag.",
		"100016501",
		"113",
		"EKS",
		"Carnikavas pagasts",
		"0023411",
		"Carnikavas pag., Ādažu nov.",
	],
	[
		"100014530",
		"105",
		"Kocēnu pag.",
		"100016647",
		"113",
		"EKS",
		"Kocēnu pagasts",
		"0054490",
		"Kocēnu pag., Valmieras nov.",
	],
	[
		"100014797",
		"105",
		"Mores pag.",
		"100016768",
		"113",
		"EKS",
		"Mores pagasts",
		"0048450",
		"Mores pag., Siguldas nov.",
	],
	[
		"100014401",
		"105",
		"Trikātas pag.",
		"100016647",
		"113",
		"EKS",
		"Trikātas pagasts",
		"0054600",
		"Trikātas pag., Valmieras nov.",
	],
	[
		"100014715",
		"105",
		"Usmas pag.",
		"100016333",
		"113",
		"EKS",
		"Usmas pagasts",
		"0056470",
		"Usmas pag., Ventspils nov.",
	],
	[
		"100012824",
		"105",
		"Ērgļu pag.",
		"100016671",
		"113",
		"EKS",
		"Ērgļu pagasts",
		"0038450",
		"Ērgļu pag., Madonas nov.",
	],
];

/** Code, type, name, latitude, longitude (WGS 84). */
export const LV_CENTROIDS: [string, string, string, number, number][] = [
	["100016671", "113", "Madonas nov.", 56.81936, 26.331988],
	["100016768", "113", "Siguldas nov.", 57.160387, 24.829369],
	["100016647", "113", "Valmieras nov.", 57.73447, 25.413284],
	["100016333", "113", "Ventspils nov.", 57.339185, 21.812469],
	["100016501", "113", "Ādažu nov.", 57.111279, 24.345894],
	["100003011", "104", "Daugavpils", 55.89629, 26.537304],
	["100003036", "104", "Jūrmala", 56.966411, 23.555691],
	["100003438", "104", "Madona", 56.85509, 26.225814],
	["100003743", "104", "Mazsalaca", 57.863027, 25.043743],
	["100003768", "104", "Piltene", 57.22639, 21.685114],
	["100003003", "104", "Rīga", 56.987113, 24.129174],
	["100003591", "104", "Sigulda", 57.162547, 24.844612],
	["100003807", "104", "Valmiera", 57.526574, 25.419267],
	["100003823", "104", "Ādaži", 57.070701, 24.344179],
	["100013594", "105", "Allažu pag.", 57.056105, 24.768167],
	["100015130", "105", "Ances pag.", 57.5217, 22.017841],
	["100016526", "105", "Carnikavas pag.", 57.102822, 24.231962],
	["100014530", "105", "Kocēnu pag.", 57.513249, 25.267783],
	["100014797", "105", "Mores pag.", 57.076372, 25.065307],
	["100014401", "105", "Trikātas pag.", 57.547106, 25.713706],
	["100014715", "105", "Usmas pag.", 57.265975, 22.183997],
	["100012824", "105", "Ērgļu pag.", 56.934837, 25.620673],
];

/**
 * The localities the made-up places are at, as the Ministry's list writes them (municipality,
 * town, parish, village) and as the register writes their address (`Sigulda, Siguldas nov.`),
 * with a postcode and a point near the locality's centroid.
 */
type Locality = {
	municipality: string;
	town: string;
	parish: string;
	village: string;
	address: string;
	postcode: string;
	latitude: number;
	longitude: number;
};

const locality = (
	municipality: string,
	town: string,
	parish: string,
	village: string,
	postcode: string,
	latitude: number,
	longitude: number,
): Locality => ({
	municipality,
	town,
	parish,
	village,
	address: [village || town, parish, municipality].filter(Boolean).join(", "),
	postcode,
	latitude,
	longitude,
});

export const LOCALITIES = {
	riga: locality("", "Rīga", "", "", "LV-1050", 56.9496, 24.1052),
	daugavpils: locality("", "Daugavpils", "", "", "LV-5401", 55.8747, 26.5362),
	jurmala: locality("", "Jūrmala", "", "", "LV-2015", 56.9681, 23.7704),
	sigulda: locality("Siguldas nov.", "Sigulda", "", "", "LV-2150", 57.1537, 24.8533),
	valmiera: locality("Valmieras nov.", "Valmiera", "", "", "LV-4201", 57.5385, 25.4264),
	mazsalaca: locality("Valmieras nov.", "Mazsalaca", "", "", "LV-4215", 57.8622, 25.0498),
	madona: locality("Madonas nov.", "Madona", "", "", "LV-4801", 56.8538, 26.2172),
	adazi: locality("Ādažu nov.", "Ādaži", "", "", "LV-2164", 57.0753, 24.3247),
	piltene: locality("Ventspils nov.", "Piltene", "", "", "LV-3620", 57.2241, 21.6712),
	more: locality("Siguldas nov.", "", "Mores pag.", "More", "LV-4108", 57.0771, 25.0589),
	trikata: locality("Valmieras nov.", "", "Trikātas pag.", "Trikāta", "LV-4731", 57.5464, 25.7127),
	ance: locality("Ventspils nov.", "", "Ances pag.", "Ance", "LV-3612", 57.5174, 22.0241),
	carnikava: locality(
		"Ādažu nov.",
		"",
		"Carnikavas pag.",
		"Carnikava",
		"LV-2163",
		57.1307,
		24.2833,
	),
	ergli: locality("Madonas nov.", "", "Ērgļu pag.", "Ērgļi", "LV-4840", 56.8999, 25.6402),
} as const;

type LocalityId = keyof typeof LOCALITIES;

const LOCALITY_IDS = Object.keys(LOCALITIES) as LocalityId[];

// ---------------------------------------------------------------------------
// The National Health Service's GPs and the Ministry of the Interior's addresses
// ---------------------------------------------------------------------------

export type LvGpCase = {
	/** Nine digits; the made-up ones start with 9. */
	code: string;
	institution: string;
	/** Family name and first name of each GP, as the NVD writes them. */
	gps: [string, string][];
	office: string;
};

export type LvAddressCase = {
	id: number;
	/** The institution's code, or null for a line without one. */
	code: string | null;
	branch: string;
	name: string;
	legalName: string;
	kind: "Ģimenes ārstu prakse" | "Hospitalizācijas iestāde" | "Ārstniecības iestāde" | "";
	where: LocalityId;
	street: string;
	/** A municipality's name of before the 2021 reform, as the 2024 list may still give it. */
	staleMunicipality?: string;
};

export type LvPharmacyCase = {
	id: number;
	name: string;
	owner: string;
	type: "5" | "6" | "3" | "1";
	status: "4" | "3";
	suspended: "0" | "1";
	where: LocalityId;
	street: string;
	/** The postcode as the register prints it in the address (`LV-1050`, `LV -1050`). */
	postcodeText?: string;
	phone: string;
	located?: boolean;
};

export type LvFixtureSet = {
	gps: LvGpCase[];
	addresses: LvAddressCase[];
	pharmacies: LvPharmacyCase[];
};

const FIRST_NAMES_F = ["Ilze", "Anna", "Līga", "Inese", "Dace", "Zane", "Ieva", "Laura"];
const FIRST_NAMES_M = ["Jānis", "Andris", "Pēteris", "Mārtiņš", "Edgars", "Roberts"];
const SURNAMES: [string, string][] = [
	["Paraugs", "Parauga"],
	["Piemērs", "Piemēre"],
	["Fiktīvs", "Fiktīva"],
	["Izdomāts", "Izdomāta"],
	["Testa", "Testa"],
];
const OFFICES = [
	"12-NVD Rīgas nodaļa",
	"14-NVD Vidzemes nodaļa",
	"10-NVD Kurzemes nodaļa",
	"13-NVD Zemgales nodaļa",
	"15-NVD Latgales nodaļa",
];

/** A made-up GP's family and first names, from a number. */
function gpName(n: number): [string, string] {
	const female = n % 3 !== 0;
	const [masculine, feminine] = SURNAMES[n % SURNAMES.length] ?? ["Paraugs", "Parauga"];
	const first = female
		? (FIRST_NAMES_F[n % FIRST_NAMES_F.length] ?? "Ilze")
		: (FIRST_NAMES_M[n % FIRST_NAMES_M.length] ?? "Jānis");
	return [female ? feminine : masculine, first];
}

/** The practices the tests look at, by name. */
const NAMED_GPS: LvGpCase[] = [
	{
		code: "010000006",
		institution: "Ilzes Paraugas ģimenes ārsta prakse, SIA",
		gps: [["Parauga", "Ilze"]],
		office: "12-NVD Rīgas nodaļa",
	},
	{
		// Three GPs, two places.
		code: "900000014",
		institution: "PARAUGU VESELĪBAS CENTRS, Sabiedrība ar ierobežotu atbildību",
		gps: [
			["Piemēre", "Anna"],
			["Izdomāts", "Jānis"],
			["Fiktīva", "Līga"],
		],
		office: "14-NVD Vidzemes nodaļa",
	},
	{
		// GPs who see patients at a hospital: the practice is at the hospital's address.
		code: "900000022",
		institution: "Paraugu reģionālā slimnīca, SIA",
		gps: [
			["Testa", "Inese"],
			["Paraugs", "Andris"],
		],
		office: "13-NVD Zemgales nodaļa",
	},
	{
		// No address in the Ministry's list: not listed.
		code: "900000030",
		institution: "Piemēra Jānis - ģimenes ārsta prakse",
		gps: [["Piemērs", "Jānis"]],
		office: "15-NVD Latgales nodaļa",
	},
	{
		code: "900000049",
		institution: "Fiktīvas Daces ģimenes ārsta prakse, IK",
		gps: [["Fiktīva", "Dace"]],
		office: "10-NVD Kurzemes nodaļa",
	},
	{
		// A sole trader's legal name after the practice's.
		code: "900000057",
		institution:
			"IZDOMĀTAS ZANES ĢIMENES ĀRSTA PRAKSE, Rīgas pilsētas Z.Izdomātas individuālais uzņēmums",
		gps: [["Izdomāta", "Zane"]],
		office: "12-NVD Rīgas nodaļa",
	},
];

/** The Ministry's lines the tests look at, by name. */
const NAMED_ADDRESSES: LvAddressCase[] = [
	{
		id: 9001,
		code: "010000006",
		branch: "90001",
		name: "Parauga Ilze ĢĀP",
		legalName: "Ilzes Paraugas ģimenes ārsta prakse, SIA Rīga, Parauga iela 1",
		kind: "Ģimenes ārstu prakse",
		where: "riga",
		street: "Parauga iela 1",
	},
	{
		id: 9002,
		code: "900000014",
		branch: "90002",
		name: "Paraugu veselības centrs, SIA",
		legalName:
			"Paraugu veselības centrs, Sabiedrība ar ierobežotu atbildību Siguldas nov., Sigulda, Piemēra iela 5",
		kind: "Ģimenes ārstu prakse",
		where: "sigulda",
		street: "Piemēra iela 5",
	},
	{
		id: 9003,
		code: "900000014",
		branch: "90003",
		name: "Paraugu veselības centrs, SIA filiāle",
		legalName:
			'Paraugu veselības centrs, Sabiedrība ar ierobežotu atbildību Siguldas nov., Mores pag., More, "Paraugi"',
		kind: "Ģimenes ārstu prakse",
		where: "more",
		street: '"Paraugi"',
	},
	{
		id: 9004,
		code: "900000022",
		branch: "90004",
		name: "Paraugu reģionālā slimnīca, SIA",
		legalName:
			"Paraugu reģionālā slimnīca, Sabiedrība ar ierobežotu atbildību Valmieras nov., Valmiera, Slimnīcas parauga iela 2",
		kind: "Hospitalizācijas iestāde",
		where: "valmiera",
		street: "Slimnīcas parauga iela 2",
	},
	{
		// The hospital's branch: a page of its own.
		id: 9005,
		code: "900000022",
		branch: "90005",
		name: "Paraugu reģionālā slimnīca, SIA filiāle Mazsalacā",
		legalName:
			"Paraugu reģionālā slimnīca, Sabiedrība ar ierobežotu atbildību Valmieras nov., Mazsalaca, Parka parauga iela 3",
		kind: "Ārstniecības iestāde",
		where: "mazsalaca",
		street: "Parka parauga iela 3",
	},
	{
		// A line without an institution code or kind.
		id: 9006,
		code: null,
		branch: "",
		name: "Paraugu dzemdību nams",
		legalName: "",
		kind: "",
		where: "riga",
		street: "Piemēra iela 45",
	},
	{
		// Not open to patients: left out.
		id: 9007,
		code: "900000065",
		branch: "90007",
		name: "Paraugu cietuma slimnīca",
		legalName: "PARAUGU CIETUMU SLIMNĪCA, Ieslodzījuma vietu pārvalde",
		kind: "Ārstniecības iestāde",
		where: "jurmala",
		street: "Cietuma parauga iela 10",
	},
	{
		// A GP practice the NVD no longer lists: not imported.
		id: 9008,
		code: "900000073",
		branch: "90008",
		name: "Bijusī Paraugu prakse ĢĀP",
		legalName: "Bijusī Paraugu prakse Rīga, Vecā parauga iela 7",
		kind: "Ģimenes ārstu prakse",
		where: "riga",
		street: "Vecā parauga iela 7",
	},
	{
		id: 9009,
		code: "900000049",
		branch: "90009",
		name: "Fiktīva Dace ĢĀP",
		legalName:
			"Fiktīvas Daces ģimenes ārsta prakse, IK Ventspils nov., Ances pag., Ance, Skolas parauga iela 1",
		kind: "Ģimenes ārstu prakse",
		where: "ance",
		street: "Skolas parauga iela 1",
	},
	{
		// The village's municipality of before the 2021 reform: placed by its point.
		id: 9010,
		code: "900000057",
		branch: "90010",
		name: "Izdomāta Zane ĢĀP",
		legalName:
			"Izdomātas Zanes ģimenes ārsta prakse Carnikavas nov., Carnikava, Jūras parauga iela 4",
		kind: "Ģimenes ārstu prakse",
		where: "carnikava",
		street: "Jūras parauga iela 4",
		staleMunicipality: "Carnikavas nov.",
	},
];

/** Filler GP practices: 300 GPs at 240 institutions, the first 80 with an address. */
function fillerGps(): { gps: LvGpCase[]; addresses: LvAddressCase[] } {
	const gps: LvGpCase[] = [];
	const addresses: LvAddressCase[] = [];
	let person = 1;
	for (let n = 1; n <= 240; n++) {
		const code = `91${String(n).padStart(7, "0")}`;
		const count = n % 4 === 0 ? 2 : 1;
		const people: [string, string][] = [];
		for (let k = 0; k < count; k++) people.push(gpName(person++));
		const [surname, first] = people[0] ?? ["Parauga", "Ilze"];
		gps.push({
			code,
			institution:
				n % 2 === 0
					? `${surname} ${first} - ģimenes ārsta prakse`
					: `Paraugu ģimenes ārstu prakse Nr. ${n}, SIA`,
			gps: people,
			office: OFFICES[n % OFFICES.length] ?? "12-NVD Rīgas nodaļa",
		});
		if (n <= 80) {
			const where = LOCALITY_IDS[n % LOCALITY_IDS.length] ?? "riga";
			addresses.push({
				id: 10_000 + n,
				code,
				branch: String(91_000 + n),
				name: `${surname} ${first} ĢĀP`,
				legalName: `Paraugu prakse ${n}`,
				kind: "Ģimenes ārstu prakse",
				where,
				street: `Parauga iela ${n}`,
			});
		}
	}
	return { gps, addresses };
}

/** Filler hospitals: 18 lines. */
function fillerHospitals(): LvAddressCase[] {
	const rows: LvAddressCase[] = [];
	for (let n = 1; n <= 18; n++) {
		rows.push({
			id: 20_000 + n,
			code: `92${String(n).padStart(7, "0")}`,
			branch: String(92_000 + n),
			name: `Piemēra slimnīca Nr. ${n}, SIA`,
			legalName: `Piemēra slimnīca Nr. ${n}, Sabiedrība ar ierobežotu atbildību`,
			kind: "Hospitalizācijas iestāde",
			where: LOCALITY_IDS[(n * 3) % LOCALITY_IDS.length] ?? "riga",
			street: `Slimnīcas piemēra iela ${n}`,
		});
	}
	return rows;
}

/** The pharmacies the tests look at, by name. */
const NAMED_PHARMACIES: LvPharmacyCase[] = [
	{
		id: 900001,
		name: 'SIA "PARAUGU APTIEKAS" Paraugu aptieka 1',
		owner: "SIA “PARAUGU APTIEKAS”",
		type: "5",
		status: "4",
		suspended: "0",
		where: "riga",
		street: "Parauga iela 10",
		phone: "60000001",
	},
	{
		id: 900002,
		name: "SIA “PARAUGU APTIEKAS” Paraugu aptiekas 1 aptiekas filiāle Ancē",
		owner: "SIA “PARAUGU APTIEKAS”",
		type: "6",
		status: "4",
		suspended: "0",
		where: "ance",
		street: '"Paraugi"-2',
		phone: "60000002",
	},
	{
		id: 900003,
		name: 'Sabiedrība ar ierobežotu atbildību “PIEMĒRS” aptiekas filiāle "Trikāta"',
		owner: "Sabiedrība ar ierobežotu atbildību “PIEMĒRS”",
		type: "6",
		status: "4",
		suspended: "0",
		where: "trikata",
		street: "Nākotnes parauga iela 2",
		phone: "60000003",
	},
	{
		// A sole trader's legal name names a person: never the page's name.
		id: 900004,
		name: "Paraugu pagasta Annas Paraugas individuālais uzņēmums “IZDOMĀTĀ APTIEKA”",
		owner: "IK “IZDOMĀTĀ APTIEKA”",
		type: "5",
		status: "4",
		suspended: "0",
		where: "ergli",
		street: "Rīgas parauga iela 3",
		phone: "60000004",
	},
	{
		// A postcode written with a space; no point: located at its town's centroid.
		id: 900005,
		name: "SIA “FIKTĪVĀ APTIEKA” Fiktīvā aptieka",
		owner: "SIA “FIKTĪVĀ APTIEKA”",
		type: "5",
		status: "4",
		suspended: "0",
		where: "riga",
		street: "Fiktīvā iela 5",
		postcodeText: "LV -1012",
		phone: "60000005",
		located: false,
	},
	{
		// A hospital's pharmacy, a wholesaler and a suspended licence: left out.
		id: 900006,
		name: "SIA “PARAUGU SLIMNĪCA” slēgta tipa aptieka",
		owner: "SIA “PARAUGU SLIMNĪCA”",
		type: "3",
		status: "4",
		suspended: "0",
		where: "valmiera",
		street: "Slimnīcas parauga iela 2",
		phone: "60000006",
	},
	{
		id: 900007,
		name: "SIA “PARAUGU LIELTIRGOTAVA”",
		owner: "SIA “PARAUGU LIELTIRGOTAVA”",
		type: "1",
		status: "4",
		suspended: "0",
		where: "riga",
		street: "Noliktavas parauga iela 1",
		phone: "60000007",
	},
	{
		id: 900008,
		name: "SIA “APTURĒTĀ APTIEKA” Apturētā aptieka",
		owner: "SIA “APTURĒTĀ APTIEKA”",
		type: "5",
		status: "3",
		suspended: "1",
		where: "madona",
		street: "Apturētā parauga iela 8",
		phone: "60000008",
	},
];

/** Filler pharmacies: 220 general pharmacies and branches; four share a chain's number. */
function fillerPharmacies(): LvPharmacyCase[] {
	const rows: LvPharmacyCase[] = [];
	for (let n = 1; n <= 220; n++) {
		const branch = n % 11 === 0;
		rows.push({
			id: 910_000 + n,
			name: branch
				? `SIA “PIEMĒRA APTIEKAS” Piemēra aptiekas ${n} filiāle`
				: `SIA “PIEMĒRA APTIEKAS” Piemēra aptieka ${n}`,
			owner: "SIA “PIEMĒRA APTIEKAS”",
			type: branch ? "6" : "5",
			status: "4",
			suspended: "0",
			where: LOCALITY_IDS[n % LOCALITY_IDS.length] ?? "riga",
			street: `Aptiekas parauga iela ${n}`,
			// Four pharmacies share one number: a chain's, never stored.
			phone: n <= 4 ? "60099999" : `600${String(10_000 + n).padStart(5, "0")}`,
		});
	}
	return rows;
}

const GP_FILLER = fillerGps();

export const LV_PLACES_OF_CARE: LvFixtureSet = {
	gps: [...NAMED_GPS, ...GP_FILLER.gps],
	addresses: [...NAMED_ADDRESSES, ...GP_FILLER.addresses, ...fillerHospitals()],
	pharmacies: [...NAMED_PHARMACIES, ...fillerPharmacies()],
};

/** The set with every filler pharmacy's number in another range: a run that changes most pages. */
export function withFillerPhones(set: LvFixtureSet, prefix: string): LvFixtureSet {
	return {
		...set,
		pharmacies: set.pharmacies.map((row) =>
			row.id > 910_004 ? { ...row, phone: `${prefix}${row.phone.slice(prefix.length)}` } : row,
		),
	};
}

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------

/** A CSV field: quoted unless it is a bare number, as the register and the portal write them. */
const field = (value: string | number) =>
	typeof value === "number" ? String(value) : `"${value.replace(/"/g, '""')}"`;

/** A CSV with a BOM, every text field quoted (the address register's and the Ministry's way). */
const csv = (header: readonly string[], rows: readonly (readonly (string | number)[])[]) =>
	`\uFEFF${[header, ...rows].map((row) => row.map(field).join(",")).join("\n")}\n`;

/** A CSV field the State Agency of Medicines' way: quoted only when it must be. */
const plainField = (value: string) =>
	/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

function varFile(rows: readonly VarRow[]): string {
	return csv(
		VAR_HEADER,
		rows.map(([code, type, name, parent, parentType, status, sortName, atvk, std]) => [
			code,
			type,
			name,
			parent,
			parentType,
			"Y",
			"252",
			status,
			sortName,
			"1999.03.16",
			"2025.07.22",
			status === "DEL" ? "2021.06.30" : "",
			atvk,
			std,
		]),
	);
}

function centroidsFile(): string {
	return csv(
		[
			"KODS",
			"TIPS_CD",
			"NOSAUKUMS",
			"VKUR_CD",
			"VKUR_TIPS",
			"STD",
			"KOORD_X",
			"KOORD_Y",
			"DD_N",
			"DD_E",
		],
		LV_CENTROIDS.map(([code, type, name, latitude, longitude]) => [
			code,
			type,
			name,
			"",
			"",
			name,
			"0",
			"0",
			String(latitude),
			String(longitude),
		]),
	);
}

const NVD_HEADER = [
	"Teritoriālās nodaļas nosaukums",
	"Ārstniecības iestādes kods",
	"Ārstniecības iestādes nosaukums",
	"Ģimenes ārsta uzvārds",
	"Ģimenes ārsta vārds",
	"Ģimenes ārsta ID",
	"Statuss",
	"reģistrēto pacientu skaits līdz 1 gadam",
	"reģistrēto pacientu skaits no 1-6 gadiem",
	"reģistrēto pacientu skaits no 7-14 gadiem",
	"reģistrēto pacientu skaits no 15-17 gadiem",
	"reģistrēto pacientu skaits no 18-44 gadiem",
	"reģistrēto pacientu skaits no 45-64 gadiem",
	"reģistrēto pacientu skaits no 65 gadiem un vairāk",
	"Reģistrēto pacientu skaits kopā",
];

function nvdWorkbook(set: LvFixtureSet): Buffer {
	const rows: string[][] = [NVD_HEADER];
	let person = 0;
	for (const practice of set.gps) {
		for (const [lastName, firstName] of practice.gps) {
			person++;
			// A made-up identifier and patient counts: read by nobody, stored nowhere.
			rows.push([
				practice.office,
				practice.code,
				practice.institution,
				lastName,
				firstName,
				`999${String(person).padStart(8, "0")}`,
				"Reģistrēts",
				"11",
				"22",
				"33",
				"44",
				"555",
				"666",
				"777",
				"2108",
			]);
		}
	}
	// A line whose institution code cannot be read: quarantined.
	rows.push([
		"12-NVD Rīgas nodaļa",
		"nav",
		"Nezināma prakse",
		"Paraugs",
		"Pēteris",
		"99900000999",
		"Reģistrēts",
		"1",
		"1",
		"1",
		"1",
		"1",
		"1",
		"1",
		"7",
	]);
	// The totals of the patients whose GP left: no institution, never a practice.
	for (const office of OFFICES) {
		rows.push([
			office,
			"",
			"",
			"",
			"",
			"",
			"Pasīvi reģistrēts",
			"5",
			"6",
			"7",
			"8",
			"90",
			"80",
			"70",
			"266",
		]);
	}
	return writeXlsxSheets([{ name: "ĢĀ", rows }], { deflate: true });
}

function vkcpFile(set: LvFixtureSet): string {
	const header = [
		"ID",
		"Nosaukums",
		"Adrese",
		"NovadaKods",
		"NovadaNosaukums",
		"PilsetasKods",
		"PilsetasNosaukums",
		"PagastaKods",
		"PagastaNosaukums",
		"CiemaKods",
		"CiemaNosaukums",
		"lat",
		"long",
		"IestadesKods",
		"IestadesFilialesKods",
		"IestadesNosaukums",
		"IestadesTips",
	];
	const rows = set.addresses.map((line) => {
		const place = LOCALITIES[line.where];
		const municipality = line.staleMunicipality ?? place.municipality;
		const address = [municipality, place.town, place.parish, place.village, line.street]
			.filter(Boolean)
			.join(", ");
		// Points spread a little around the locality, stable across runs.
		const latitude = (place.latitude + ((line.id % 7) - 3) * 0.0011).toFixed(6);
		const longitude = (place.longitude + ((line.id % 5) - 2) * 0.0013).toFixed(6);
		return [
			line.id,
			line.name,
			address,
			municipality ? "100000001" : "",
			municipality,
			place.town ? "100000002" : "",
			place.town,
			place.parish ? "100000003" : "",
			place.parish,
			place.village ? "100000004" : "",
			place.village,
			Number(latitude),
			Number(longitude),
			line.code ?? "",
			line.branch,
			line.legalName ? `${line.legalName} ${address}` : "",
			line.kind,
		];
	});
	return csv(header, rows);
}

const ZVA_HEADER = [
	"object_id",
	"object_initial_id",
	"object_name",
	"object_type",
	"object_type_txt",
	"pharm_owner_name",
	"reg_num",
	"lic_type_txt",
	"lic_code",
	"lic_status",
	"issued",
	"valid_from",
	"valid_to",
	"suspended",
	"suspended_from",
	"notification_date",
	"owner_web",
	"owner_addr_nice",
	"object_addr_nice",
	"object_zipcode",
	"object_phone",
	"object_email",
	"object_coord_x",
	"object_coord_y",
	"pharm_manager",
	"responsible_person",
	"pharm_cond",
	"pharm_cond_en",
	"fil_owner_id",
	"fil_lic_code",
	"fil_legal_person",
	"fil_legal_pers_reg_nr",
	"fil_object_relation",
	"scope",
	"human_medicines",
	"vet_medicines",
	"produce_operations",
	"import_operations",
	"produce_medicines",
	"import_medicines",
];

const ZVA_TYPES: Readonly<Record<LvPharmacyCase["type"], string>> = {
	"5": "Vispārēja tipa aptieka",
	"6": "Vispārēja tipa aptiekas filiāle",
	"3": "Slēgta tipa aptieka",
	"1": "Humāno zāļu lieltirgotava",
};

function zvaFile(set: LvFixtureSet): string {
	const rows = set.pharmacies.map((row) => {
		const place = LOCALITIES[row.where];
		const postcode = row.postcodeText ?? place.postcode;
		const address = `${row.street}, ${place.address}, ${postcode}`;
		const located = row.located !== false;
		return [
			String(row.id - 100_000),
			String(row.id),
			row.name,
			row.type,
			ZVA_TYPES[row.type],
			row.owner,
			"40000000000",
			"a",
			`A${String(row.id).slice(-5)}`,
			row.status,
			"2026-01-01",
			"2026-01-10",
			"",
			row.suspended,
			row.suspended === "1" ? "2026-10-01" : "",
			"",
			"www.example.test",
			"Biroja parauga iela 1, Rīga, LV-1001",
			address,
			place.postcode,
			row.phone,
			`aptieka${row.id}@example.test`,
			located ? (place.longitude + (row.id % 5) * 0.0009).toFixed(5) : "",
			located ? (place.latitude + (row.id % 7) * 0.0007).toFixed(5) : "",
			"Pārvaldniece Paraugā",
			"",
			"Zāļu izgatavošana aptiekā",
			"preparation of medicinal products in pharmacy",
			"",
			"",
			"",
			"",
			row.type === "6" ? "Aptiekas filiāle" : "",
			"",
			"0",
			"0",
			"0",
			"0",
			"0",
			"0",
		];
	});
	return `\uFEFF${[ZVA_HEADER.join(","), ...rows.map((row) => row.map(plainField).join(","))].join("\n")}\n`;
}

export function writeLvFixtures(dir: string, set: LvFixtureSet = LV_PLACES_OF_CARE) {
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "gimenes-arsti.xlsx"), nvdWorkbook(set));
	writeFileSync(join(dir, "medicinasiestades.csv"), vkcpFile(set));
	writeFileSync(join(dir, "fdu_register.csv"), zvaFile(set));
	writeFileSync(join(dir, "aw_novads.csv"), varFile(LV_MUNICIPALITIES));
	writeFileSync(join(dir, "aw_pilseta.csv"), varFile(LV_TOWNS));
	writeFileSync(join(dir, "aw_pagasts.csv"), varFile(LV_PARISHES));
	writeFileSync(join(dir, "aw_vietu_centroidi.csv"), centroidsFile());
}

if (import.meta.main) {
	writeLvFixtures(LV_FIXTURES);
	console.log(`Wrote the synthetic Latvian fixtures to ${LV_FIXTURES}`);
}
