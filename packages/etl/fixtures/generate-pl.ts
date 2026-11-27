/**
 * Generates the SYNTHETIC fixtures in `fixtures/pl/`: a ZIP in the exact format of RPWDL's export
 * of healthcare entities (`podmioty.csv`, `zaklady.csv`, `jednostki.csv`, `komorki.csv` with
 * their real columns, semicolon-separated and quoted, `NULL` for an empty value, and `Info.txt`),
 * a small TERC file (the official CSV of TERYT) and a small PRG archive (the gminas' boundaries
 * as a polygon shapefile), filled with fictitious establishments.
 *
 * Every establishment is made up: names are made-up words (Przykład, Wzorzec, Próbka, Fikcja…),
 * the sole traders some establishments are named after are invented (`Anna Przykładowa`),
 * streets do not exist, establishment ids start at 900001 (the real register's are below
 * 500000), tax and statistical numbers start with 99 and e-mail addresses end in
 * `example.invalid`, so the tests can check they are never stored. Never commit real rows. Run
 * with `bun run --cwd packages/etl fixtures:pl`.
 *
 * The voivodeships, powiats and gminas are real public TERYT names and codes, a small subset;
 * their boundaries are made-up squares (a rural gmina surrounds the town of the same name, as
 * many do).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeDbf, writeShpPolygons } from "../src/lib/shapefile";
import { writeStoredZip } from "../src/lib/zip";

export const PL_FIXTURES = join(import.meta.dirname, "pl");

/** TERC rows: WOJ, POW, GMI, RODZ, NAZWA, NAZWA_DOD. */
export const PL_TERC: [string, string, string, string, string, string][] = [
	["02", "", "", "", "DOLNOŚLĄSKIE", "województwo"],
	["02", "01", "", "", "bolesławiecki", "powiat"],
	["02", "01", "01", "1", "Bolesławiec", "gmina miejska"],
	["02", "01", "02", "2", "Bolesławiec", "gmina wiejska"],
	["02", "01", "03", "2", "Gromadka", "gmina wiejska"],
	["02", "62", "", "", "Legnica", "miasto na prawach powiatu"],
	["02", "62", "01", "1", "Legnica", "gmina miejska"],
	["12", "", "", "", "MAŁOPOLSKIE", "województwo"],
	["12", "06", "", "", "krakowski", "powiat"],
	["12", "06", "02", "2", "Czernichów", "gmina wiejska"],
	["12", "06", "11", "3", "Skawina", "gmina miejsko-wiejska"],
	["12", "06", "11", "4", "Skawina", "miasto"],
	["12", "06", "11", "5", "Skawina", "obszar wiejski"],
	["12", "61", "", "", "Kraków", "miasto na prawach powiatu"],
	["12", "61", "01", "1", "Kraków", "gmina miejska"],
	["12", "61", "02", "9", "Kraków-Krowodrza", "delegatura"],
	["14", "", "", "", "MAZOWIECKIE", "województwo"],
	["14", "65", "", "", "Warszawa", "miasto stołeczne, na prawach powiatu"],
	["14", "65", "01", "1", "Warszawa", "gmina miejska, miasto stołeczne"],
	["14", "65", "02", "8", "Bemowo", "dzielnica"],
];

/** The made-up boundary of each gmina: a square around a point (lng, lat), half-side in degrees. */
export const PL_GMINA_SQUARES: Record<string, [number, number, number]> = {
	"0201011": [15.56, 51.26, 0.03],
	"0201022": [15.56, 51.26, 0.12],
	"0201032": [15.4, 51.38, 0.08],
	"0262011": [16.16, 51.21, 0.05],
	"1206022": [19.68, 50.03, 0.06],
	"1206113": [19.83, 49.97, 0.06],
	"1261011": [19.94, 50.06, 0.1],
	"1465011": [21.01, 52.23, 0.12],
};

const ENTITY_HEADER = [
	"ID Księgi",
	"NIP",
	"REGON",
	"Numer księgi rejestrowej",
	"Data wykreślenia z rejestru",
	"Data wydania decyzji o wykreśleniu z rejestru",
	"Data zmiany wpisu do rejestru",
	"Numer decyzji",
	"Typ organu",
	"Kod organu",
	"Forma organizacyjno-prawna",
	"Forma organizacyjno-prawna opis",
	"Nazwa",
	"Nazwa podmiotu",
	"Teryt",
	"Teryt opis",
	"Ulica",
	"Budynek",
	"Lokal",
	"Kod pocztowy",
	"Miejscowość",
	"Telefon",
	"Email",
	"Strona WWW",
	"Kod SIMC",
	"Kod ulicy",
	"Kod podmiotu tworzącego",
	"Nazwa podmiotu tworzącego",
	"Data rozpoczęcia działalności",
	"Data rozp. dział. art. 104",
	"Data zakończenia działalności",
	"Początek okresu zawieszenia",
	"Koniec okresu zawieszenia",
];

const ESTABLISHMENT_HEADER = [
	"ID Księgi",
	"ID ZOZ",
	"Regon",
	"Rodzaj działalności",
	"Nazwa",
	"Teryt",
	"Teryt opis",
	"Ulica",
	"Budynek",
	"Lokal",
	"Kod pocztowy",
	"Miejscowość",
	"Telefon",
	"Email",
	"Strona WWW",
	"Kod SIMC",
	"Kod ulicy",
	"Data rozpoczęcia działalności",
	"Data zakończenia działalności",
];

const ADDRESS_HEADER = [
	"Teryt",
	"Teryt opis",
	"Ulica",
	"Budynek",
	"Lokal",
	"Kodpocztowy",
	"Miejscowość",
	"Telefon",
	"Email",
	"Strona WWW",
	"Kod SIMC",
	"Kod ulicy",
];

const UNIT_HEADER = [
	"ID Księgi",
	"ID ZOZ",
	"ID Jednostki",
	"Regon",
	"Kod jednostki",
	"Nazwa",
	...ADDRESS_HEADER,
	"Data rozpoczęcia działalności JO",
	"Data zakończenia działalności JO",
	"Początek okresu zawieszenia",
	"Koniec okresu zawieszenia",
];

const BEDS = [
	"Liczba łóżek ogółem",
	"Liczba łóżek intensywnej opieki medycznej",
	"Liczba łóżek intensywnego nadzoru kardiologicznego",
	"Liczba łóżek dla noworodków",
	"Liczba inkubatorów",
	"Liczba łóżek intensywnej terapii",
	"Liczba łóżek intensywnej opieki oparzeń",
	"Liczba łóżek intensywnej opieki toksykologicznej",
	"Liczba łóżek intensywnej terapii noworodka",
	"Liczba łóżek opieki ciągłej dla noworodków po sztucznej wentylacji",
	"Liczba łóżek opieki pośredniej dla noworodków niewymagających wsparcia oddechowego",
	"Liczba łóżek nieinwazyjnej wentylacji mechanicznej",
	"Liczba stanowisk dializacyjnych",
	"Liczba miejsc pobytu dziennego",
];

const CELL_HEADER = [
	"ID Księgi",
	"ID ZOZ",
	"ID Jednostki",
	"ID Komórki",
	"Regon",
	"Kod jednostki",
	"Kod komórki",
	"Specjalność komórki",
	"kodResortVIII",
	"Nazwa komórki",
	...ADDRESS_HEADER.map((name) => (name === "Kodpocztowy" ? "Kod pocztowy" : name)),
	...BEDS,
	"Data rozpoczęcia działalności komórki",
	"Data zakończenia działalności komórki",
	"Początek okresu zawieszenia",
	"Koniec okresu zawieszenia",
];

/** The labels of the part VIII codes the fixtures use, as the ministry's dictionary names them. */
const CELL_LABELS: Record<string, string> = {
	"0010": "Poradnia (gabinet) lekarza podstawowej opieki zdrowotnej",
	"0032": "Poradnia (gabinet) pielęgniarki podstawowej opieki zdrowotnej",
	"0040": "Gabinet profilaktyki zdrowotnej i pomocy przedlekarskiej",
	"1100": "Poradnia kardiologiczna",
	"1200": "Poradnia dermatologiczna",
	"1220": "Poradnia neurologiczna",
	"1800": "Poradnia stomatologiczna",
	"2184": "Hospicjum stacjonarne / Stacjonarny ośrodek opieki paliatywnej",
	"4000": "Oddział chorób wewnętrznych",
	"4500": "Oddział chirurgiczny ogólny",
	"4902": "Szpitalny oddział ratunkowy",
	"7110": "Punkt pobrań materiałów do badań",
	"9450": "Gabinet diagnostyczno-zabiegowy",
};

export type PlEntity = {
	book: string;
	form: string;
	formLabel: string;
	name: string;
	ended?: string;
};

export type PlAddress = {
	teryt: string;
	street: string | null;
	building: string;
	postcode: string;
	city: string;
	phone: string | null;
	simc?: string;
};

export type PlCase = {
	id: number;
	book: string;
	kind: string;
	name: string;
	address: PlAddress;
	ended?: string;
	/** Units with their cells (part VIII codes and beds); the first unit at `address` by default. */
	units: { name?: string; address?: PlAddress; cells: [string, number][] }[];
};

export type PlFixtureSet = {
	entities: PlEntity[];
	cases: PlCase[];
	/** Added to every filler's street, to change many pages at once (circuit breaker tests). */
	fillerStreetSuffix?: string;
	/** The date `Info.txt` gives the report. */
	producedAt?: string;
};

const SOLE = "działalność gospodarcza prowadzona przez osobę fizyczną";

const ENTITIES: PlEntity[] = [
	{
		book: "990001",
		form: "0100",
		formLabel: "samodzielny publiczny zakład opieki zdrowotnej",
		name: "SZPITAL PRZYKŁADOWY SAMODZIELNY PUBLICZNY ZAKŁAD OPIEKI ZDROWOTNEJ",
	},
	{ book: "990002", form: "0700", formLabel: SOLE, name: "Anna Przykładowa" },
	{
		book: "990003",
		form: "1300",
		formLabel: "spółka z ograniczoną odpowiedzialnością",
		name: "WZORZEC MEDYCZNY SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ",
	},
	{ book: "990004", form: "0700", formLabel: SOLE, name: "Jan Próbkowy" },
	{
		book: "990005",
		form: "1300",
		formLabel: "spółka z ograniczoną odpowiedzialnością",
		name: "LABORATORIUM FIKCJA SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ",
	},
	{
		book: "990006",
		form: "1300",
		formLabel: "spółka z ograniczoną odpowiedzialnością",
		name: "PRZYKŁAD DENTAL SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ",
	},
	{
		book: "990007",
		form: "0700",
		formLabel: SOLE,
		name: "Zamknięty Przykład",
		ended: "2026-10-01",
	},
];

const at = (
	teryt: string,
	city: string,
	street: string | null,
	building: string,
	postcode: string,
	phone: string | null = null,
): PlAddress => ({ teryt, street, building, postcode, city, phone });

/** The named cases the tests check; the fillers follow (`fillers`). */
export const PL_CASES: PlCase[] = [
	{
		// A public hospital in Warsaw; its unit's address is in a district of the city.
		id: 900001,
		book: "990001",
		kind: "1",
		name: "Szpital Przykładowy",
		address: at("1465011", "Warszawa", "Przykładowa", "1", "00-950", "22 123 45 67"),
		units: [
			{
				address: at("1465028", "Warszawa", "Przykładowa", "1", "00-950", "22 123 45 67"),
				cells: [
					["4000", 30],
					["4500", 20],
					["4902", 0],
				],
			},
		],
	},
	{
		// A sole trader's dental clinic, named after her: the name is taken out.
		id: 900002,
		book: "990002",
		kind: "3",
		name: "Gabinet Stomatologiczny lek. stom. Anna Przykładowa",
		address: at("1261011", "Kraków", "Wzorcowa", "3", "31-001", "12 345 67 89"),
		units: [{ cells: [["1800", 0]] }],
	},
	{
		// A company's cardiology clinic in the town of an urban-rural gmina.
		id: 900003,
		book: "990003",
		kind: "3",
		name: "Poradnia Kardiologiczna Wzorzec",
		address: at("1206114", "Skawina", "Próbna", "5", "32-050", "12 276 00 01"),
		units: [
			{
				cells: [
					["1100", 0],
					["9450", 0],
				],
			},
		],
	},
	{
		// A primary care clinic of two places in a rural gmina named like its town.
		id: 900004,
		book: "990003",
		kind: "3",
		name: "Przychodnia Rodzinna Wzorzec",
		address: at("0201022", "Kruszyn", "Fikcyjna", "7", "59-700", "75 732 00 01"),
		units: [
			{
				cells: [
					["0010", 0],
					["0032", 0],
				],
			},
			{
				name: "Punkt Wzorzec w Bolesławcu",
				address: at("0201011", "Bolesławiec", "Zmyślona", "2", "59-700", "75 732 00 02"),
				cells: [["0010", 0]],
			},
		],
	},
	{
		// Objection test.
		id: 900005,
		book: "990003",
		kind: "3",
		name: "Przychodnia Sprzeciwu Wzorzec",
		address: at("0262011", "Legnica", "Przykładowa", "9", "59-220", "76 850 00 05"),
		units: [{ cells: [["0010", 0]] }],
	},
	{
		// Closed: never imported.
		id: 900006,
		book: "990003",
		kind: "3",
		name: "Przychodnia Zamknięta Wzorzec",
		ended: "2026-01-31",
		address: at("0262011", "Legnica", "Przykładowa", "11", "59-220"),
		units: [{ cells: [["0010", 0]] }],
	},
	{
		// School nurses only: left out.
		id: 900007,
		book: "990003",
		kind: "3",
		name: "Gabinet Szkolny Wzorzec",
		address: at("0262011", "Legnica", "Szkolna", "1", "59-220"),
		units: [{ cells: [["0040", 0]] }],
	},
	{
		// Three fields: a specialist clinic of many fields.
		id: 900008,
		book: "990003",
		kind: "3",
		name: "Centrum Specjalistyczne Wzorzec",
		address: at("1261011", "Kraków", "Wzorcowa", "8", "31-002", "12 345 00 08"),
		units: [
			{
				cells: [
					["1100", 0],
					["1200", 0],
					["1220", 0],
				],
			},
		],
	},
	{
		// A sole trader whose establishment's name is his own name only: named after its address.
		id: 900009,
		book: "990004",
		kind: "3",
		name: "Jan Próbkowy",
		address: at("1206022", "Czernichów", "Próbkowa", "4", "32-070", "12 270 00 09"),
		units: [{ cells: [["1800", 0]] }],
	},
	{
		// An inpatient hospice in a rural gmina.
		id: 900010,
		book: "990003",
		kind: "2",
		name: "Hospicjum Wzorzec",
		address: at("0201032", "Gromadka", "Cicha", "1", "59-706", "75 731 00 10"),
		units: [{ cells: [["2184", 12]] }],
	},
	// Four collection points of one laboratory sharing its call centre's number: not stored.
	...[11, 12, 13, 14].map(
		(n): PlCase => ({
			id: 900000 + n,
			book: "990005",
			kind: "3",
			name: `Punkt Pobrań Fikcja ${n}`,
			address: at("1261011", "Kraków", "Laboratoryjna", String(n), "31-003", "22 999 99 99"),
			units: [{ cells: [["7110", 0]] }],
		}),
	),
	{
		// Removal test: dropped from the register in later runs.
		id: 901001,
		book: "990003",
		kind: "3",
		name: "Przychodnia Znikająca Wzorzec",
		address: at("0262011", "Legnica", "Ulotna", "1", "59-220", "76 850 10 01"),
		units: [{ cells: [["0010", 0]] }],
	},
	{
		// An establishment of a closed entity: never imported.
		id: 901002,
		book: "990007",
		kind: "3",
		name: "Gabinet Zamknięty",
		address: at("0262011", "Legnica", "Ulotna", "3", "59-220"),
		units: [{ cells: [["1800", 0]] }],
	},
];

/** Fillers: dental clinics of one company in Legnica, enough for the register's floors. */
function fillers(suffix = ""): PlCase[] {
	return Array.from({ length: 1_000 }, (_, index) => ({
		id: 910_000 + index,
		book: "990006",
		kind: "3",
		name: `Przykład Dental ${index + 1}`,
		address: at(
			"0262011",
			"Legnica",
			`Wypełniająca${suffix}`,
			String(index + 1),
			"59-220",
			`76 ${String(index).padStart(7, "0")}`,
		),
		units: [{ cells: [["1800", 0]] }],
	}));
}

export const PL_FACILITIES: PlFixtureSet = { entities: ENTITIES, cases: PL_CASES };

const quote = (value: string | number | null | undefined) =>
	`"${value === null || value === undefined || value === "" ? "NULL" : String(value).replace(/"/g, '""')}"`;

const csv = (header: readonly string[], rows: readonly (string | number | null)[][]) =>
	`${[header, ...rows].map((row) => row.map(quote).join(";")).join("\n")}\n`;

const addressCells = (address: PlAddress) => [
	address.teryt,
	address.city,
	address.street,
	address.building,
	null,
	address.postcode,
	address.city,
	address.phone,
	"rejestracja@example.invalid",
	"www.example.invalid",
	address.simc ?? null,
	null,
];

/** The ZIP of the register, as RPWDL publishes it. */
export function rpwdlArchive(set: PlFixtureSet = PL_FACILITIES): Buffer {
	const entities = set.entities.map((entity, index) => [
		entity.book,
		`99${String(index).padStart(8, "0")}`,
		`99${String(index).padStart(7, "0")}`,
		`0000${entity.book}`.padStart(12, "0"),
		null,
		null,
		"2026-01-01",
		null,
		"W",
		"14",
		entity.form,
		entity.formLabel,
		entity.name,
		null,
		"1465011",
		"Warszawa",
		"Siedzibowa",
		"99",
		"9",
		"00-999",
		"Warszawa",
		"600 999 999",
		"siedziba@example.invalid",
		null,
		null,
		null,
		null,
		null,
		"2000-01-01",
		null,
		entity.ended ?? null,
		null,
		null,
	]);
	const cases = [...set.cases, ...fillers(set.fillerStreetSuffix)];
	const establishments = cases.map((item) => [
		item.book,
		item.id,
		`99${String(item.id).padStart(12, "0")}`,
		item.kind,
		item.name,
		...addressCells(item.address),
		"2010-01-01",
		item.ended ?? null,
	]);
	const units: (string | number | null)[][] = [];
	const cells: (string | number | null)[][] = [];
	let unitId = 800_000;
	let cellId = 7_000_000;
	for (const item of cases) {
		item.units.forEach((unit, index) => {
			unitId++;
			const address = unit.address ?? item.address;
			units.push([
				item.book,
				item.id,
				unitId,
				`99${String(item.id).padStart(12, "0")}`,
				String(index + 1).padStart(2, "0"),
				unit.name ?? item.name,
				...addressCells(address),
				"2010-01-01",
				item.ended ?? null,
				null,
				null,
			]);
			for (const [code, beds] of unit.cells) {
				cellId++;
				cells.push([
					item.book,
					item.id,
					unitId,
					cellId,
					`99${String(item.id).padStart(12, "0")}`,
					String(index + 1).padStart(2, "0"),
					"001",
					CELL_LABELS[code] ?? code,
					code,
					CELL_LABELS[code] ?? code,
					...addressCells(address),
					beds,
					...BEDS.slice(1).map(() => 0),
					"2010-01-01",
					item.ended ?? null,
					null,
					null,
				]);
			}
		});
	}
	return writeStoredZip(
		[
			{ name: "podmioty.csv", data: Buffer.from(csv(ENTITY_HEADER, entities)) },
			{ name: "zaklady.csv", data: Buffer.from(csv(ESTABLISHMENT_HEADER, establishments)) },
			{ name: "jednostki.csv", data: Buffer.from(csv(UNIT_HEADER, units)) },
			{ name: "komorki.csv", data: Buffer.from(csv(CELL_HEADER, cells)) },
			{
				name: "Info.txt",
				data: Buffer.from(
					`Raport wygenerowany na podstawie danych w systemie RPWDL z dnia ${set.producedAt ?? "2026-11-27"} 00:00:00`,
				),
			},
		],
		{ deflate: true },
	);
}

/** TERC's CSV, as eTERYT serves it (a BOM, CRLF, `;`). */
export function tercCsv(): string {
	const rows = [
		"WOJ;POW;GMI;RODZ;NAZWA;NAZWA_DOD;STAN_NA",
		...PL_TERC.map((row) => [...row, "2026-01-01"].join(";")),
	];
	return `﻿${rows.join("\r\n")}\r\n`;
}

const square = ([x, y, half]: [number, number, number]) => [
	{ x: x - half, y: y - half },
	{ x: x - half, y: y + half },
	{ x: x + half, y: y + half },
	{ x: x + half, y: y - half },
	{ x: x - half, y: y - half },
];

/** PRG's administrative units, the gminas' layer only, in a ZIP. */
export function prgArchive(): Buffer {
	const codes = Object.keys(PL_GMINA_SQUARES);
	const polygons = codes.map((code) => {
		const outer = square(PL_GMINA_SQUARES[code] as [number, number, number]);
		// The rural gmina of Bolesławiec surrounds the town: the town's square is its hole.
		if (code === "0201022") {
			const hole = square(PL_GMINA_SQUARES["0201011"] as [number, number, number]).reverse();
			return [outer, hole];
		}
		return [outer];
	});
	const dbf = writeDbf(
		[
			{ name: "JPT_KOD_JE", type: "C", length: 20 },
			{ name: "JPT_NAZWA_", type: "C", length: 64 },
		],
		codes.map((code) => ({
			JPT_KOD_JE: code,
			JPT_NAZWA_: PL_TERC.find((row) => row.slice(0, 4).join("") === code)?.[4] ?? "",
		})),
	);
	return writeStoredZip(
		[
			{ name: "A03_Granice_gmin.dbf", data: dbf },
			{ name: "A03_Granice_gmin.shp", data: writeShpPolygons(polygons) },
		],
		{ deflate: true },
	);
}

/** Writes the three fixture files to `dir`. */
export function writePlFixtures(dir: string = PL_FIXTURES, set: PlFixtureSet = PL_FACILITIES) {
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "rpwdl.zip"), rpwdlArchive(set));
	writeFileSync(join(dir, "terc.csv"), tercCsv());
	writeFileSync(join(dir, "prg-jednostki-administracyjne.zip"), prgArchive());
}

if (import.meta.main) {
	writePlFixtures();
	console.log(`Polish fixtures written to ${PL_FIXTURES}`);
}
