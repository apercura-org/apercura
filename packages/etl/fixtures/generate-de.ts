/**
 * Generates the SYNTHETIC fixtures in `fixtures/de/`: the statistical offices' directory of
 * hospitals and of prevention and rehabilitation clinics in its exact format
 * (`krankenhausverzeichnis.xlsx`: a title sheet, ` KHV_2024` with its stray space, `RHV_2024`,
 * and the record descriptions `DSB_KHV_2024`, `DSB_RHV_2024`), Thuringia's pharmacy shapefile
 * (`apotheke_th.zip`, ETRS89 / UTM 32N) and Brandenburg's pharmacy GeoJSON (`apotheken_bb.json`),
 * filled with fictitious facilities, and the municipalities' directory that `etl:places
 * --country de` reads (`gemeindeverzeichnis.xlsx`).
 *
 * Every facility is made up: names are made-up words (Beispiel, Muster, Fiktiv, Probe…), streets
 * do not exist, phone numbers are in a range no facility of the real files uses, and the
 * pseudonymous hospital ids are drawn from 9000 up. Each row also carries a made-up e-mail, web
 * address and operator name, so the tests can check they are never stored. Never commit real
 * rows. Deterministic: the same files on every run. Run with
 * `bun run --cwd packages/etl fixtures:de`.
 *
 * The Länder, Kreise and Gemeinden are real public GV-ISys names, keys, populations, postcodes
 * and centres: a small subset of the directory.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeDbf, writeShpPoints } from "../src/lib/shapefile";
import { utmToLonLat } from "../src/lib/utm";
import { writeXlsxSheets } from "../src/lib/xlsx";
import { writeStoredZip } from "../src/lib/zip";

export const DE_FIXTURES = join(import.meta.dirname, "de");

/** Länder of the fixture: key, GV-ISys name. */
export const DE_STATES_GV: [string, string][] = [
	["01", "Schleswig-Holstein"],
	["02", "Hamburg"],
	["06", "Hessen"],
	["07", "Rheinland-Pfalz"],
	["09", "Bayern"],
	["10", "Saarland"],
	["11", "Berlin"],
	["12", "Brandenburg"],
	["16", "Thüringen"],
];

/** Kreise: key (Land, RB, Kreis), record subtype, GV-ISys name. */
export const DE_DISTRICTS_GV: [string, string, string][] = [
	["01001", "41", "Flensburg, Stadt"],
	["02000", "41", "Hamburg, Freie und Hansestadt"],
	["06414", "41", "Wiesbaden, Landeshauptstadt"],
	["09162", "41", "München, Landeshauptstadt"],
	["09184", "44", "München"],
	["10041", "45", "Regionalverband Saarbrücken"],
	["11000", "41", "Berlin, Stadt"],
	["12054", "41", "Potsdam, Stadt"],
	["12063", "44", "Havelland"],
	["16051", "41", "Erfurt, Stadt"],
	["16053", "41", "Jena, Stadt"],
	["16055", "41", "Weimar, Stadt"],
];

/** Gemeinden: key, record subtype, GV-ISys name, population, postcode, longitude, latitude. */
export const DE_MUNICIPALITIES_GV: [string, string, string, number, string, number, number][] = [
	["01001000", "61", "Flensburg, Stadt", 96326, "24937", 9.43751, 54.78252],
	["02000000", "61", "Hamburg, Freie und Hansestadt", 1862565, "20038", 9.99697, 53.550678],
	["06414000", "61", "Wiesbaden, Landeshauptstadt", 288850, "65183", 8.239138, 50.081698],
	["09162000", "61", "München, Landeshauptstadt", 1505005, "80313", 11.575997, 48.137683],
	["09184119", "63", "Garching b.München, St", 17656, "85748", 11.65188, 48.249173],
	["09184148", "64", "Unterhaching", 26507, "82008", 11.617404, 48.065859],
	["10041100", "63", "Saarbrücken, Landeshauptstadt", 182971, "66111", 6.995542, 49.236608],
	["11000000", "61", "Berlin, Stadt", 3685265, "10178", 13.405538, 52.51767],
	["12054000", "61", "Potsdam, Stadt", 184754, "14469", 13.05358, 52.400355],
	["12063036", "64", "Brieselang", 13187, "14656", 12.997668, 52.581603],
	["16051000", "61", "Erfurt, Stadt", 218793, "99084", 11.027236, 50.977122],
	["16053000", "61", "Jena, Stadt", 109725, "07743", 11.591842, 50.93006],
	["16055000", "61", "Weimar, Stadt", 65954, "99423", 11.329741, 50.980761],
];

/** The departments of the fixture and their names, as the record description writes them. */
const DEPARTMENTS: [string, string][] = [
	["0100", "Innere Medizin"],
	["0300", "Kardiologie"],
	["1000", "Pädiatrie"],
	["1200", "Neonatologie"],
	["1300", "Kinderchirurgie"],
	["1500", "Allgemeine Chirurgie"],
	["2300", "Orthopädie"],
	["2400", "Frauenheilkunde und Geburtshilfe"],
	["2500", "Geburtshilfe"],
	["2800", "Neurologie"],
	["2900", "Allgemeine Psychiatrie"],
	[
		"2960",
		"Allgemeine Psychiatrie/Tagesklinik (für teilstationäre Pflegesätze) – keine vollstationären Betten",
	],
	["3100", "Psychosomatik/Psychotherapie"],
	["3600", "Intensivmedizin"],
	["3700", "Sonstige Fachabteilung"],
];

/** The departments of the clinics (the Deutsche Rentenversicherung's). */
const CLINIC_DEPARTMENTS: [string, string][] = [
	["0000", "Keine Zuordnung zu spezifischem Fachgebiet"],
	["0300", "Kardiologie"],
	["2300", "Orthopädie"],
	["3100", "Psychosomatik/Psychotherapie"],
	["8500", "Entwöhnungsbehandlungen"],
];

export type DeHospitalCase = {
	/** The directory's pseudonymous hospital id (the same for every site of a hospital). */
	hospitalId: string;
	land: string;
	kreis: string;
	gemeinde: string;
	name: string;
	site: string;
	street: string;
	number: string;
	postcode: string;
	town: string;
	phone: string;
	/** Trägerart `1`–`3`, Einrichtungstyp `1`–`5`, Stufe_Notfall `0`–`3`. */
	operator: string;
	type: string;
	emergency: string;
	/** Notfallmodul columns set to `1`, by suffix (`Schlaganfall`). */
	modules: string[];
	/** Departments with beds. */
	departments: string[];
};

export type DeClinicCase = {
	clinicId: string;
	land: string;
	kreis: string;
	gemeinde: string;
	name: string;
	street: string;
	number: string;
	postcode: string;
	town: string;
	phone: string;
	operator: string;
	type: string;
	departments: string[];
};

export type DeThuringiaCase = {
	/** The pharmacy's file at the Landesamt (`Az_VIS`). */
	file: string;
	name: string;
	note: string;
	town: string;
	postcode: string;
	street: string;
	number: string;
	kind: string;
	access: string;
	ags: string;
	lon: number;
	lat: number;
};

export type DeBrandenburgCase = {
	id: number;
	name: string;
	street: string;
	number: string;
	postcode: string;
	town: string;
	phone: string;
	lon: number;
	lat: number;
};

export type DeFixtureSet = {
	hospitals: DeHospitalCase[];
	clinics: DeClinicCase[];
	thuringia: DeThuringiaCase[];
	brandenburg: DeBrandenburgCase[];
	/** Reporting year of the directory (`KHV_2024`). */
	edition: number;
};

const hospital = (fields: Partial<DeHospitalCase> & Pick<DeHospitalCase, "hospitalId" | "name">) =>
	({
		land: "16",
		kreis: "051",
		gemeinde: "000",
		site: fields.name,
		street: "Beispielweg",
		number: "1",
		postcode: "99084",
		town: "Erfurt",
		phone: "",
		operator: "1",
		type: "2",
		emergency: "0",
		modules: [],
		departments: ["0100"],
		...fields,
	}) satisfies DeHospitalCase;

/** The named hospital sites the tests and the end-to-end specs look for. */
export const DE_NAMED_HOSPITALS: DeHospitalCase[] = [
	// Two sites of one university hospital in Berlin, filed under Berlin's districts.
	hospital({
		hospitalId: "9001",
		land: "11",
		kreis: "001",
		gemeinde: "001",
		name: "Universitätsklinikum Beispielstadt",
		site: "Campus Nord – Stationäre Behandlung",
		street: "Musterallee",
		number: "1",
		postcode: "10117",
		town: "Berlin",
		phone: "030 99990-0",
		type: "1",
		emergency: "3",
		modules: ["Schwerverletzte", "Kinder", "Schlaganfall", "Durchblutung_Herz"],
		departments: ["0100", "1500", "2400", "2800", "1000", "3600"],
	}),
	hospital({
		hospitalId: "9001",
		land: "11",
		kreis: "006",
		gemeinde: "006",
		name: "Universitätsklinikum Beispielstadt",
		site: "Campus Süd - Stationäre Behandlung",
		street: "Probestraße",
		number: "20–24",
		postcode: "12203",
		town: "Berlin",
		phone: "030 99990-0",
		type: "1",
		emergency: "2",
		departments: ["0100", "1500", "3600"],
	}),
	// A psychiatric day clinic: no department with beds, told by its name.
	hospital({
		hospitalId: "9002",
		land: "11",
		kreis: "002",
		gemeinde: "002",
		name: "Muster-Tagesklinik für Psychiatrie und Psychotherapie gGmbH",
		site: "Muster-Tagesklinik für Psychiatrie und Psychotherapie gGmbH",
		street: "Fiktivstraße",
		number: "5",
		postcode: "10245",
		town: "Berlin",
		phone: "030 99991-0",
		operator: "2",
		departments: [],
	}),
	// A children's hospital, filed under one of Hamburg's districts.
	hospital({
		hospitalId: "9003",
		land: "02",
		kreis: "402",
		gemeinde: "403",
		name: "Kinderkrankenhaus Musterhafen",
		site: "Hauptstandort – Stationäre Behandlung",
		street: "Hafenweg",
		number: "7",
		postcode: "20251",
		town: "Hamburg",
		phone: "040 99992-0",
		operator: "2",
		emergency: "1",
		modules: ["Kinder"],
		departments: ["1000", "1200", "1300"],
	}),
	// Two hospitals at one address in München: two pages.
	hospital({
		hospitalId: "9004",
		land: "09",
		kreis: "162",
		gemeinde: "000",
		name: "Fiktivklinik München GmbH",
		site: "Hauptstandort – Stationäre Behandlung",
		street: "Beispielplatz",
		number: "1",
		postcode: "80331",
		town: "München",
		phone: "089 99993-0",
		operator: "3",
		emergency: "2",
		modules: ["Schlaganfall"],
		departments: ["0100", "0300", "1500", "2800"],
	}),
	hospital({
		hospitalId: "9005",
		land: "09",
		kreis: "162",
		gemeinde: "000",
		name: "Fiktivklinik München Privatklinik",
		site: "Fiktivklinik München Privatklinik",
		street: "Beispielplatz",
		number: "1",
		postcode: "80331",
		town: "München",
		phone: "089 99993-500",
		operator: "3",
		type: "4",
		departments: ["0100"],
	}),
	hospital({
		hospitalId: "9006",
		land: "09",
		kreis: "184",
		gemeinde: "148",
		name: "Kreisklinik Probehausen",
		site: "Kreisklinik Probehausen – Stationäre Behandlung",
		street: "Klinikweg",
		number: "3",
		postcode: "82008",
		town: "Unterhaching",
		phone: "089 99994-0",
		emergency: "1",
		departments: ["0100", "1500"],
	}),
	hospital({
		hospitalId: "9007",
		land: "01",
		kreis: "001",
		gemeinde: "000",
		name: "Probe-Krankenhaus Flensburg gGmbH",
		site: "Probe-Krankenhaus Flensburg gGmbH - Stationäre Behandlung",
		street: "Fördeweg",
		number: "2",
		postcode: "24939",
		town: "Flensburg",
		phone: "0461 99995-0",
		operator: "2",
		emergency: "1",
		departments: ["0100", "1500", "2400"],
	}),
	hospital({
		hospitalId: "9008",
		name: "Klinikum Beispiel Erfurt",
		site: "Hauptstandort",
		street: "Musterring",
		number: "10",
		postcode: "99089",
		town: "Erfurt",
		phone: "0361 99996-0",
		emergency: "2",
		departments: ["0100", "2400", "2500", "1500"],
	}),
	// A site filed under the Land of its hospital's seat: placed by its town's name.
	hospital({
		hospitalId: "9009",
		land: "07",
		kreis: "414",
		gemeinde: "000",
		name: "Fiktiv-Klinikum Wiesbaden",
		site: "Standort Wiesbaden – Stationäre Behandlung",
		street: "Kurparkweg",
		number: "9",
		postcode: "65189",
		town: "Wiesbaden",
		phone: "0611 99997-0",
		type: "1",
		departments: ["0100", "2800"],
	}),
];

/** Rows that cannot be read: quarantined. */
const UNREADABLE_HOSPITALS: DeHospitalCase[] = [
	hospital({ hospitalId: "9098", name: "", site: "" }),
	hospital({ hospitalId: "9099", land: "17", name: "Klinik Ungültig", site: "Klinik Ungültig" }),
];

/** Filler hospital sites, so the directory clears the import's floors. */
function fillerHospitals(count: number): DeHospitalCase[] {
	const places = [
		{ land: "09", kreis: "184", gemeinde: "119", postcode: "85748", town: "Garching b.München" },
		{ land: "16", kreis: "053", gemeinde: "000", postcode: "07743", town: "Jena" },
		{ land: "12", kreis: "054", gemeinde: "000", postcode: "14469", town: "Potsdam" },
	];
	return Array.from({ length: count }, (_, index) => {
		const place = places[index % places.length] ?? places[0];
		const number = String(index + 1).padStart(3, "0");
		return hospital({
			hospitalId: String(9100 + index),
			...place,
			name: `Fiktivklinik Probe ${number}`,
			site: `Fiktivklinik Probe ${number} – Stationäre Behandlung`,
			street: "Probeweg",
			number: String(index + 1),
			phone: `0800 99${String(100_000 + index)}`,
			departments: index % 5 === 0 ? ["2900"] : ["0100", "1500"],
		});
	});
}

const clinic = (fields: Partial<DeClinicCase> & Pick<DeClinicCase, "clinicId" | "name">) =>
	({
		land: "09",
		kreis: "184",
		gemeinde: "119",
		street: "Kurweg",
		number: "1",
		postcode: "85748",
		town: "Garching b.München",
		phone: "",
		operator: "3",
		type: "6",
		departments: ["2300"],
		...fields,
	}) satisfies DeClinicCase;

/** The named clinics: one with its own number, four of a chain sharing their operator's. */
export const DE_NAMED_CLINICS: DeClinicCase[] = [
	clinic({
		clinicId: "9201",
		name: "Rehaklinik Fiktivia GmbH",
		street: "Isarauen",
		number: "12",
		phone: "089 99998-0",
		departments: ["2300", "0300"],
	}),
	...(
		[
			["9202", "12", "054", "000", "Potsdam", "14469"],
			["9203", "16", "055", "000", "Weimar", "99423"],
			["9204", "16", "053", "000", "Jena", "07743"],
			["9205", "16", "051", "000", "Erfurt", "99084"],
		] as const
	).map(([clinicId, land, kreis, gemeinde, town, postcode], index) =>
		clinic({
			clinicId,
			land,
			kreis,
			gemeinde,
			town,
			postcode,
			name: `Musterkur Klinik ${["Nord", "West", "Süd", "Ost"][index]}`,
			street: "Kurpark",
			number: String(index + 1),
			phone: "0800 9999999",
			type: "7",
			departments: ["3100", "8500"],
		}),
	),
];

function fillerClinics(count: number): DeClinicCase[] {
	return Array.from({ length: count }, (_, index) => {
		const number = String(index + 1).padStart(3, "0");
		return clinic({
			clinicId: String(9300 + index),
			land: index % 2 === 0 ? "16" : "09",
			kreis: index % 2 === 0 ? "055" : "184",
			gemeinde: index % 2 === 0 ? "000" : "119",
			postcode: index % 2 === 0 ? "99423" : "85748",
			town: index % 2 === 0 ? "Weimar" : "Garching b.München",
			name: `Reha-Probe ${number}`,
			street: "Reha-Allee",
			number: String(index + 1),
			phone: `0800 98${String(100_000 + index)}`,
			departments: index % 3 === 0 ? ["0000"] : ["2300"],
		});
	});
}

/** Thuringia's named pharmacies, near their towns' centres. */
export const DE_NAMED_THURINGIA: DeThuringiaCase[] = [
	{
		file: "5040-24-2484/9001",
		name: "Beispiel-Apotheke",
		note: "",
		town: "Erfurt",
		postcode: "99084",
		street: "Musterstraße",
		number: "3",
		kind: "Hauptgeschäft",
		access: "barrierefrei",
		ags: "16051000",
		lon: 11.0301,
		lat: 50.9781,
	},
	{
		file: "5040-24-2484/9002",
		name: "Muster-Apotheke",
		note: "am Markt",
		town: "Weimar",
		postcode: "99423",
		street: "Marktplatz",
		number: "4",
		kind: "Hauptgeschäft",
		access: "barrierefrei mit Einschränkung *Rampe *Klingel",
		ags: "16055000",
		lon: 11.3301,
		lat: 50.9801,
	},
	{
		file: "5040-24-2484/9003",
		name: "Probe-Apotheke im Zentrum",
		note: "Center-Apotheke (OHG)",
		town: "Jena",
		postcode: "07743",
		street: "Fiktivgasse",
		number: "8a",
		kind: "Filiale",
		access: "barrierefrei",
		ags: "16053000",
		lon: 11.5901,
		lat: 50.9301,
	},
];

function fillerThuringia(count: number): DeThuringiaCase[] {
	return Array.from({ length: count }, (_, index) => ({
		file: `5040-24-2484/${9100 + index}`,
		name: `Probe-Apotheke ${String(index + 1).padStart(3, "0")}`,
		note: "",
		town: index % 2 === 0 ? "Jena" : "Weimar",
		postcode: index % 2 === 0 ? "07743" : "99423",
		street: "Apothekenweg",
		number: String(index + 1),
		kind: index % 4 === 0 ? "Filiale" : "Hauptgeschäft",
		access: "barrierefrei",
		ags: index % 2 === 0 ? "16053000" : "16055000",
		lon: (index % 2 === 0 ? 11.5918 : 11.3297) + (index % 10) * 0.001,
		lat: (index % 2 === 0 ? 50.93 : 50.9807) + Math.floor(index / 10) * 0.001,
	}));
}

/** Brandenburg's named pharmacies, and a hospital's pharmacy the import leaves out. */
export const DE_NAMED_BRANDENBURG: DeBrandenburgCase[] = [
	{
		id: 1,
		name: "Fiktiv-Apotheke am Park",
		street: "Parkstraße",
		number: "2",
		postcode: "14469",
		town: "Potsdam",
		phone: "0331/9999901",
		lon: 13.0541,
		lat: 52.4011,
	},
	{
		id: 3,
		name: "Beispiel-Apotheke Brieselang",
		street: "Dorfstraße",
		number: "11",
		postcode: "14656",
		town: "Brieselang (OT Zeestow)",
		phone: "033232/99999",
		lon: 12.9981,
		lat: 52.5821,
	},
	{
		id: 5,
		name: "Klinikum Fiktivstadt GmbH",
		street: "Klinikstraße",
		number: "1",
		postcode: "14469",
		town: "Potsdam",
		phone: "0331/9999902",
		lon: 13.0561,
		lat: 52.4031,
	},
];

function fillerBrandenburg(count: number): DeBrandenburgCase[] {
	return Array.from({ length: count }, (_, index) => ({
		id: 100 + index * 2,
		name: `Muster-Apotheke ${String(index + 1).padStart(3, "0")}`,
		street: "Apothekenring",
		number: String(index + 1),
		postcode: "14469",
		town: "Potsdam",
		phone: `0331/97${String(10_000 + index)}`,
		lon: 13.0535 + (index % 10) * 0.001,
		lat: 52.4003 + Math.floor(index / 10) * 0.001,
	}));
}

export const DE_FACILITIES: DeFixtureSet = {
	hospitals: [...DE_NAMED_HOSPITALS, ...UNREADABLE_HOSPITALS, ...fillerHospitals(210)],
	clinics: [...DE_NAMED_CLINICS, ...fillerClinics(100)],
	thuringia: [...DE_NAMED_THURINGIA, ...fillerThuringia(60)],
	brandenburg: [...DE_NAMED_BRANDENBURG, ...fillerBrandenburg(60)],
	edition: 2024,
};

/**
 * The same set with every filler facility's phone number changed (a number is no part of a
 * facility's key): more than 10% of the pages change.
 */
export function withFillerPhones(set: DeFixtureSet, prefix: string): DeFixtureSet {
	return {
		...set,
		hospitals: set.hospitals.map((row, index) =>
			row.name.startsWith("Fiktivklinik Probe")
				? { ...row, phone: `${prefix} ${String(100_000 + index)}` }
				: row,
		),
		clinics: set.clinics.map((row, index) =>
			row.name.startsWith("Reha-Probe")
				? { ...row, phone: `${prefix} ${String(200_000 + index)}` }
				: row,
		),
	};
}

const HOSPITAL_MODULES = [
	"Schwerverletzte",
	"Kinder",
	"Spezial",
	"Schlaganfall",
	"Durchblutung_Herz",
];

/** The directory's workbook. */
export function directoryWorkbook(set: DeFixtureSet): Buffer {
	const year = set.edition;
	const khvHeader = [
		"KH_ID_Pseudo",
		"Land",
		"Gemeinde",
		"Kreis",
		"KH_Name",
		"Standortname",
		"Straße",
		"Hausnummer",
		"PLZ",
		"Ort",
		"Telefon",
		"E_Mail",
		"Internet",
		"Trägerart",
		"Trägername",
		"Einrichtungstyp",
		"Stufe_Notfall",
		...HOSPITAL_MODULES.map((module) => `Notfallmodul_${module}`),
		"Betten",
		...DEPARTMENTS.map(([code]) => `FA_${code}`),
	];
	const khvRows = set.hospitals.map((row) => [
		row.hospitalId,
		row.land,
		row.gemeinde,
		row.kreis,
		row.name,
		row.site,
		row.street,
		row.number,
		row.postcode,
		row.town,
		row.phone,
		`kontakt-${row.hospitalId}@example.test`,
		`www.example.test/klinik-${row.hospitalId}`,
		row.operator,
		`Fiktiv-Trägergesellschaft ${row.hospitalId} mbH`,
		row.type,
		row.emergency,
		...HOSPITAL_MODULES.map((module) => (row.modules.includes(module) ? "1" : "2")),
		String(row.departments.length * 40),
		...DEPARTMENTS.map(([code]) => (row.departments.includes(code) ? "40" : "")),
	]);
	const rhvHeader = [
		"RH_ID_Pseudo",
		"Land",
		"Gemeinde",
		"Kreis",
		"RH_Name",
		"Straße",
		"Hausnummer",
		"PLZ",
		"Ort",
		"Telefon",
		"E_Mail",
		"Internet",
		"Trägerart",
		"Trägername",
		"Einrichtungstyp",
		"Betten",
		...CLINIC_DEPARTMENTS.map(([code]) => `FA_${code}`),
	];
	const rhvRows = set.clinics.map((row) => [
		row.clinicId,
		row.land,
		row.gemeinde,
		row.kreis,
		row.name,
		row.street,
		row.number,
		row.postcode,
		row.town,
		row.phone,
		`reha-${row.clinicId}@example.test`,
		`www.example.test/reha-${row.clinicId}`,
		row.operator,
		`Fiktiv-Rehaträger ${row.clinicId} GmbH`,
		row.type,
		"80",
		...CLINIC_DEPARTMENTS.map(([code]) => (row.departments.includes(code) ? "80" : "")),
	]);
	const description = (title: string, departments: [string, string][]) => [
		["Zurück zum Inhalt", ""],
		[title],
		["Feldbezeichnung", "Inhalt"],
		["Land", "Land"],
		["Trägerart", "Art des Trägers "],
		["", "1 = öffentlicher Träger"],
		...departments.map(([code, label]) => [`FA_${code}`, label]),
	];
	return writeXlsxSheets(
		[
			{ name: "Titelblatt", rows: [["Verzeichnis der Krankenhäuser (SYNTHETISCHE TESTDATEN)"]] },
			{
				name: ` KHV_${year}`,
				rows: [
					["Zurück zum Inhalt", ""],
					[`Verzeichnis der Krankenhäuser (KHV_${year})`],
					khvHeader,
					...khvRows,
					[],
					["", "", "", "", ""],
				],
			},
			{
				name: `RHV_${year}`,
				rows: [
					["Zurück zum Inhalt"],
					[`Verzeichnis der Vorsorge- oder Rehabilitationseinrichtungen (RHV_${year})`],
					rhvHeader,
					...rhvRows,
				],
			},
			{
				name: `DSB_KHV_${year}`,
				rows: description(`Datensatzbeschreibung (KHV_${year})`, DEPARTMENTS),
			},
			{
				name: `DSB_RHV_${year}`,
				rows: description(`Datensatzbeschreibung (RHV_${year})`, CLINIC_DEPARTMENTS),
			},
		],
		{ deflate: true },
	);
}

/** Longitude and latitude to UTM zone 32 (Newton's method over the inverse): fixtures only. */
function toUtm32(longitude: number, latitude: number): { x: number; y: number } {
	let x = 500_000 + (longitude - 9) * 70_000;
	let y = latitude * 111_000;
	for (let step = 0; step < 30; step++) {
		const here = utmToLonLat(x, y, 32);
		const dx = utmToLonLat(x + 1, y, 32);
		const dy = utmToLonLat(x, y + 1, 32);
		const a = dx.longitude - here.longitude;
		const b = dy.longitude - here.longitude;
		const c = dx.latitude - here.latitude;
		const d = dy.latitude - here.latitude;
		const ex = longitude - here.longitude;
		const ey = latitude - here.latitude;
		const det = a * d - b * c;
		x += (d * ex - b * ey) / det;
		y += (a * ey - c * ex) / det;
	}
	return { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 };
}

/** Thuringia's shapefile, zipped with its projection and code page. */
export function thuringiaArchive(rows: readonly DeThuringiaCase[]): Buffer {
	const fields = [
		{ name: "Apotheke", type: "C", length: 254 },
		{ name: "Ort", type: "C", length: 254 },
		{ name: "Ortsteil", type: "C", length: 30 },
		{ name: "PLZ", type: "C", length: 5 },
		{ name: "Strasse", type: "C", length: 100 },
		{ name: "HNr", type: "C", length: 254 },
		{ name: "Typ", type: "C", length: 20 },
		{ name: "Barrierefr", type: "C", length: 254 },
		{ name: "Bemerkung", type: "C", length: 40 },
		{ name: "AGS", type: "C", length: 10 },
		{ name: "Az_VIS", type: "C", length: 100 },
	];
	const records = rows.map((row) => ({
		Apotheke: row.name,
		Ort: row.town,
		Ortsteil: "",
		PLZ: row.postcode,
		Strasse: row.street,
		HNr: row.number,
		Typ: row.kind,
		Barrierefr: row.access,
		Bemerkung: row.note,
		AGS: row.ags,
		Az_VIS: row.file,
	}));
	const text = (name: string, value: string) => ({ name, data: Buffer.from(value, "utf8") });
	return writeStoredZip(
		[
			{ name: "apotheke_th.dbf", data: writeDbf(fields, records) },
			{
				name: "apotheke_th.shp",
				data: writeShpPoints(rows.map((row) => toUtm32(row.lon, row.lat))),
			},
			text("apotheke_th.cpg", "UTF-8"),
			text(
				"apotheke_th.prj",
				'PROJCS["ETRS_1989_UTM_Zone_32N",GEOGCS["GCS_ETRS_1989",DATUM["D_ETRS_1989",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",9.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]',
			),
		],
		{ deflate: true },
	);
}

/** Brandenburg's GeoJSON, as the OGC API Features bulk download writes it. */
export function brandenburgCollection(rows: readonly DeBrandenburgCase[]): object {
	return {
		type: "FeatureCollection",
		numberMatched: rows.length,
		numberReturned: rows.length,
		features: rows.map((row) => ({
			type: "Feature",
			id: `apotheken_${row.id}`,
			geometry: { type: "Point", coordinates: [row.lon, row.lat] },
			properties: {
				ap_name: row.name,
				strasse: row.street,
				hausnummer: row.number,
				plz: row.postcode,
				gemeinde: row.town,
				telefon: row.phone,
			},
		})),
	};
}

/** The municipalities' directory of the fixture, in GV-ISys's layout. */
export function municipalitiesWorkbook(): Buffer {
	const decimal = (value: number) => String(value).replace(".", ",");
	const rows: string[][] = [
		[
			"Gemeinden in Deutschland nach Fläche, Bevölkerung und Postleitzahl am 31.12.2025 (4. Quartal)",
		],
		[],
		[
			"Satzart",
			"Textkennzeichen",
			"Amtlicher Regionalschlüssel (ARS)",
			"",
			"",
			"",
			"",
			"Gemeindename",
			"Fläche km2 1)",
			"Bevölkerung auf Grundlage des Zensus 20222)",
			"",
			"",
			"",
			"Postleitzahl3)",
			"Geografische Mittelpunktkoordinaten",
		],
		[
			"",
			"",
			"Land",
			"RB",
			"Kreis",
			"VB",
			"Gem",
			"",
			"",
			"insgesamt",
			"männlich",
			"weiblich",
			"je km2",
			"",
			"Längengrad",
			"Breitengrad",
		],
		["", "", "Gebietsstand am 31.12.2025 (4. Quartal)"],
		[],
	];
	for (const [state, name] of DE_STATES_GV) {
		rows.push(["10", "", state, "", "", "", "", name]);
		for (const [code, subtype, districtName] of DE_DISTRICTS_GV) {
			if (!code.startsWith(state)) continue;
			rows.push(["40", subtype, state, code.slice(2, 3), code.slice(3, 5), "", "", districtName]);
			rows.push(["50", "50", state, code.slice(2, 3), code.slice(3, 5), "0000", "", districtName]);
			for (const [
				ags,
				kind,
				municipality,
				population,
				postcode,
				lon,
				lat,
			] of DE_MUNICIPALITIES_GV) {
				if (!ags.startsWith(code)) continue;
				rows.push([
					"60",
					kind,
					state,
					code.slice(2, 3),
					code.slice(3, 5),
					"0000",
					ags.slice(5),
					municipality,
					"10.00",
					String(population),
					"",
					"",
					"",
					postcode,
					decimal(lon),
					decimal(lat),
				]);
			}
		}
	}
	// An uninhabited area outside any Gemeinde: left out.
	rows.push([
		"60",
		"66",
		"09",
		"1",
		"84",
		"0000",
		"999",
		"Forst Fiktiv, gemfr. Gebiet",
		"5.00",
		"",
		"",
		"",
		"",
		"",
		"11,7",
		"48,1",
	]);
	rows.push([], ["Quelle: Gemeindeverzeichnis-Informationssytem GV-ISys (SYNTHETISCHER AUSZUG)"]);
	return writeXlsxSheets(
		[
			{
				name: "Inhalt",
				rows: [["Gemeindeverzeichnis"], ["Gebietsstand: 31.12.2025 (4. Quartal)"]],
			},
			{ name: "Onlineprodukt_Gemeinden31122025", rows },
		],
		{ deflate: true },
	);
}

export function writeDeFixtures(dir: string, set: DeFixtureSet = DE_FACILITIES) {
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "krankenhausverzeichnis.xlsx"), directoryWorkbook(set));
	writeFileSync(join(dir, "apotheke_th.zip"), thuringiaArchive(set.thuringia));
	// Formatted as Biome formats JSON: a point's coordinates on one line.
	const geojson = JSON.stringify(brandenburgCollection(set.brandenburg), null, "\t").replace(
		/\[\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]/g,
		"[$1, $2]",
	);
	writeFileSync(join(dir, "apotheken_bb.json"), `${geojson}\n`);
	writeFileSync(join(dir, "gemeindeverzeichnis.xlsx"), municipalitiesWorkbook());
}

if (import.meta.main) {
	writeDeFixtures(DE_FIXTURES);
	console.log(`Wrote the synthetic German fixtures to ${DE_FIXTURES}`);
}
