/**
 * Generates the SYNTHETIC fixtures in `fixtures/ch/`: the FOPH's hospital figures and the
 * cantons' lists in their exact formats (the figures' workbook with its two sheets, Bern's web
 * service GeoJSON, Geneva's SITG ZIPs, Basel-Landschaft's and Basel-Stadt's exports, Zürich's
 * long CSV of yearly figures, Jura's ZIP holding a Windows-1252 shapefile in the Swiss grid), the
 * BFS commune register's snapshot and swisstopo's postcode directory, filled with fictitious
 * facilities.
 *
 * Every facility is made up: names are made-up words (Muster, Beispiel, Fiktiv, Exemple,
 * Esempio, Modell…), streets do not exist, phone numbers are made up (`… 999 …`), the
 * responsible pharmacists and e-mail addresses some lists carry are invented ("Apothekerin Erika
 * Fiktiva", "erika.fiktiva@example.ch") so the tests can check they are never stored, and so is
 * the care-of person of one hospital's name. Never commit real rows. Run with
 * `bun run --cwd packages/etl fixtures:ch`.
 *
 * The cantons, districts, communes and their BFS numbers are the real public ones; the postcode
 * directory's points are near the real localities, not their exact centres.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CH_CANTONS } from "@apercura/core/country";
import { writeDbf, writeShpPoints } from "../src/lib/shapefile";
import { writeXlsxSheets } from "../src/lib/xlsx";
import { writeStoredZip } from "../src/lib/zip";

export const CH_FIXTURES = join(import.meta.dirname, "ch");

/** Districts: BFS historical code, BFS number, name, canton number. */
const DISTRICTS: [string, string, string, number][] = [
	["10228", "112", "Bezirk Zürich", 1],
	["10074", "110", "Bezirk Winterthur", 1],
	["10288", "246", "Verwaltungskreis Bern-Mittelland", 2],
	["10284", "242", "Verwaltungskreis Biel/Bienne", 2],
	["10093", "1200", "Kanton Basel-Stadt", 12],
	["10237", "1303", "Bezirk Liestal", 13],
	["10092", "1301", "Bezirk Arlesheim", 13],
	["10003", "2105", "Distretto di Lugano", 21],
	// A district without a commune of the fixtures: Ticino has several, so Lugano's is not a stand-in.
	["10002", "2106", "Distretto di Mendrisio", 21],
	["10277", "2225", "District de Lausanne", 22],
	["10273", "2221", "District d'Aigle", 22],
	["10187", "2500", "Canton de Genève", 25],
	["10224", "2601", "District de Delémont", 26],
	["10226", "2603", "District de Porrentruy", 26],
];

/** Communes: BFS historical code, BFS number, name, district historical code. */
const COMMUNES: [string, string, string, string][] = [
	["13688", "261", "Zürich", "10228"],
	["10347", "230", "Winterthur", "10074"],
	["15029", "351", "Bern", "10288"],
	["15034", "356", "Muri bei Bern", "10288"],
	["15042", "371", "Biel/Bienne", "10284"],
	["11693", "2701", "Basel", "10093"],
	["12895", "2703", "Riehen", "10093"],
	["13774", "2829", "Liestal", "10237"],
	["13828", "2765", "Binningen", "10092"],
	["15628", "5192", "Lugano", "10003"],
	["14649", "5586", "Lausanne", "10277"],
	["12099", "6621", "Genève", "10187"],
	["11400", "6608", "Carouge (GE)", "10187"],
	["13282", "6711", "Delémont", "10224"],
	["13347", "6800", "Porrentruy", "10226"],
];

/** Postcode directory: locality, postcode, commune name, BFS number, canton, share, lon, lat, language. */
const POSTCODES: [string, string, string, string, string, number, number, number, string][] = [
	["Zürich", "8001", "Zürich", "261", "ZH", 100, 8.5417, 47.3717, "de"],
	["Zürich", "8008", "Zürich", "261", "ZH", 100, 8.556, 47.355, "de"],
	["Zürich", "8050", "Zürich", "261", "ZH", 100, 8.547, 47.411, "de"],
	["Winterthur", "8400", "Winterthur", "230", "ZH", 100, 8.724, 47.499, "de"],
	["Bern", "3008", "Bern", "351", "BE", 100, 7.429, 46.948, "de"],
	["Bern", "3010", "Bern", "351", "BE", 100, 7.425, 46.953, "de"],
	["Muri b. Bern", "3074", "Muri bei Bern", "356", "BE", 100, 7.487, 46.931, "de"],
	["Biel/Bienne", "2502", "Biel/Bienne", "371", "BE", 100, 7.247, 47.137, "de"],
	["Basel", "4056", "Basel", "2701", "BS", 100, 7.58, 47.562, "de"],
	["Basel", "4058", "Basel", "2701", "BS", 100, 7.6, 47.565, "de"],
	["Riehen", "4125", "Riehen", "2703", "BS", 100, 7.648, 47.585, "de"],
	["Liestal", "4410", "Liestal", "2829", "BL", 100, 7.733, 47.484, "de"],
	["Binningen", "4102", "Binningen", "2765", "BL", 100, 7.569, 47.54, "de"],
	["Lugano", "6900", "Lugano", "5192", "TI", 100, 8.951, 46.005, "it"],
	["Lausanne", "1004", "Lausanne", "5586", "VD", 100, 6.623, 46.525, "fr"],
	["Lausanne", "1011", "Lausanne", "5586", "VD", 100, 6.641, 46.525, "fr"],
	["Genève", "1205", "Genève", "6621", "GE", 100, 6.143, 46.196, "fr"],
	["Genève", "1206", "Genève", "6621", "GE", 100, 6.154, 46.192, "fr"],
	["Carouge GE", "1227", "Carouge (GE)", "6608", "GE", 100, 6.139, 46.181, "fr"],
	["Delémont", "2800", "Delémont", "6711", "JU", 100, 7.343, 47.365, "fr"],
	["Porrentruy", "2900", "Porrentruy", "6800", "JU", 100, 7.076, 47.415, "fr"],
	// Liechtenstein: in the directory, outside the market (no canton).
	["Vaduz", "9490", "Vaduz", "7001", "", 100, 9.521, 47.141, "de"],
];

const csvCell = (value: string | number) => {
	const text = String(value);
	return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The commune register's snapshot, as its API answers: every canton, the fixtures' districts and communes. */
function communeRegister(): string {
	const header = [
		"HistoricalCode",
		"BfsCode",
		"ValidFrom",
		"ValidTo",
		"Level",
		"Parent",
		"Name",
		"ShortName",
		"Inscription",
		"Radiation",
		"Rec_Type_fr",
		"Rec_Type_de",
	];
	const lines = [header.join(",")];
	for (const [code, canton] of Object.entries(CH_CANTONS)) {
		lines.push(
			[canton.number, canton.number, "12.09.1848", "", 1, "", canton.name, code, "", "", "", ""]
				.map(csvCell)
				.join(","),
		);
	}
	for (const [historical, code, name, canton] of DISTRICTS) {
		lines.push(
			[historical, code, "12.09.1848", "", 2, canton, name, name, "100", "", "", ""]
				.map(csvCell)
				.join(","),
		);
	}
	for (const [historical, code, name, district] of COMMUNES) {
		lines.push(
			[historical, code, "12.09.1848", "", 3, district, name, name, "", "", "", ""]
				.map(csvCell)
				.join(","),
		);
	}
	return `${lines.join("\n")}\n`;
}

/** swisstopo's postcode directory: a ZIP of one `;`-separated CSV with a byte-order mark, CRLF. */
function postcodeDirectory(): Buffer {
	const header =
		"Ortschaftsname;PLZ4;Zusatzziffer;ZIP_ID;Gemeindename;BFS-Nr;Kantonskürzel;Adressenanteil;E;N;Sprache;Validity";
	const lines = POSTCODES.map(
		([locality, postcode, commune, bfs, canton, share, lon, lat, language], index) =>
			[
				locality,
				postcode,
				"0",
				9000 + index,
				commune,
				bfs,
				canton,
				`${share} %`,
				lon,
				lat,
				language,
				"2008-07-01",
			].join(";"),
	);
	const csv = `\ufeff${[header, ...lines].join("\r\n")}\r\n`;
	return writeStoredZip(
		[{ name: "AMTOVZ_CSV_WGS84/AMTOVZ_CSV_WGS84.csv", data: Buffer.from(csv, "utf8") }],
		{
			deflate: true,
		},
	);
}

type Hospital = {
	canton: string;
	name: string;
	street: string;
	place: string;
	type: string;
	form: string;
	activities: string;
	services: string;
	offer: string;
	sites: { canton?: string; name: string; street: string; place: string; offer: string }[];
};

/** The FOPH's hospitals, each with its sites (a hospital of one site is its own site). */
const HOSPITALS: Hospital[] = [
	{
		canton: "ZH",
		name: "Stadtspital Musterberg AG",
		street: "Musterbergstrasse 1",
		place: "8050 Zürich",
		type: "K112",
		form: "R4",
		activities: "A, R",
		services: "NF, IPS",
		offer: "Amb, Stat",
		sites: [
			{
				name: "Stadtspital Musterberg Nord",
				street: "Musterbergstrasse 1",
				place: "8050 Zürich",
				offer: "Amb, Stat",
			},
			{
				name: "Stadtspital Musterberg Süd",
				street: "Beispielweg 12",
				place: "8008 Zürich",
				offer: "Amb, Stat",
			},
			{
				name: "Ambulatorium Musterberg Winterthur",
				street: "Fiktivgasse 3",
				place: "8400 Winterthur",
				offer: "Amb",
			},
		],
	},
	{
		canton: "ZH",
		name: "Spital Fiktiv Zürich",
		street: "Fiktivplatz 1",
		place: "8091 Zürich",
		type: "K121",
		form: "R2",
		activities: "A",
		services: "NF",
		offer: "Amb, Stat",
		sites: [],
	},
	{
		canton: "ZH",
		name: "Geburtshaus Muster GmbH",
		street: "Hebammenweg 5",
		place: "8400 Winterthur",
		type: "K232",
		form: "R1",
		activities: "B",
		services: "",
		offer: "Amb, Stat",
		sites: [
			{
				name: "Geburtshaus Muster",
				street: "Hebammenweg 5",
				place: "8400 Winterthur",
				offer: "Amb, Stat",
			},
		],
	},
	{
		canton: "BE",
		name: "Psychiatrische Klinik Beispielhof AG",
		street: "Beispielhofstrasse 20",
		place: "3008 Bern",
		type: "K211",
		form: "R1",
		activities: "P",
		services: "",
		offer: "Amb, Stat",
		sites: [
			{
				name: "Psychiatrische Klinik Beispielhof",
				street: "Beispielhofstrasse 20",
				place: "3008 Bern",
				offer: "Amb, Stat",
			},
			{
				canton: "BS",
				name: "Ambulatorium Beispielhof Basel",
				street: "Modellstrasse 8",
				place: "4058 Basel",
				offer: "Amb",
			},
		],
	},
	{
		canton: "BE",
		name: "Rehaklinik Fiktiv",
		street: "Kurweg 7",
		place: "3074 Muri b. Bern",
		type: "K221",
		form: "R2",
		activities: "R",
		services: "",
		offer: "Stat",
		sites: [],
	},
	{
		canton: "GE",
		name: "Clinique Exemple SA",
		street: "Avenue de l'Exemple 12",
		place: "1206 Genève",
		type: "K231",
		form: "R1",
		activities: "A",
		services: "",
		offer: "Amb, Stat",
		sites: [],
	},
	{
		canton: "GE",
		name: "Hôpital Exemple de Carouge",
		street: "Rue Fictive 4",
		place: "1227 Carouge GE",
		type: "K121",
		form: "R4",
		activities: "A",
		services: "NF",
		offer: "Amb, Stat",
		sites: [],
	},
	{
		canton: "TI",
		name: "Ente Ospedaliero Esempio",
		street: "Via Esempio 1",
		place: "6900 Lugano",
		type: "K121",
		form: "R4",
		activities: "A",
		services: "NF, IPS",
		offer: "Amb, Stat",
		sites: [
			{
				name: "Ospedale Esempio",
				street: "Via Esempio 1",
				place: "6900 Lugano",
				offer: "Amb, Stat",
			},
		],
	},
	{
		canton: "TI",
		name: "Clinica Esempio c/o Fiduciaria Fittizia SA a.c.a. sig. Mario Fittizio",
		street: "Via Modello 9",
		place: "6900 Lugano",
		type: "K235",
		form: "R1",
		activities: "A",
		services: "",
		offer: "Stat",
		sites: [],
	},
	{
		canton: "JU",
		name: "Hôpital Exemple du Jura",
		street: "Faubourg de l'Exemple 30",
		place: "2800 Delémont",
		type: "K121",
		form: "R4",
		activities: "A, R",
		services: "NF",
		offer: "Amb, Stat",
		sites: [
			{
				name: "Hôpital Exemple du Jura - site de Delémont",
				street: "Faubourg de l'Exemple 30",
				place: "2800 Delémont",
				offer: "Amb, Stat",
			},
			{
				name: "Hôpital Exemple du Jura - site de Porrentruy",
				street: "Chemin de l'Exemple 9",
				place: "2900 Porrentruy",
				offer: "Amb, Stat",
			},
		],
	},
	{
		canton: "BS",
		name: "Universitätsspital Muster Basel",
		street: "Musterspitalstrasse 21",
		place: "4056 Basel",
		type: "K111",
		form: "R4",
		activities: "A",
		services: "NF, IPS",
		offer: "Amb, Stat",
		sites: [],
	},
	{
		canton: "BL",
		name: "Spital Beispiel Liestal",
		street: "Spitalstrasse 99",
		place: "4410 Liestal",
		type: "K122",
		form: "R4",
		activities: "A",
		services: "NF",
		offer: "Amb, Stat",
		sites: [],
	},
	{
		canton: "VD",
		name: "Hôpital Exemple Lausanne",
		street: "Rue de l'Exemple 46",
		place: "1011 Lausanne",
		type: "K112",
		form: "R4",
		activities: "A, P",
		services: "NF, IPS",
		offer: "Amb, Stat",
		sites: [],
	},
];

/** Places the generated outpatient sites go to, in turn: canton and `PLZ Ort`. */
const FILLER_PLACES: [string, string][] = [
	["ZH", "8001 Zürich"],
	["ZH", "8400 Winterthur"],
	["BE", "3010 Bern"],
	["BE", "2502 Biel/Bienne"],
	["BS", "4056 Basel"],
	["BL", "4102 Binningen"],
	["TI", "6900 Lugano"],
	["VD", "1004 Lausanne"],
	["GE", "1205 Genève"],
	["JU", "2800 Delémont"],
];

/** The figures' workbook: the hospitals' sheet (with the total line) and the sites' sheet. */
function bagWorkbook(): Buffer {
	const hospitals: Hospital[] = [
		...HOSPITALS,
		{
			canton: "ZH",
			name: "Gesundheitszentrum Modell AG",
			street: "Modellweg 1",
			place: "8001 Zürich",
			type: "K123",
			form: "R1",
			activities: "A",
			services: "",
			offer: "Amb",
			sites: Array.from({ length: 50 }, (_, index) => {
				const [canton, place] = FILLER_PLACES[index % FILLER_PLACES.length] ?? [
					"ZH",
					"8001 Zürich",
				];
				const number = String(index + 1).padStart(2, "0");
				return {
					canton,
					name: `Ambulatorium Modell ${number}`,
					street: `Modellweg ${index + 1}`,
					place,
					offer: "Amb",
				};
			}),
		},
	];
	const header = [
		"JAHR",
		"KT",
		"Inst",
		"Adr",
		"Ort",
		"Typ",
		"RForm",
		"Akt",
		"SL",
		"WB",
		"AnzStand",
		"SA",
		"LA",
		"AmbKonsT",
		"BettenStat",
	];
	const hospitalRows = hospitals.map((hospital) => [
		"2023",
		hospital.canton,
		hospital.name,
		hospital.street,
		hospital.place,
		hospital.type,
		hospital.form,
		hospital.activities,
		hospital.services,
		"BGs",
		String(Math.max(1, hospital.sites.length)),
		"CT",
		hospital.offer,
		"12345",
		"42",
	]);
	const siteHeader = [
		"JAHR",
		"KT",
		"Inst",
		"Adr",
		"Ort",
		"AnzStand",
		"KT_Standort",
		"Standort",
		"Adr_Standort",
		"Ort_Standort",
		"LA_Standort",
	];
	const siteRows: string[][] = [];
	for (const hospital of hospitals) {
		const sites =
			hospital.sites.length > 0
				? hospital.sites
				: [
						{
							name: hospital.name,
							street: hospital.street,
							place: hospital.place,
							offer: hospital.offer,
						},
					];
		for (const site of sites) {
			siteRows.push([
				"2023",
				hospital.canton,
				hospital.name,
				hospital.street,
				hospital.place,
				String(sites.length),
				("canton" in site && site.canton) || hospital.canton,
				site.name,
				site.street,
				site.place,
				site.offer,
			]);
		}
	}
	// The same site twice (the figures repeat a few): read once.
	const repeated = siteRows[1];
	if (repeated) siteRows.push([...repeated]);
	return writeXlsxSheets(
		[
			{
				name: "ReadMe",
				rows: [
					["", "© Bundesamt für Gesundheit (BAG)"],
					["", "Auszugsweiser Abdruck unter Quellenangabe gestattet."],
				],
			},
			{
				name: "Kennzahlen",
				rows: [
					["Code", "DE", "FR", "IT"],
					["KT", "Kanton", "Canton", "Cantone"],
				],
			},
			{
				name: "KZ2023_KZP23",
				rows: [
					header,
					...hospitalRows,
					[
						"2023",
						"",
						"Alle Betriebe - Tous les établissements - Tutti gli stabilimenti",
						"",
						"",
						"",
						"",
						"A, P, R, B",
					],
				],
			},
			{ name: "Standorte_KZ2023_KZP23", rows: [siteHeader, ...siteRows] },
		],
		{ deflate: true },
	);
}

type FeatureInput = { properties: Record<string, unknown>; point: [number, number] | null };

const featureCollection = (features: FeatureInput[], crs?: string) =>
	`${JSON.stringify(
		{
			type: "FeatureCollection",
			...(crs ? { crs: { type: "name", properties: { name: crs } } } : {}),
			features: features.map(({ properties, point }) => ({
				type: "Feature",
				properties,
				geometry: point ? { type: "Point", coordinates: point } : null,
			})),
		},
		null,
		1,
	)}\n`;

/** A point near a fixture locality (`index` moves it a few hundred metres). */
function near(postcode: string, index = 0): [number, number] {
	const entry = POSTCODES.find((row) => row[1] === postcode);
	const lon = entry?.[6] ?? 8.5;
	const lat = entry?.[7] ?? 47.3;
	return [
		Number((lon + 0.001 * (index % 7)).toFixed(6)),
		Number((lat + 0.0007 * (index % 5)).toFixed(6)),
	];
}

/** Bern's hospitals (its web feature service, GeoJSON in WGS 84, with `"null"` for no URL). */
function bernHospitals(): string {
	const row = (
		index: number,
		firm: string,
		site: string,
		street: string,
		postcode: string,
		town: string,
		flags: { akut?: 1; psych?: 1; reha?: 1; geburt?: 1 },
	): FeatureInput => ({
		properties: {
			GmlID: `SPITAL_SPITKLIN_VW_8200.${index}`,
			"Object-Id": index,
			AKUT: flags.akut ?? 0,
			BEZ_FIRMA: firm,
			BEZ_STO: site,
			GEBURT: flags.geburt ?? 0,
			LOKALISAT: street,
			ORTSCHAFT: town,
			PLZ: Number(postcode),
			PSYCHKLIN: flags.psych ?? 0,
			REHAKLIN: flags.reha ?? 0,
			URL: "null",
		},
		point: near(postcode, index),
	});
	const features = [
		row(
			1,
			"Psychiatrische Klinik Beispielhof AG",
			"Psychiatrische Klinik Beispielhof",
			"Beispielhofstrasse 20",
			"3008",
			"Bern",
			{ psych: 1 },
		),
		row(2, "Rehaklinik Fiktiv", "Rehaklinik Fiktiv", "Kurweg 7", "3074", "Muri b. Bern", {
			reha: 1,
		}),
		row(
			3,
			"Privatklinik Bernmuster AG",
			"Privatklinik Bernmuster",
			"Musterrain 2",
			"3010",
			"Bern",
			{ akut: 1 },
		),
		row(4, "Geburtshaus Bielmuster GmbH", "Geburtshaus Bielmuster", "Seeweg 4", "2502", "Biel", {
			geburt: 1,
		}),
		...Array.from({ length: 8 }, (_, index) =>
			row(
				5 + index,
				"Tagesklinik Modell AG",
				`Tagesklinik Modell Bern ${index + 1}`,
				`Modellgasse ${index + 1}`,
				index % 2 ? "3008" : "3010",
				"Bern",
				{ psych: 1 },
			),
		),
	];
	return featureCollection(features, "EPSG:4326");
}

/** Bern's homes for the elderly (the same service): phone, operator, and an e-mail never read. */
function bernHomes(): string {
	const features = Array.from({ length: 32 }, (_, index): FeatureInput => {
		const postcode = ["3008", "3010", "3074", "2502"][index % 4] ?? "3008";
		const town =
			postcode === "2502" ? "Biel/Bienne" : postcode === "3074" ? "Muri b. Bern" : "Bern";
		return {
			properties: {
				GmlID: `ILV_STOALTER_VW_20214.${index + 1}`,
				"Object-Id": index + 1,
				INAME: index === 0 ? "Alterszentrum Beispiel" : `Pflegeheim Muster ${index + 1}`,
				ADRESSE: `Mustermattweg ${index + 1}`,
				PLZ: Number(postcode),
				ORTSCHAFT: town,
				TRNAME: "Stiftung Altersheime Muster",
				TELEFON: `+41 31 999 ${String(10 + index).padStart(2, "0")} 00`,
				URL: "www.example.ch",
				EMAIL: "erika.fiktiva@example.ch",
				E_KOORD: 2600000 + index,
				N_KOORD: 1200000 + index,
				ALTERSHEIM: 1,
				TAGESTBETA: 0,
				WOHNMITDL: 0,
			},
			point: near(postcode, index),
		};
	});
	return featureCollection(features, "EPSG:4326");
}

/** Geneva's hospitals and clinics (SITG): number-first streets, some with their postcode. */
function genevaHospitals(): Buffer {
	const row = (
		id: number,
		name: string,
		type: string,
		address: string,
		phone: string,
		postcode: string,
	): FeatureInput => ({
		properties: {
			OBJECTID: id,
			NOM_ETABLISSEMENT: name,
			TYPE_ETABLISSEMENT: type,
			ADRESSE: address,
			TELEPHONE: phone,
			FAX: " ",
			PHOTO: null,
			SITE_WEB: null,
			NUMERO_CLASSEMENT: null,
		},
		point: near(postcode, id),
	});
	const features = [
		row(
			1,
			"Clinique Exemple",
			"Clinique",
			"12 avenue de l'Exemple  1206 Genève",
			"022.999.01.01",
			"1206",
		),
		row(2, "Hôpital des enfants Exemple", "Hôpital", "rue Fictive 6", "022.999.02.02", "1205"),
		row(
			3,
			"Clinique de psychiatrie (Belle-Exemple)",
			"Clinique",
			"2 avenue du Petit-Exemple  1206 Genève",
			"022.999.03.03",
			"1206",
		),
		row(4, "Maternité Exemple", "Hôpital", "boulevard de l'Exemple 30", "022.999.04.04", "1205"),
		row(
			5,
			"Consultation Exemple",
			"HUG consultations ambulatoires",
			"rue de l'Exemple 47",
			"022.999.05.05",
			"1205",
		),
		row(
			6,
			"Centre Exemple santé",
			"Centre Exemple santé",
			"route de l'Exemple 99",
			"022.999.06.06",
			"1227",
		),
	];
	return writeStoredZip(
		[
			{
				name: "DAS_HOPITAUX_CLINIQUES.geojson",
				data: Buffer.from(featureCollection(features), "utf8"),
			},
			{
				name: "Documents/Conditions d'utilisation Données Portail SITG.pdf",
				data: Buffer.from("%PDF-1.4 fixture\n"),
			},
		],
		{ deflate: true },
	);
}

/** Geneva's nursing homes (SITG), keyed by their cantonal address id. */
function genevaHomes(): Buffer {
	const features = Array.from({ length: 12 }, (_, index): FeatureInput => {
		const postcode = ["1205", "1206", "1227"][index % 3] ?? "1205";
		return {
			properties: {
				OBJECTID: index + 1,
				NOM_EMS: index === 0 ? "Résidence Les Exemples" : `EMS Le Modèle ${index + 1}`,
				NOM_COURT: `EMS MODELE ${index + 1}`,
				ADRESSE: `Rue du Modèle ${index + 1}`,
				LOCALITE: `${postcode} ${postcode === "1227" ? "Carouge GE" : "Genève"}`,
				TELEPHONE: `022.999.${String(10 + index).padStart(2, "0")}.00`,
				LITS_UAT: null,
				LIEN_FICHE_EMS: "https://www.example.ch/ems",
				LIEN_ASSOC_FAITIERE: null,
				IDPADR: String(990000000001 + index),
			},
			point: near(postcode, index),
		};
	});
	return writeStoredZip(
		[{ name: "DAS_EMS.geojson", data: Buffer.from(featureCollection(features), "utf8") }],
		{
			deflate: true,
		},
	);
}

/** Geneva's pharmacies that vaccinate (SITG's ArcGIS service). */
function genevaPharmacies(): string {
	const features = Array.from({ length: 16 }, (_, index): FeatureInput => {
		const postcode = ["1205", "1206", "1227"][index % 3] ?? "1205";
		const town = postcode === "1227" ? "Carouge" : "Genève";
		return {
			properties: {
				OBJECTID: 100 + index,
				NOM_SITE: index === 0 ? "Pharmacie de l'Exemple" : `Pharmacie Modèle ${index + 1}`,
				ADRESSE: `Rue de la Pharmacie-Modèle ${index + 1} (dans le Centre Exemple), ${postcode} ${town}`,
				VACCINATION: "VACCINATION",
				CONTACT: `Tel : 022 999 ${String(30 + index).padStart(2, "0")} 00`,
			},
			point: near(postcode, index),
		};
	});
	return featureCollection(features);
}

/** Basel-Landschaft's pharmacies: the business's GLN, and a responsible pharmacist never read. */
function baselLandPharmacies(): string {
	const features = Array.from({ length: 12 }, (_, index): FeatureInput => {
		const postcode = index % 2 ? "4102" : "4410";
		return {
			properties: {
				gln_betrieb: String(7699999000001 + index),
				betriebsname: index === 0 ? "Apotheke Beispiel Liestal" : `Muster Apotheke ${index + 1}`,
				zusatzname: "Fiktiv Apotheken AG",
				strasse: "Apothekerweg",
				hausnummer: String(index + 1),
				plz: postcode,
				ort: postcode === "4102" ? "Binningen" : "Liestal",
				name_verantw_person: "Fiktiva",
				vorname_verantw_person: "Erika",
				medizinalperson: "Ja",
				e_eingangskoordinate: 2622000 + index,
				n_eingangskoordinate: 1259000 + index,
			},
			point: near(postcode, index),
		};
	});
	return featureCollection(features);
}

/** Basel-Landschaft's homes, with their commune number; one lies in Basel-Stadt, as on the real list. */
function baselLandHomes(): string {
	const features = Array.from({ length: 7 }, (_, index): FeatureInput => {
		const inBasel = index === 0;
		const postcode = inBasel ? "4056" : index % 2 ? "4102" : "4410";
		return {
			properties: {
				bfs_nummer: inBasel ? "2701" : postcode === "4102" ? "2765" : "2829",
				gemeinde: inBasel ? "Basel" : postcode === "4102" ? "Binningen" : "Liestal",
				versorgungsregion_code: inBasel ? null : 1,
				versorgungsregion: inBasel ? null : "VR Alter Modell",
				institution: inBasel ? "Pflegezentrum Muster Basel" : `Alterszentrum Modell ${index + 1}`,
				post_adresse: inBasel ? "Musterstrasse 15" : `Modellstrasse ${index + 1}`,
				plz: postcode,
				ort: inBasel ? "Basel" : postcode === "4102" ? "Binningen" : "Liestal",
				telefon: `061 999 ${String(40 + index).padStart(2, "0")} 00`,
				e_mail: "erika.fiktiva@example.ch",
				website: "https://www.example.ch",
				gkode: 2610000 + index,
				gkodn: 1267000 + index,
			},
			point: near(postcode, index),
		};
	});
	return featureCollection(features);
}

/** Basel-Stadt's hospitals (geo.bs.ch, a ZIP of one GeoJSON in CRS84). */
function baselHospitals(): Buffer {
	const row = (
		id: number,
		name: string,
		category: string,
		emergency: boolean,
		address: string,
		postcode: string,
	): FeatureInput => ({
		properties: {
			ID: id,
			Name: name,
			Kategorie: category,
			Notfallstation: emergency,
			Adresse: address,
			Telefon: `061 999 ${String(id).padStart(2, "0")} 11`,
			Homepage: "https://https://www.example.ch",
		},
		point: near(postcode, id),
	});
	const features = [
		row(
			1,
			"Universitätsspital Muster",
			"Spital",
			true,
			"Musterspitalstrasse 21, 4056 Basel",
			"4056",
		),
		row(
			2,
			"Geriatriespital Fiktiv",
			"Geriatriespital",
			false,
			"Fiktivstrasse 3, 4125 Riehen",
			"4125",
		),
		row(3, "Psychiatrie Muster", "Psychiatrie ", false, "Modellweg 2, 4058 Basel", "4058"),
		row(
			4,
			"Geburtshaus Basel Beispiel",
			"Geburtshaus",
			false,
			"Hebammenplatz 1, 4058 Basel",
			"4058",
		),
	];
	return writeStoredZip(
		[
			{
				name: "spital.geojson",
				data: Buffer.from(featureCollection(features, "urn:ogc:def:crs:OGC:1.3:CRS84"), "utf8"),
			},
		],
		{
			deflate: true,
		},
	);
}

/** Basel-Stadt's homes; day centres are on the list and left out. */
function baselHomes(): Buffer {
	const features = Array.from({ length: 11 }, (_, index): FeatureInput => {
		const postcode = index % 3 === 2 ? "4125" : "4056";
		const category =
			index === 9 ? "Tageseinrichtung" : index === 10 ? "Abteilung Langzeitpflege" : "Pflegeheim";
		return {
			properties: {
				ID: index + 1,
				Name: index === 0 ? "Pflegezentrum Muster Basel" : `Pflegeheim Beispiel ${index + 1}`,
				Kategorie: category,
				Anmeldung: "https://www.example.ch/anmeldung",
				Adresse:
					index === 0 ? "Musterstrasse  15, 4056" : `Beispielgasse  ${index + 1}, ${postcode}`,
				Gemeinde: postcode === "4125" ? "Riehen" : "Basel",
				Telefon: `061 999 ${String(60 + index).padStart(2, "0")} 00`,
				Homepage: "https://www.example.ch",
			},
			point: near(postcode, index),
		};
	});
	return writeStoredZip(
		[
			{
				name: "alterspflegeheime.geojson",
				data: Buffer.from(featureCollection(features, "urn:ogc:def:crs:OGC:1.3:CRS84"), "utf8"),
			},
		],
		{ deflate: true },
	);
}

/** Zürich's homes: the statistics office's long CSV, two years, two figures per home and year. */
function zurichHomes(): string {
	const header = [
		"jahr",
		"bezirk_nr",
		"bezirk",
		"id",
		"betriebsname_bfs",
		"strasse",
		"plz",
		"ort",
		"leistungsauftrag",
		"leistungsauftrag_gmde",
		"latitude",
		"longitude",
		"indikator",
		"wert",
	];
	const lines = [header.map((cell) => `"${cell}"`).join(",")];
	for (const year of [2024, 2025]) {
		// A home closed after 2024 is only in the earlier year.
		const count = year === 2024 ? 33 : 32;
		for (let index = 0; index < count; index++) {
			const winterthur = index % 3 === 0;
			const postcode = winterthur ? "8400" : index % 2 ? "8008" : "8001";
			const [lon, lat] = near(postcode, index);
			const id = (0xa0000000 + index).toString(16);
			for (const [indicator, value] of [
				["anz_bewohnende", 40 + index],
				["anz_plaetze", 50 + index],
			] as const) {
				lines.push(
					[
						year,
						`"${winterthur ? "110" : "112"}"`,
						`"${winterthur ? "Bezirk Winterthur" : "Bezirk Zürich"}"`,
						`"${id}"`,
						`"${index === 0 ? "Alterszentrum Musterhof" : `Pflegezentrum Fiktiv ${index + 1}`}"`,
						`"Musterhofweg ${index + 1}"`,
						postcode,
						`"${winterthur ? "Winterthur" : "Zürich"}"`,
						'"ja"',
						`"${winterthur ? "Winterthur" : "Zürich"}"`,
						lat,
						lon,
						`"${indicator}"`,
						value,
					].join(","),
				);
			}
		}
	}
	return `${lines.join("\r\n")}\r\n`;
}

/** WGS 84 to LV95 near the fixtures (the inverse of swisstopo's approximate formulas, rounded). */
function toLv95([lon, lat]: [number, number]): { x: number; y: number } {
	const phi = (lat * 3600 - 169028.66) / 10000;
	const lambda = (lon * 3600 - 26782.5) / 10000;
	const east =
		2600072.37 +
		211455.93 * lambda -
		10938.51 * lambda * phi -
		0.36 * lambda * phi * phi -
		44.54 * lambda ** 3;
	const north =
		1200147.07 +
		308807.95 * phi +
		3745.25 * lambda * lambda +
		76.63 * phi * phi -
		194.56 * lambda * lambda * phi +
		119.79 * phi ** 3;
	return { x: Math.round(east * 10) / 10, y: Math.round(north * 10) / 10 };
}

/** Jura's institutions: a ZIP holding the shapefile (Windows-1252 DBF, LV95 points) and other files. */
function juraInstitutions(): Buffer {
	const fields = [
		{ name: "OBJECTID", type: "C", length: 10 },
		{ name: "TYPE", type: "C", length: 60 },
		{ name: "NOM_SITE", type: "C", length: 80 },
		{ name: "NOM_COMPLE", type: "C", length: 80 },
		{ name: "ADRESSE", type: "C", length: 60 },
		{ name: "NPA_COMMUN", type: "C", length: 40 },
		{ name: "EMAIL", type: "C", length: 40 },
		{ name: "TEL", type: "C", length: 20 },
		{ name: "USER_MISE_", type: "C", length: 20 },
	];
	const rows: [string, string, string, string, string][] = [
		[
			"Hôpital",
			"Hôpital Exemple du Jura - site de Delémont",
			"Faubourg de l'Exemple 30",
			"2800 Delémont",
			"032 999 21 21",
		],
		[
			"Etablissement médico-social (EMS)",
			"EMS Les Exemples",
			"Route de l'Exemple 68",
			"2800 Delémont",
			"032 999 11 33",
		],
		[
			"Etablissement médico-social (EMS)",
			"EMS Le Modèle",
			"Chemin du Modèle 3",
			"2900 Porrentruy",
			"032 999 25 00",
		],
		["Home médicalisé", "Home Exemple", "Rue de l'Exemple 6", "2900 Porrentruy", "032 999 12 22"],
		["Home médicalisé", "Home Fictif", "Rue Fictive 2", "2800 Delémont", "032 999 13 22"],
		["Maison de naissances", "Maison de naissance Exemple", "", "", ""],
		[
			"Centre médico-psychologique - unité psychiatrique",
			"CMP Exemple",
			"Rue du Centre 1",
			"2800 Delémont",
			"032 999 14 00",
		],
		[
			"Appartements protégés pour personnes âgées",
			"Appartements Exemple",
			"Rue des Appartements 2",
			"2900 Porrentruy",
			"",
		],
		[
			"Etablissement médico-social (EMS)",
			"EMS La Fiction",
			"Chemin de la Fiction 8",
			"2800 Delémont",
			"032 999 15 00",
		],
	];
	const records = rows.map(([type, name, address, place, phone], index) => ({
		OBJECTID: String(index + 1),
		TYPE: type,
		NOM_SITE: name,
		NOM_COMPLE: "",
		ADRESSE: address,
		NPA_COMMUN: place,
		EMAIL: phone ? "erika.fiktiva@example.ch" : "",
		TEL: phone,
		USER_MISE_: "fixture_user",
	}));
	const points = rows.map(([, , , place], index) =>
		toLv95(near(place.slice(0, 4) || "2800", index)),
	);
	const dir = "SSA_19_04_Institutions_de_soins_et_de_sante/donnees.shp";
	return writeStoredZip(
		[
			{
				name: "SSA_19_04_Institutions_de_soins_et_de_sante/DateExport.txt",
				data: Buffer.from("Date d’exportation des données: 01.11.2026\n", "utf8"),
			},
			{
				name: `${dir}/rcju_autre.ssa_19_04_centre_hospitalier.dbf`,
				data: writeDbf(fields, records, { encoding: "latin1" }),
			},
			{ name: `${dir}/rcju_autre.ssa_19_04_centre_hospitalier.shp`, data: writeShpPoints(points) },
			// The generalised layers of the same file, not read.
			{
				name: `${dir}/rcju_autre.ssa_19_04_centre_hospitalier_50000.dbf`,
				data: writeDbf(fields, [], { encoding: "latin1" }),
			},
		],
		{ deflate: true },
	);
}

export function generateChFixtures(dir: string = CH_FIXTURES): void {
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "bfs-gemeinden.csv"), communeRegister());
	writeFileSync(join(dir, "plz.zip"), postcodeDirectory());
	writeFileSync(join(dir, "bag-kzp.xlsx"), bagWorkbook());
	writeFileSync(join(dir, "be-spitaeler.geojson"), bernHospitals());
	writeFileSync(join(dir, "be-heime.geojson"), bernHomes());
	writeFileSync(join(dir, "ge-hopitaux.zip"), genevaHospitals());
	writeFileSync(join(dir, "ge-ems.zip"), genevaHomes());
	writeFileSync(join(dir, "ge-pharmacies.geojson"), genevaPharmacies());
	writeFileSync(join(dir, "bl-apotheken.geojson"), baselLandPharmacies());
	writeFileSync(join(dir, "bl-heime.geojson"), baselLandHomes());
	writeFileSync(join(dir, "bs-spitaeler.zip"), baselHospitals());
	writeFileSync(join(dir, "bs-heime.zip"), baselHomes());
	writeFileSync(join(dir, "zh-heime.csv"), zurichHomes());
	writeFileSync(join(dir, "ju-institutions.zip"), juraInstitutions());
}

if (import.meta.main) {
	generateChFixtures();
	console.log(`Swiss fixtures written to ${CH_FIXTURES}`);
}
