/**
 * Generates the SYNTHETIC fixtures in `fixtures/si/`: the health insurer's three workbooks of
 * personal doctors (general practice, gynaecology, dentistry) in the exact layout ZZZS publishes,
 * and the Register of Spatial Units' layers (regions, postal areas, municipalities, settlements,
 * streets) as its web feature service returns them, filled with fictitious doctors and practices.
 *
 * Every person and practice is made up: family names are made-up words (Primer, Zgled, Vzorec…,
 * "example" and "sample" in Slovenian), doctor numbers are in a range (90000 and up) far above the
 * real lists' (under 20000), provider numbers too, streets are invented ("Primerna ulica"). Never
 * commit real rows. Run with `bun run --cwd packages/etl fixtures:si`.
 *
 * The regions, municipalities and post offices are real public names and codes of the register,
 * with made-up outlines: each region is a box of a 4 × 3 grid over Slovenia, each postal area a
 * small box around its settlement.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SI_REGIONS } from "@apercura/core/country";
import { writeXlsx } from "../src/lib/xlsx";

export const SI_FIXTURES = join(import.meta.dirname, "si");

/** The day of the register's state the fixtures' places are said to be read at. */
export const SI_FIXTURE_PLACES_DATE = "2026-11-20";

/** A region's box in a 4 × 3 grid: `[west, south, east, north]`. */
function regionBox(code: string): [number, number, number, number] {
	const index = Number(code) - 1;
	const column = index % 4;
	const row = Math.floor(index / 4);
	return [13.4 + column * 0.8, 45.4 + row * 0.5, 14.2 + column * 0.8, 45.9 + row * 0.5];
}

/** Municipalities: code, name, region; their seat settlement takes the same name. */
export const SI_FIXTURE_MUNICIPALITIES: [string, string, string][] = [
	["80", "Murska Sobota", "1"],
	["70", "Maribor", "2"],
	["103", "Ravne na Koroškem", "3"],
	["11", "Celje", "4"],
	["133", "Vojnik", "4"],
	["129", "Trbovlje", "5"],
	["54", "Krško", "6"],
	["85", "Novo mesto", "7"],
	["61", "Ljubljana", "8"],
	["52", "Kranj", "9"],
	["94", "Postojna", "10"],
	["84", "Nova Gorica", "11"],
	["50", "Koper", "12"],
];

/**
 * Settlements: composite code, name, bilingual name, municipality, postcode, offset in its
 * region's box (0–1). Celje's villages: Škofja vas (a post office of its own) and Zadobrova
 * (no streets: addresses name the village).
 */
export const SI_FIXTURE_SETTLEMENTS: [
	string,
	string,
	string | null,
	string,
	string,
	number,
	number,
][] = [
	["80001", "Murska Sobota", null, "80", "9000", 0.5, 0.5],
	["70001", "Maribor", null, "70", "2000", 0.5, 0.5],
	["103001", "Ravne na Koroškem", null, "103", "2390", 0.5, 0.5],
	["11001", "Celje", null, "11", "3000", 0.3, 0.3],
	["11040", "Škofja vas", null, "11", "3211", 0.6, 0.3],
	["11055", "Zadobrova", null, "11", "3211", 0.7, 0.35],
	["133001", "Vojnik", null, "133", "3212", 0.5, 0.8],
	["129001", "Trbovlje", null, "129", "1420", 0.5, 0.5],
	["54001", "Krško", null, "54", "8270", 0.5, 0.5],
	["85001", "Novo mesto", null, "85", "8000", 0.5, 0.5],
	["61001", "Ljubljana", null, "61", "1000", 0.5, 0.5],
	["52001", "Kranj", null, "52", "4000", 0.5, 0.5],
	["94001", "Postojna", null, "94", "6230", 0.5, 0.5],
	["84001", "Nova Gorica", null, "84", "5000", 0.5, 0.5],
	["50001", "Koper", "Capodistria", "50", "6000", 0.5, 0.5],
];

/** Post offices: postcode, name, bilingual name. */
export const SI_FIXTURE_POST_OFFICES: [string, string, string | null][] = [
	["9000", "Murska Sobota", null],
	["2000", "Maribor", null],
	["2390", "Ravne na Koroškem", null],
	["3000", "Celje", null],
	["3211", "Škofja vas", null],
	["3212", "Vojnik", null],
	["1420", "Trbovlje", null],
	["8270", "Krško", null],
	["8000", "Novo mesto", null],
	["1000", "Ljubljana", null],
	["4000", "Kranj", null],
	["6230", "Postojna", null],
	["5000", "Nova Gorica", null],
	["6000", "Koper", "Capodistria"],
];

/** Streets: name, settlement. */
export const SI_FIXTURE_STREETS: [string, string][] = [
	["Primerna ulica", "61001"],
	["Cesta zgledov", "61001"],
	["Vzorčna cesta", "70001"],
	["Ulica Primer", "50001"],
	["Zgledna ulica", "11001"],
	["Celjska cesta", "133001"],
	["Trg primerov", "80001"],
	["Vzorčni trg", "103001"],
	["Primerna pot", "129001"],
	["Ulica vzorcev", "54001"],
	["Zgledni trg", "85001"],
	["Cesta primerov", "52001"],
	["Vzorčna pot", "94001"],
	["Ulica zgledov", "84001"],
];

const pointOf = (settlement: (typeof SI_FIXTURE_SETTLEMENTS)[number]) => {
	const municipality = SI_FIXTURE_MUNICIPALITIES.find(([code]) => code === settlement[3]);
	const [west, south, east, north] = regionBox(municipality?.[2] ?? "8");
	return {
		longitude: west + (east - west) * settlement[5],
		latitude: south + (north - south) * settlement[6],
	};
};

const box = (centre: { longitude: number; latitude: number }, half: number) =>
	[
		centre.longitude - half,
		centre.latitude - half,
		centre.longitude + half,
		centre.latitude + half,
	] as const;

const polygon = ([west, south, east, north]: readonly number[]) => ({
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
});

const eid = (prefix: string, code: string) => `${prefix}${code.padStart(12, "0")}`;

const collection = (features: object[]) =>
	`${JSON.stringify({ type: "FeatureCollection", features, numberMatched: features.length })}\n`;

/** The register's layers, as the web feature service returns them (GeoJSON, WGS 84). */
export function registerLayers(): Record<string, string> {
	const regions = Object.entries(SI_REGIONS).map(([code, name]) => ({
		type: "Feature",
		geometry: polygon(regionBox(code)),
		properties: { SIFRA: Number(code), NAZIV: name, NAZIV_DJ: null },
	}));
	const postal = SI_FIXTURE_POST_OFFICES.map(([code, name, nameDj]) => {
		const settlement = SI_FIXTURE_SETTLEMENTS.find(
			(row) => row[4] === code && !row[1].startsWith("Zad"),
		);
		const centre = settlement ? pointOf(settlement) : { longitude: 14.5, latitude: 46 };
		// Škofja vas's postal area holds Zadobrova too.
		return {
			type: "Feature",
			geometry: polygon(box(centre, code === "3211" ? 0.1 : 0.03)),
			properties: { SIFRA: Number(code), NAZIV: name, NAZIV_DJ: nameDj },
		};
	});
	const municipalities = SI_FIXTURE_MUNICIPALITIES.map(([code, name, region]) => ({
		type: "Feature",
		bbox: regionBox(region),
		properties: {
			SIFRA: Number(code),
			NAZIV: name,
			NAZIV_DJ: code === "50" ? "Capodistria" : null,
			EID_OBCINA: eid("1102", code),
		},
	}));
	const settlements = SI_FIXTURE_SETTLEMENTS.map((settlement) => {
		const [code, name, nameDj, municipality] = settlement;
		return {
			type: "Feature",
			bbox: box(pointOf(settlement), 0.01),
			properties: {
				SIFRA: Number(code.slice(-3)),
				NAZIV: name,
				NAZIV_DJ: nameDj,
				EID_NASELJE: eid("1103", code),
				EID_OBCINA: eid("1102", municipality),
				SESTAVLJENA_SIFRA: Number(code),
			},
		};
	});
	const streets = SI_FIXTURE_STREETS.map(([name, settlement]) => {
		const row = SI_FIXTURE_SETTLEMENTS.find(([code]) => code === settlement);
		return {
			type: "Feature",
			bbox: row ? box(pointOf(row), 0.004) : undefined,
			properties: { NAZIV: name, NAZIV_DJ: null, EID_NASELJE: eid("1103", settlement) },
		};
	});
	return {
		"si-regions.json": collection(regions),
		"si-postal-areas.json": collection(postal),
		"si-municipalities.json": collection(municipalities),
		"si-settlements.json": collection(settlements),
		"si-streets.json": collection(streets),
		"si-rpe-state.json": `${JSON.stringify({ date: SI_FIXTURE_PLACES_DATE })}\n`,
	};
}

/** A practice of the fixtures: provider number, name, street, place (as the lists write them). */
export type SiFixtureProvider = [string, string, string, string];

/** Hand-written practices, one per way of placing them, then fillers in every region. */
export const SI_FIXTURE_PROVIDERS: SiFixtureProvider[] = [
	["90001", "ZDRAVSTVENI DOM PRIMER LJUBLJANA", "PRIMERNA ULICA 12", "1000 LJUBLJANA"],
	["90002", "ZASEBNA AMBULANTA ZGLED D.O.O.", "ZGLEDNA ULICA 3", "3000 CELJE"],
	// A village without streets, served by another settlement's post office.
	["90003", "AMBULANTA VZOREC, ZDRAVSTVENE STORITVE D.O.O.", "ZADOBROVA 49 B", "3211 ŠKOFJA VAS"],
	// A street of another municipality's settlement, under its own post office.
	["90004", "PRIMERNIK ANA - ZASEBNA ZOBNA ORDINACIJA", "CELJSKA CESTA 24 B", "3212 VOJNIK"],
	// A bilingual post office.
	["90005", "ZDRAVSTVENI DOM KOPER PRIMER", "ULICA PRIMER 5", "6000 KOPER - CAPODISTRIA"],
	// A street the register does not know: placed by its post office.
	["90006", "SPLOŠNA BOLNIŠNICA PRIMER", "NEZNANA ULICA 1", "2000 MARIBOR"],
	["90007", "ZOBOZDRAVSTVO ZGLED D.O.O.", "VZORČNA CESTA 8", "2000 MARIBOR"],
	["90008", "AMBULANTA PRIMER MURSKA SOBOTA", "TRG PRIMEROV 2", "9000 MURSKA SOBOTA"],
	["90009", "ZOBNA ORDINACIJA VZOREC", "VZORČNI TRG 4", "2390 RAVNE NA KOROŠKEM"],
	["90010", "ZDRAVSTVENI DOM ZGLED TRBOVLJE", "PRIMERNA POT 6", "1420 TRBOVLJE"],
	["90011", "AMBULANTA ZGLED KRŠKO D.O.O.", "ULICA VZORCEV 7", "8270 KRŠKO"],
	["90012", "ZDRAVSTVENI DOM PRIMER NOVO MESTO", "ZGLEDNI TRG 9", "8000 NOVO MESTO"],
	["90013", "AMBULANTA VZOREC KRANJ D.O.O.", "CESTA PRIMEROV 10", "4000 KRANJ"],
	["90014", "ZDRAVSTVENI DOM ZGLED POSTOJNA", "VZORČNA POT 11", "6230 POSTOJNA"],
	["90015", "ZDRAVSTVENI DOM PRIMER NOVA GORICA", "ULICA ZGLEDOV 12", "5000 NOVA GORICA"],
	["90016", "ZASEBNA ORDINACIJA ZGLED LJUBLJANA", "CESTA ZGLEDOV 13", "1000 LJUBLJANA"],
];

const SURNAMES = ["PRIMER", "ZGLED", "VZOREC", "PRIMERNIK", "ZGLEDNIK", "VZORNIK", "PRIMERŠEK"];
const FIRST_NAMES = [
	"ANA",
	"MARKO",
	"NINA",
	"JOŽE",
	"MAJA",
	"LUKA",
	"EVA",
	"TINE",
	"ŠPELA",
	"ĐURO",
];

const FIRST_PROVIDER = SI_FIXTURE_PROVIDERS[0] as SiFixtureProvider;

/** A row of a list: provider, doctor, activity, acceptance. */
export type SiFixtureRow = {
	provider: SiFixtureProvider;
	doctor: string;
	name: string;
	activity: string;
	acceptance: "DA" | "NE" | "";
};

/** A fictitious doctor's name as the lists write it: family names, two spaces when one. */
function nameOf(index: number): string {
	const surname = SURNAMES[index % SURNAMES.length] ?? "PRIMER";
	const first = FIRST_NAMES[Math.floor(index / SURNAMES.length) % FIRST_NAMES.length] ?? "ANA";
	// Every fifth doctor has two family names, written with one space.
	if (index % 5 === 4) return `${surname} ${SURNAMES[(index + 3) % SURNAMES.length]} ${first}`;
	return `${surname}  ${first} `;
}

export type SiFixtureOptions = {
	/** Doctor numbers left out of every list (a doctor who left). */
	without?: readonly string[];
	/** Rows changed by doctor number (`acceptance`, `provider`). */
	change?: Readonly<Record<string, Partial<SiFixtureRow>>>;
};

/**
 * The rows of each list. Hand-written doctors first (numbers 90001–90010), then fillers above
 * the floors of the guards (600 general practitioners, 120 gynaecologists, 400 dentists).
 */
export function fixtureRows(
	options: SiFixtureOptions = {},
): Record<"sa" | "gin" | "zob", SiFixtureRow[]> {
	const provider = (code: string) =>
		SI_FIXTURE_PROVIDERS.find(([id]) => id === code) ?? FIRST_PROVIDER;
	const hand: Record<"sa" | "gin" | "zob", SiFixtureRow[]> = {
		sa: [
			{
				provider: provider("90001"),
				doctor: "90001",
				name: "PRIMER  ANA ",
				activity: "302001",
				acceptance: "DA",
			},
			// One doctor, two activities at one practice, and a children's dispensary elsewhere.
			{
				provider: provider("90001"),
				doctor: "90002",
				name: "ZGLED  MARKO ",
				activity: "327009",
				acceptance: "NE",
			},
			{
				provider: provider("90016"),
				doctor: "90002",
				name: "ZGLED  MARKO ",
				activity: "327009",
				acceptance: "DA",
			},
			{
				provider: provider("90016"),
				doctor: "90002",
				name: "ZGLED  MARKO ",
				activity: "302001",
				acceptance: "NE",
			},
			{
				provider: provider("90003"),
				doctor: "90003",
				name: "VZOREC KOS NINA",
				activity: "302001",
				acceptance: "DA",
			},
			{
				provider: provider("90005"),
				doctor: "90004",
				name: "ĐURIĆ  ŠPELA ",
				activity: "302068",
				acceptance: "NE",
			},
			{
				provider: provider("90006"),
				doctor: "90005",
				name: "PRIMERŠEK  TINE ",
				activity: "302070",
				acceptance: "",
			},
		],
		gin: [
			{
				provider: provider("90002"),
				doctor: "90006",
				name: "ZGLEDNIK  EVA ",
				activity: "306007",
				acceptance: "DA",
			},
			{
				provider: provider("90006"),
				doctor: "90007",
				name: "VZORNIK  MAJA ",
				activity: "306007",
				acceptance: "NE",
			},
		],
		zob: [
			// Adults and young people at one practice, taking only the adults.
			{
				provider: provider("90004"),
				doctor: "90008",
				name: "PRIMERNIK  ANA ",
				activity: "404101",
				acceptance: "DA",
			},
			{
				provider: provider("90004"),
				doctor: "90008",
				name: "PRIMERNIK  ANA ",
				activity: "404103",
				acceptance: "NE",
			},
			{
				provider: provider("90007"),
				doctor: "90009",
				name: "ZGLED  LUKA ",
				activity: "404105",
				acceptance: "DA",
			},
			{
				provider: provider("90016"),
				doctor: "90010",
				name: "VZOREC  JOŽE ",
				activity: "404101",
				acceptance: "NE",
			},
		],
	};
	const fill = (count: number, start: number, activities: readonly string[]) =>
		Array.from({ length: count }, (_, index): SiFixtureRow => {
			const number = start + index;
			return {
				provider: SI_FIXTURE_PROVIDERS[index % SI_FIXTURE_PROVIDERS.length] ?? FIRST_PROVIDER,
				doctor: String(number),
				name: nameOf(index),
				activity: activities[index % activities.length] ?? activities[0] ?? "302001",
				acceptance: index % 3 === 0 ? "DA" : "NE",
			};
		});
	const lists = {
		sa: [...hand.sa, ...fill(600, 91000, ["302001", "302001", "327009"])],
		gin: [...hand.gin, ...fill(120, 92000, ["306007"])],
		zob: [...hand.zob, ...fill(400, 93000, ["404101", "404103"])],
	};
	const without = new Set(options.without ?? []);
	for (const key of ["sa", "gin", "zob"] as const) {
		lists[key] = lists[key]
			.filter((row) => !without.has(row.doctor))
			.map((row) => ({ ...row, ...(options.change?.[row.doctor] ?? {}) }));
	}
	return lists;
}

/** The regional unit (`Območna enota izvajalca`) of a practice, padded as the lists pad it. */
const unitOf = (place: string) =>
	`OE ${place.replace(/^\d{4}\s+/, "").split(" - ")[0]}`.padEnd(30, " ");

const SA_HEADER = [
	"Območna enota izvajalca",
	"Šifra izvajalca",
	"Naziv izvajalca",
	"Ulica",
	"Kraj",
	"Šifra zdravnika",
	"Priimek in ime zdravnika",
	"Šifra ZZZS dejavnosti",
	"Naziv ZZZS dejavnosti",
	"Zdravnik še sprejema zavarovane osebe",
	"Zdravnik mora  glede na št. opredeljenih oseb (stolpec M) sprejeti novorojenčke in dojenčke (otroci do enega leta)",
	"Obseg zaposlitve   Zdravnik z obsegom zaposlitve  manj kot 1,0  ne dela  vse dni v tednu ali polni delovni čas (npr. zdravnik z obsegom zaposlitve 0,20 lahko dela le en dan v tednu) ",
	"Število opredeljenih oseb  preračunano na 1 tim zaposlitve",
	"Število glavarinskih količnikov  preračunano na 1 tim zaposlitve",
	"Specializant",
];

const OTHER_HEADER = [
	"Območna enota izvajalca",
	"Šifra izvajalca",
	"Naziv izvajalca",
	"Ulica",
	"Kraj",
	"Šifra zdravnika",
	"Priimek in ime zdravnika",
	"Šifra ZZZS dejavnosti",
	"Naziv ZZZS dejavnosti",
	"Zdravnik še sprejema zavarovane osebe",
	"Obseg zaposlitve   Zdravnik z obsegom zaposlitve  manj kot 1,0  ne dela  vse dni v tednu ali polni delovni čas (npr. zdravnik z obsegom zaposlitve 0,20 lahko dela le en dan v tednu) ",
	"Doseganje povprečja",
];

const ACTIVITY_NAMES: Readonly<Record<string, string>> = {
	"302001": "Splošna dejavnost - splošna ambulanta   ",
	"302068": "Amb. specializanta družinske medicine   ",
	"302070": "Splošna ambulanta - dodatno 0,5 DMS     ",
	"327009": "Splošna dej.-otroški in šolski dispanzer",
	"306007": "SPLOŠNA DEJAVNOST - DISPANZER ZA ŽENSKE ",
	"404101": "ZOBOZDR. DEJAVNOST-ZDRAVLJENJE ODRASLIH ",
	"404103": "ZOBOZDR. DEJAVNOST-ZDRAVLJENJE MLADINE  ",
	"404105": "ZOBOZDR. DEJAVNOST-ZDRAVLJENJE ŠTUDENTOV",
};

/** A list's workbook in the insurer's layout: its title, its date, its header, rows, totals. */
export function listWorkbook(list: "sa" | "gin" | "zob", rows: readonly SiFixtureRow[]): Buffer {
	const data = rows.map((row) => {
		const [code, name, street, place] = row.provider;
		const common = [
			unitOf(place),
			`${code}.0`,
			name,
			street,
			place,
			`${row.doctor}.0`,
			row.name,
			row.activity,
			ACTIVITY_NAMES[row.activity] ?? "",
			row.acceptance,
		];
		return list === "sa"
			? [...common, "", "1.0", "1500.0", "1600.5", "  "]
			: [...common, "1.0", "100.0"];
	});
	const totals =
		list === "sa"
			? [
					[
						"ZZZS SKUPAJ",
						"",
						"",
						"",
						"",
						"",
						"",
						"302001",
						ACTIVITY_NAMES["302001"] ?? "",
						"",
						"",
						"",
						"958.31",
						"1686.92",
						"",
					],
				]
			: [
					[
						"OE LJUBLJANA - SKUPAJ",
						"0.0",
						"",
						"",
						"",
						"0.0",
						"",
						rows[0]?.activity ?? "",
						"",
						"",
						"27.86",
						"100.0",
					],
				];
	const head =
		list === "sa"
			? [["SPLOŠNA DEJAVNOST"], ["Stanje podatkov na dan:", "26.11.2026"], SA_HEADER]
			: [
					[list === "gin" ? "GINEKOLOGIJA" : "ZOBOZDRAVSTVO"],
					[""],
					[""],
					["Datum in čas priprave datoteke:"],
					["27.11.2026 ob 07.00"],
					[""],
					OTHER_HEADER,
				];
	return writeXlsx([...head, ...data, ...totals, [""], [""]], { deflate: true });
}

/** The page of the insurer linking the day's workbooks (for the link reader's tests). */
export function listsPage(): string {
	const link = (id: number, title: string) =>
		`<tr><td style="width: 150px;"> 27.11.2026 </td><td><a href="/izbira-in-zamenjava-osebnega-zdravnika/seznami-zdravnikov?stdatoteke=${id}&amp;tx_agzzzsapi_izvajalcidownloadfile%5Baction%5D=downloadfile&amp;type=1249058992&amp;cHash=${id}abc">${title}</a></td></tr>`;
	return `<!DOCTYPE html><html lang="sl"><body><main id="main-content"><table id="seznamdatotek-1560"><thead><tr><th>Datum objave</th><th>Vsebina</th></tr></thead><tbody>${[
		link(
			90803,
			"Število opredeljenih pri splošnih zdravnikih (družinski, otroški oz. šolski zdravniki)",
		),
		link(
			90806,
			"Število opredeljenih v dodatnih ambulantah (za osebe nad 19 let brez splošnega zdravnika)",
		),
		link(90805, "Število opredeljenih pri ginekologih"),
		link(90804, "Število opredeljenih pri zobozdravnikih"),
	].join("")}</tbody></table></main></body></html>\n`;
}

/** Writes every fixture file into `dir`. */
export function generateSiFixtures(
	dir: string = SI_FIXTURES,
	options: SiFixtureOptions = {},
): void {
	mkdirSync(dir, { recursive: true });
	for (const [name, content] of Object.entries(registerLayers()))
		writeFileSync(join(dir, name), content);
	const rows = fixtureRows(options);
	writeFileSync(join(dir, "zzzs-sa.xlsx"), listWorkbook("sa", rows.sa));
	writeFileSync(join(dir, "zzzs-gin.xlsx"), listWorkbook("gin", rows.gin));
	writeFileSync(join(dir, "zzzs-zob.xlsx"), listWorkbook("zob", rows.zob));
	writeFileSync(join(dir, "seznami-zdravnikov.html"), listsPage());
}

if (import.meta.main) {
	generateSiFixtures();
	console.log(`Slovenian fixtures written to ${SI_FIXTURES}`);
}
