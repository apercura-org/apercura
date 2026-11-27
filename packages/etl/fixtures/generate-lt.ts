/**
 * Generates the SYNTHETIC fixtures in `fixtures/lt/`: the six models of VASPVT's licence register
 * (`vaspvt_<Model>.csv`) and the five tables of the Address Register (`ar_<model>.csv`) that
 * `etl:lt` and `etl:places --country lt` read, in the store's CSV format (with its `_type`,
 * `_id`, `_revision`, `_page.next` columns), filled with fictitious institutions.
 *
 * Every institution is made up: names are made-up words (Pavyzdys, Pavyzdinė, Bandymų, Užpildo),
 * the owner an individual enterprise is named after is the Lithuanian placeholder name
 * ("Vardenės Pavardenės individuali įmonė"), streets do not exist, institution numbers start at
 * 9000 and address codes at 90000000 (above the real register's), legal entity codes start with
 * 999. Each institution and licence also carries a made-up legal entity code, seat address and
 * licence number, so the tests can check they are never stored. Never commit real rows. Run with
 * `bun run --cwd packages/etl fixtures:lt`.
 *
 * The counties, six municipalities and a few cities are real public Address Register names and
 * codes; the villages and elderships around them are invented, and every boundary is a small
 * square drawn near the place.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const LT_FIXTURES = join(import.meta.dirname, "lt");

const uuid = (prefix: string, n: number) =>
	`${prefix.padEnd(8, "0").slice(0, 8)}-0000-4000-8000-${String(n).padStart(12, "0")}`;

const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;

/** A store CSV: its own columns first, then the model's, every value quoted. */
function storeCsv(model: string, columns: string[], rows: Record<string, string>[]): string {
	const header = ["_type", "_id", "_revision", "_page.next", ...columns];
	const lines = [header.join(",")];
	for (const [index, row] of rows.entries()) {
		lines.push(
			[
				model,
				row._id ?? uuid("f1", index + 1),
				uuid("f2", index + 1),
				"",
				...columns.map((column) => row[column] ?? ""),
			]
				.map(quote)
				.join(","),
		);
	}
	return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// The Address Register
// ---------------------------------------------------------------------------

/** The ten counties: code, genitive name. */
export const LT_COUNTY_ROWS: [string, string][] = [
	["1", "Alytaus"],
	["2", "Kauno"],
	["3", "Klaipėdos"],
	["4", "Marijampolės"],
	["5", "Panevėžio"],
	["6", "Šiaulių"],
	["7", "Tauragės"],
	["8", "Telšių"],
	["9", "Utenos"],
	["10", "Vilniaus"],
];

const countyId = (code: string) => uuid("c0", Number(code));

/** Municipalities: code, name as the register writes it, county code. */
export const LT_MUNICIPALITY_ROWS: [string, string, string][] = [
	["12", "Birštono", "2"],
	["13", "Vilniaus miesto", "10"],
	["19", "Kauno miesto", "2"],
	["21", "Klaipėdos miesto", "3"],
	["41", "Vilniaus rajono", "10"],
	["52", "Kauno rajono", "2"],
];

const municipalityId = (code: string) => uuid("d0", Number(code));

/** Elderships (all invented): code, genitive name, municipality code. */
export const LT_ELDERSHIP_ROWS: [string, string, string][] = [
	["9101", "Pavyzdžio", "41"],
	["9102", "Bandymų", "41"],
	["9103", "Pavyzdėlių", "52"],
];

const eldershipId = (code: string) => uuid("e0", Number(code));

/**
 * Settlements: code, type, genitive, nominative, municipality, eldership, an approximate point in
 * LKS-94 (easting, northing) and whether the register has closed it.
 */
export type LtSettlementRow = {
	code: string;
	type: string;
	genitive: string;
	name: string;
	municipality: string;
	eldership: string | null;
	easting: number;
	northing: number;
	closed?: boolean;
};

export const LT_SETTLEMENT_ROWS: LtSettlementRow[] = [
	{
		code: "31003",
		type: "m.",
		genitive: "Vilniaus",
		name: "Vilnius",
		municipality: "13",
		eldership: null,
		easting: 582_000,
		northing: 6_061_000,
	},
	{
		code: "15345",
		type: "m.",
		genitive: "Grigiškių",
		name: "Grigiškės",
		municipality: "13",
		eldership: null,
		easting: 567_000,
		northing: 6_056_000,
	},
	{
		code: "17507",
		type: "m.",
		genitive: "Kauno",
		name: "Kaunas",
		municipality: "19",
		eldership: null,
		easting: 497_000,
		northing: 6_086_000,
	},
	{
		code: "18067",
		type: "m.",
		genitive: "Klaipėdos",
		name: "Klaipėda",
		municipality: "21",
		eldership: null,
		easting: 321_000,
		northing: 6_176_000,
	},
	{
		code: "12016",
		type: "m.",
		genitive: "Birštono",
		name: "Birštonas",
		municipality: "12",
		eldership: null,
		easting: 507_000,
		northing: 6_050_000,
	},
	{
		code: "12019",
		type: "k.",
		genitive: "Birštono",
		name: "Birštonas",
		municipality: "12",
		eldership: null,
		easting: 510_000,
		northing: 6_047_000,
	},
	{
		code: "90001",
		type: "k.",
		genitive: "Pavyzdžių",
		name: "Pavyzdžiai",
		municipality: "41",
		eldership: "9101",
		easting: 590_000,
		northing: 6_070_000,
	},
	{
		code: "90002",
		type: "k.",
		genitive: "Pavyzdžių",
		name: "Pavyzdžiai",
		municipality: "41",
		eldership: "9102",
		easting: 575_000,
		northing: 6_075_000,
	},
	{
		code: "90003",
		type: "mstl.",
		genitive: "Bandomosios",
		name: "Bandomoji",
		municipality: "41",
		eldership: "9102",
		easting: 572_000,
		northing: 6_080_000,
	},
	{
		code: "90004",
		type: "k.",
		genitive: "Pavyzdėlių",
		name: "Pavyzdėliai",
		municipality: "52",
		eldership: "9103",
		easting: 505_000,
		northing: 6_080_000,
	},
	{
		code: "90005",
		type: "m.",
		genitive: "Pavyzdinės",
		name: "Pavyzdinė",
		municipality: "52",
		eldership: null,
		easting: 490_000,
		northing: 6_078_000,
	},
	{
		code: "90009",
		type: "k.",
		genitive: "Uždarytųjų",
		name: "Uždarytieji",
		municipality: "52",
		eldership: "9103",
		easting: 500_000,
		northing: 6_090_000,
		closed: true,
	},
	// A village of another municipality named as the capital (the real register has one in
	// Kupiškis): a search for "Vilnius" still means the capital (#195).
	{
		code: "90010",
		type: "k.",
		genitive: "Vilniaus",
		name: "Vilnius",
		municipality: "52",
		eldership: "9103",
		easting: 503_000,
		northing: 6_082_000,
	},
];

/** A square of 1 km around a point, written as the store writes LKS-94: northing first. */
const square = (easting: number, northing: number) => {
	const ring = [
		[northing - 500, easting - 500],
		[northing - 500, easting + 500],
		[northing + 500, easting + 500],
		[northing + 500, easting - 500],
		[northing - 500, easting - 500],
	];
	return `POLYGON ((${ring.map(([n, e]) => `${n} ${e}`).join(", ")}))`;
};

export function addressRegisterFiles(): Record<string, string> {
	return {
		"ar_apskritis.csv": storeCsv(
			"datasets/gov/rc/ar/apskritis/Apskritis",
			["adm_kodas", "tipas", "santrumpa", "pavadinimas", "adm_nuo"],
			LT_COUNTY_ROWS.map(([code, name]) => ({
				_id: countyId(code),
				adm_kodas: code,
				tipas: "apskritis",
				santrumpa: "apskr.",
				pavadinimas: name,
				adm_nuo: "1998-06-01",
			})),
		),
		"ar_savivaldybe.csv": storeCsv(
			"datasets/gov/rc/ar/savivaldybe/Savivaldybe",
			["sav_kodas", "tipas", "tipo_santrumpa", "pavadinimas", "apskritis._id", "sav_nuo"],
			LT_MUNICIPALITY_ROWS.map(([code, name, county]) => ({
				_id: municipalityId(code),
				sav_kodas: code,
				tipas: "savivaldybė",
				tipo_santrumpa: "sav.",
				pavadinimas: name,
				"apskritis._id": countyId(county),
				sav_nuo: "1998-06-01",
			})),
		),
		"ar_seniunija.csv": storeCsv(
			"datasets/gov/rc/ar/seniunija/Seniunija",
			[
				"sen_kodas",
				"tipas",
				"tipo_santrumpa",
				"pavadinimas",
				"savivaldybe._id",
				"sen_nuo",
				"sen_iki",
			],
			LT_ELDERSHIP_ROWS.map(([code, name, municipality]) => ({
				_id: eldershipId(code),
				sen_kodas: code,
				tipas: "seniūnija",
				tipo_santrumpa: "sen.",
				pavadinimas: name,
				"savivaldybe._id": municipalityId(municipality),
				sen_nuo: "2006-01-01",
				sen_iki: "",
			})),
		),
		"ar_gyvenamojivietove.csv": storeCsv(
			"datasets/gov/rc/ar/gyvenamojivietove/GyvenamojiVietove",
			[
				"gyv_kodas",
				"tipas",
				"tipo_santrumpa",
				"pavadinimas_k",
				"pavadinimas",
				"seniunija._id",
				"savivaldybe._id",
				"gyv_nuo",
				"gyv_iki",
			],
			LT_SETTLEMENT_ROWS.map((row) => ({
				gyv_kodas: row.code,
				tipas: { "m.": "Miestas", "mstl.": "Miestelis", "k.": "Kaimas" }[row.type] ?? "Kaimas",
				tipo_santrumpa: row.type,
				pavadinimas_k: row.genitive,
				pavadinimas: row.name,
				"seniunija._id": row.eldership ? eldershipId(row.eldership) : "",
				"savivaldybe._id": municipalityId(row.municipality),
				gyv_nuo: "1998-06-01",
				gyv_iki: row.closed ? "2020-01-01" : "",
			})),
		),
		// The boundaries' file is a `?select(gyv_kodas,gyv_vietoves)` download: no store columns.
		"ar_gragyvenamojivietove.csv": `gyv_kodas,gyv_vietoves\n${LT_SETTLEMENT_ROWS.filter(
			(row) => !row.closed,
		)
			.map((row) => `${row.code},${quote(square(row.easting, row.northing))}`)
			.join("\n")}\n`,
	};
}

// ---------------------------------------------------------------------------
// VASPVT's licence register
// ---------------------------------------------------------------------------

/**
 * Service settings (`PaslauguNustatymas`): id, mode, service id, group, level, type, and the
 * service's name (`Paslauga`), the register's own labels.
 */
export const LT_SERVICE_ROWS: [string, string, string, string, string, string, string][] = [
	["1", "1", "30", "1", "1", "", "Šeimos medicina"],
	["2", "1", "41", "1", "2", "", "Suaugusiųjų kardiologija"],
	["3", "1", "48", "2", "2", "", "Odontologija"],
	["4", "1", "49", "3", "0", "", "Burnos higienisto praktika"],
	["5", "2", "60", "", "2", "", "Vidaus ligos"],
	["6", "3", "110", "", "0", "4", "Bendrosios praktikos slauga"],
	["7", "3", "70", "", "0", "", "Kineziterapija"],
	["8", "1", "80", "1", "1", "", "Psichikos sveikatos priežiūra"],
	["9", "3", "90", "", "0", "", "Laboratorinė diagnostika"],
	["10", "3", "95", "", "0", "", "Optometrininko praktika"],
	["11", "0", "99", "", "0", "", "privalomasis higienos įgūdžių mokymas"],
	["12", "1", "42", "1", "2", "", "Dermatovenerologija"],
];

/** An institution of the fixtures and its activity addresses. */
export type LtCase = {
	/** `spi_id`, from 9000. */
	id: number;
	/** The registered name; null for an institution with no `Istaiga` row (named by its licence). */
	name: string | null;
	/** The licence's name (`Licencija.ja_pavadinimas`). */
	licenceName: string;
	/** `teisine_forma` code (`310` UAB, `960` MB, `810` individual enterprise, `150` VšĮ). */
	legalForm: string;
	/** Licence state: current, suspended (`busena` 2) or revoked (a revocation date). */
	licence: "current" | "suspended" | "revoked";
	addresses: {
		/** `adreso_id`, empty when the register gives none. */
		code: string;
		text: string;
		/** Service setting ids (`LT_SERVICE_ROWS`). */
		services: string[];
	}[];
};

/** The institutions whose pages the tests look at one by one. */
export const LT_ANCHORS: LtCase[] = [
	{
		id: 9000,
		name: "Uždaroji akcinė bendrovė „Pavyzdinė klinika“",
		licenceName: "UAB „Pavyzdinė klinika“",
		legalForm: "310",
		licence: "current",
		addresses: [
			{
				code: "90000001",
				text: "Vilniaus apskr. Vilniaus miesto sav. Vilniaus m. Pavyzdžio g. 12-3",
				services: ["2", "3", "12"],
			},
		],
	},
	{
		id: 9001,
		name: "Vardenės Pavardenės individuali įmonė",
		licenceName: "Vardenės Pavardenės individuali įmonė",
		legalForm: "810",
		licence: "current",
		addresses: [
			{ code: "90000002", text: "Kauno m.sav., Kauno m., Bandymų g. 5-207", services: ["6"] },
		],
	},
	{
		id: 9002,
		name: "Viešoji įstaiga Pavyzdžio ligoninė",
		licenceName: "Viešoji įstaiga Pavyzdžio ligoninė",
		legalForm: "150",
		licence: "current",
		addresses: [
			{
				code: "90000003",
				text: "Klaipėdos apskr. Klaipėdos miesto sav. Klaipėdos m. Ligoninės g. 1",
				services: ["5", "2", "6"],
			},
			// No address code: the key takes the address GUID's start.
			{
				code: "",
				text: "Klaipėdos apskr. Klaipėdos miesto sav. Klaipėdos m. Ligoninės g. 3",
				services: ["2"],
			},
		],
	},
	{
		id: 9003,
		name: "Mažoji bendrija „Pavyzdžio odontologija“",
		licenceName: "MB „Pavyzdžio odontologija“",
		legalForm: "960",
		licence: "current",
		addresses: [
			{
				code: "90000004",
				text: "Vilniaus r. sav., Bandymų sen., Pavyzdžių k., Liepų g. 1",
				services: ["3", "4"],
			},
		],
	},
	{
		id: 9004,
		name: null,
		licenceName: "VšĮ Pavyzdžio šeimos klinika",
		legalForm: "",
		licence: "current",
		addresses: [
			{ code: "90000005", text: "Birštono sav., Birštonas, Pavyzdžio g. 3", services: ["1", "8"] },
		],
	},
	{
		id: 9005,
		name: "UAB „Pavyzdžio mokymai“",
		licenceName: "UAB „Pavyzdžio mokymai“",
		legalForm: "310",
		licence: "current",
		addresses: [
			{ code: "90000006", text: "Kauno m. sav., Kauno m., Mokymų g. 2", services: ["11"] },
		],
	},
	{
		id: 9006,
		name: "UAB „Sustabdytas pavyzdys“",
		licenceName: "UAB „Sustabdytas pavyzdys“",
		legalForm: "310",
		licence: "suspended",
		addresses: [
			{ code: "90000007", text: "Kauno m. sav., Kauno m., Laukimo g. 7", services: ["3"] },
		],
	},
	{
		id: 9007,
		name: "UAB „Buvęs pavyzdys“",
		licenceName: "UAB „Buvęs pavyzdys“",
		legalForm: "310",
		licence: "revoked",
		addresses: [
			{ code: "90000008", text: "Kauno m. sav., Kauno m., Senoji g. 8", services: ["3"] },
		],
	},
	{
		id: 9008,
		name: "UAB „Užsienio pavyzdys“",
		licenceName: "UAB „Užsienio pavyzdys“",
		legalForm: "310",
		licence: "current",
		addresses: [{ code: "", text: "Ryga, Pavyzdžio iela 1", services: ["3"] }],
	},
	{
		id: 9009,
		name: "UAB „Dvigubas pavyzdys“",
		licenceName: "UAB „Dvigubas pavyzdys“",
		legalForm: "310",
		licence: "current",
		addresses: [
			{ code: "90000010", text: "Kauno m. sav., Kauno m., Dvynių g. 10", services: ["7"] },
			// The same address code listed twice: one page, the services of both.
			{ code: "90000010", text: "Kauno m. sav., Kauno m., Dvynių g. 10", services: ["6"] },
		],
	},
	{
		id: 9010,
		name: "VšĮ Pavyzdžių kaimo slauga",
		licenceName: "VšĮ Pavyzdžių kaimo slauga",
		legalForm: "150",
		licence: "current",
		// Two villages of the municipality share the name and no eldership tells them apart.
		addresses: [
			{ code: "90000011", text: "Vilniaus r. sav., Pavyzdžių k., Mokyklos g. 2", services: ["6"] },
		],
	},
	{
		id: 9011,
		name: "UAB „Pavyzdėlių laboratorija“",
		licenceName: "UAB „Pavyzdėlių laboratorija“",
		legalForm: "310",
		licence: "current",
		addresses: [
			{
				code: "90000012",
				text: "Kauno apskr., Kauno r. sav., Pavyzdėlių sen., Pavyzdėlių k., Sodų g. 4",
				services: ["9"],
			},
		],
	},
	{
		id: 9012,
		name: "UAB „Pavyzdinė optika“",
		licenceName: "UAB „Pavyzdinė optika“",
		legalForm: "310",
		licence: "current",
		addresses: [
			{ code: "90000013", text: "Vilniaus m.sav., Grigiškių m., Optikų g. 6", services: ["10"] },
		],
	},
];

/** The kinds the fillers cycle through (service setting ids). */
const FILLER_SERVICES = [["3"], ["2", "12"], ["6"], ["1"], ["7"], ["8"], ["3", "4"], ["9"]];
const FILLER_TOWNS = [
	"Vilniaus apskr. Vilniaus miesto sav. Vilniaus m.",
	"Kauno m. sav., Kauno m.,",
	"Klaipėdos apskr. Klaipėdos miesto sav. Klaipėdos m.",
	"Kauno r. sav., Pavyzdinės m.,",
	"Vilniaus r. sav., Bandomosios mstl.,",
];

/** Fillers: plain current institutions, one address each, to bring the run above its floors. */
export function ltFillers(count: number, streetSuffix = ""): LtCase[] {
	return Array.from({ length: count }, (_, index) => ({
		id: 9100 + index,
		name: `UAB „Užpildo klinika ${index + 1}“`,
		licenceName: `UAB „Užpildo klinika ${index + 1}“`,
		legalForm: "310",
		licence: "current" as const,
		addresses: [
			{
				code: String(91_000_000 + index),
				text: `${FILLER_TOWNS[index % FILLER_TOWNS.length]} Užpildo${streetSuffix} g. ${index + 1}`,
				services: FILLER_SERVICES[index % FILLER_SERVICES.length] ?? ["3"],
			},
		],
	}));
}

export type LtFixtureSet = {
	cases: LtCase[];
	/** Activity addresses of revoked licences, to bring the file above its line floor. */
	pastAddresses: number;
};

export const LT_INSTITUTIONS: LtFixtureSet = {
	cases: [...LT_ANCHORS, ...ltFillers(330)],
	pastAddresses: 700,
};

/** The GUID of an institution's address (`spi_veiklos_adreso_id`). */
export const addressGuid = (id: number, index: number) =>
	`${String(id).padStart(4, "0")}${String(index).padStart(4, "0")}-ABCD-EF01-2345-0050560AA${String(index).padStart(3, "0")}`;

export function vaspvtFiles(set: LtFixtureSet = LT_INSTITUTIONS): Record<string, string> {
	const institutions: Record<string, string>[] = [];
	const addresses: Record<string, string>[] = [];
	const licences: Record<string, string>[] = [];
	const services: Record<string, string>[] = [];
	let licenceId = 1;
	for (const item of set.cases) {
		const code = `999${String(item.id).padStart(6, "0")}`;
		if (item.name) {
			institutions.push({
				spi_id: String(item.id),
				ja_kodas: code,
				ja_pavadinimas: item.name,
				teisine_forma: item.legalForm,
				adresas: "99999999",
				licencijos_nr: `L-99${item.id}`,
				licencijos_isdavimo_data: "2015-05-18T00:00:00",
				asmuo_visuomene: "1",
			});
		}
		const licence = String(licenceId++);
		licences.push({
			licencijos_id: licence,
			istaiga: String(item.id),
			licencijos_nr: `L-99${item.id}`,
			sudarymo_data: "2015-05-18T00:00:00",
			panaikinimo_data: item.licence === "revoked" ? "2022-01-01T00:00:00" : "",
			ja_kodas: code,
			ja_pavadinimas: item.licenceName,
			ja_buveines_adresas: "Buveinės g. 99-99, Vilnius",
			isakymo_data: "2015-05-18T00:00:00",
			busena: item.licence === "revoked" ? "4" : item.licence === "suspended" ? "2" : "3",
			isakymas: "99999",
			asmuo_ar_visuomene: "1",
		});
		for (const [index, address] of item.addresses.entries()) {
			const guid = addressGuid(item.id, index);
			addresses.push({
				spi_veiklos_adreso_id: guid,
				adreso_id: address.code,
				adresas: address.text,
				istaiga: String(item.id),
				filialas: "",
			});
			for (const setting of address.services) {
				services.push({
					istaigos_paslaugos_id: `${guid}-${setting}`,
					nustatymas: setting,
					licenzija: licence,
					istaiga: String(item.id),
					filialo_id: "",
					veiklos_adresas: guid,
					patikslinta: "True",
				});
			}
		}
	}
	// Addresses of a revoked licence: lines of the register, never pages.
	const past = String(licenceId++);
	licences.push({
		licencijos_id: past,
		istaiga: "9900",
		licencijos_nr: "L-999900",
		sudarymo_data: "2001-01-01T00:00:00",
		panaikinimo_data: "2010-01-01T00:00:00",
		ja_kodas: "999009900",
		ja_pavadinimas: "UAB „Senų adresų pavyzdys“",
		ja_buveines_adresas: "Buveinės g. 99-99, Vilnius",
		isakymo_data: "2001-01-01T00:00:00",
		busena: "4",
		isakymas: "99999",
		asmuo_ar_visuomene: "1",
	});
	for (let index = 0; index < set.pastAddresses; index++) {
		const guid = addressGuid(9900, index);
		addresses.push({
			spi_veiklos_adreso_id: guid,
			adreso_id: String(92_000_000 + index),
			adresas: `Kauno m. sav., Kauno m., Praeities g. ${index + 1}`,
			istaiga: "9900",
			filialas: "",
		});
		services.push({
			istaigos_paslaugos_id: `${guid}-3`,
			nustatymas: "3",
			licenzija: past,
			istaiga: "9900",
			filialo_id: "",
			veiklos_adresas: guid,
			patikslinta: "True",
		});
	}
	const model = (name: string) => `datasets/gov/vaspvt/licencijos/${name}`;
	return {
		"vaspvt_Istaiga.csv": storeCsv(
			model("Istaiga"),
			[
				"spi_id",
				"ja_kodas",
				"ja_pavadinimas",
				"teisine_forma",
				"adresas",
				"licencijos_nr",
				"licencijos_isdavimo_data",
				"asmuo_visuomene",
			],
			institutions,
		),
		"vaspvt_IstaigosVeiklosAdresas.csv": storeCsv(
			model("IstaigosVeiklosAdresas"),
			["spi_veiklos_adreso_id", "adreso_id", "adresas", "istaiga", "filialas"],
			addresses,
		),
		"vaspvt_Licencija.csv": storeCsv(
			model("Licencija"),
			[
				"licencijos_id",
				"istaiga",
				"licencijos_nr",
				"sudarymo_data",
				"panaikinimo_data",
				"ja_kodas",
				"ja_pavadinimas",
				"ja_buveines_adresas",
				"isakymo_data",
				"busena",
				"isakymas",
				"asmuo_ar_visuomene",
			],
			licences,
		),
		"vaspvt_IstaigosPaslauga.csv": storeCsv(
			model("IstaigosPaslauga"),
			[
				"istaigos_paslaugos_id",
				"nustatymas",
				"licenzija",
				"istaiga",
				"filialo_id",
				"veiklos_adresas",
				"patikslinta",
			],
			services,
		),
		"vaspvt_PaslauguNustatymas.csv": storeCsv(
			model("PaslauguNustatymas"),
			[
				"paslaugos_nustatymo_id",
				"paslaugos_budas",
				"paslaugos_id",
				"paslaugos_grupes_id",
				"paslaugos_lygio_id",
				"paslaugos_tipo_id",
			],
			LT_SERVICE_ROWS.map(([id, mode, service, group, level, type]) => ({
				paslaugos_nustatymo_id: id,
				paslaugos_budas: mode,
				paslaugos_id: service,
				paslaugos_grupes_id: group,
				paslaugos_lygio_id: level,
				paslaugos_tipo_id: type,
			})),
		),
		"vaspvt_Paslauga.csv": storeCsv(
			model("Paslauga"),
			["paslaugos_id", "pavadinimas"],
			LT_SERVICE_ROWS.map(([, , service, , , , name]) => ({
				paslaugos_id: service,
				pavadinimas: name,
			})),
		),
	};
}

export function writeLtFixtures(dir: string, set: LtFixtureSet = LT_INSTITUTIONS) {
	mkdirSync(dir, { recursive: true });
	for (const [name, content] of Object.entries({
		...addressRegisterFiles(),
		...vaspvtFiles(set),
	})) {
		writeFileSync(join(dir, name), content);
	}
}

if (import.meta.main) {
	writeLtFixtures(LT_FIXTURES);
	console.log(`Wrote the synthetic Lithuanian fixtures to ${LT_FIXTURES}`);
}
