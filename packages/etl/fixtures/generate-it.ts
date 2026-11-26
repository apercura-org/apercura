/**
 * Generates the SYNTHETIC fixtures in `fixtures/it/`: the three lists of the Ministry of Health
 * in their exact formats (the pharmacies' and parapharmacies' daily CSV files, the hospital bed
 * counts per facility, semicolon-separated, with the ministry's quoting, HTML entities, decimal
 * commas, mixed encodings and padded columns) and a small archive of ISTAT's boundaries (the
 * three layers `etl:places --country it` reads), filled with fictitious places.
 *
 * Every place is made up: names are made-up words (Esempio, Prova, Fittizio, Campione, Modello,
 * Immaginario…), the pharmacists some company names carry are invented ("DOTT.RI FITTIZIO MARIO
 * E PROVA ANNA"), streets do not exist, pharmacy codes start at 9000001, parapharmacy codes at
 * 900001 and hospital codes at 990001 (above the real lists' ranges), and every line carries a
 * made-up VAT number starting with 999 so the tests can check it is never stored. Never commit
 * real rows. Run with `bun run --cwd packages/etl fixtures:it`.
 *
 * The regions, provinces and municipalities are real public ISTAT names and codes; their shapes
 * are squares around their real interior points (WGS 84 / UTM 32N), not their boundaries.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type ShpRing, writeDbf, writeShpPolygons } from "../src/lib/shapefile";
import { writeStoredZip } from "../src/lib/zip";

export const IT_FIXTURES = join(import.meta.dirname, "it");

/** The twenty regions: ISTAT code and name as ISTAT writes it. */
const REGIONS: [string, string][] = [
	["1", "Piemonte"],
	["2", "Valle d'Aosta/Vallée d'Aoste"],
	["3", "Lombardia"],
	["4", "Trentino-Alto Adige/Südtirol"],
	["5", "Veneto"],
	["6", "Friuli-Venezia Giulia"],
	["7", "Liguria"],
	["8", "Emilia-Romagna"],
	["9", "Toscana"],
	["10", "Umbria"],
	["11", "Marche"],
	["12", "Lazio"],
	["13", "Abruzzo"],
	["14", "Molise"],
	["15", "Campania"],
	["16", "Puglia"],
	["17", "Basilicata"],
	["18", "Calabria"],
	["19", "Sicilia"],
	["20", "Sardegna"],
];

/** Supra-municipal units: region, COD_UTS, name, abbreviation, kind. */
const PROVINCES: [string, string, string, string, string][] = [
	["1", "201", "Torino", "TO", "Città metropolitana"],
	["2", "7", "Valle d'Aosta/Vallée d'Aoste", "AO", "Provincia"],
	["3", "215", "Milano", "MI", "Città metropolitana"],
	["4", "21", "Bolzano/Bozen", "BZ", "Provincia autonoma"],
	["12", "258", "Roma", "RM", "Città metropolitana"],
	["15", "263", "Napoli", "NA", "Città metropolitana"],
];

/** Municipalities: region, COD_UTS, code, name, other-language name, capital, UTM 32N point. */
const MUNICIPALITIES: [string, string, string, string, string, boolean, number, number][] = [
	["1", "201", "001156", "Moncalieri", "", false, 397729, 4982480],
	["1", "201", "001272", "Torino", "", true, 395928, 4991771],
	["2", "7", "007003", "Aosta", "", true, 367873, 5067617],
	["3", "215", "015146", "Milano", "", true, 513527, 5035001],
	["3", "215", "015209", "Sesto San Giovanni", "", false, 518928, 5042419],
	["4", "21", "021008", "Bolzano/Bozen", "Bozen", true, 680259, 5150701],
	["12", "258", "058057", "Marino", "", false, 801240, 4629567],
	["12", "258", "058091", "Roma", "", true, 787263, 4642611],
	["12", "258", "058120", "Fiumicino", "", false, 767843, 4642335],
	["15", "263", "063049", "Napoli", "", true, 941703, 4536077],
	["15", "263", "063060", "Pozzuoli", "", false, 930174, 4534673],
];

/** A square of 2 × `half` metres around a point, clockwise (a shapefile's outer ring). */
function square(x: number, y: number, half = 1_500): ShpRing {
	return [
		{ x: x - half, y: y - half },
		{ x: x - half, y: y + half },
		{ x: x + half, y: y + half },
		{ x: x + half, y: y - half },
		{ x: x - half, y: y - half },
	];
}

/** The archive of ISTAT's boundaries: the three layers' attribute tables, the municipalities' shapes. */
export function istatZip(): Buffer {
	const reg = writeDbf(
		[
			{ name: "COD_RIP", type: "N", length: 10 },
			{ name: "COD_REG", type: "N", length: 10 },
			{ name: "DEN_REG", type: "C", length: 50 },
		],
		REGIONS.map(([code, name]) => ({ COD_RIP: "1", COD_REG: code, DEN_REG: name })),
	);
	const prov = writeDbf(
		[
			{ name: "COD_REG", type: "N", length: 10 },
			{ name: "COD_UTS", type: "N", length: 10 },
			{ name: "DEN_UTS", type: "C", length: 50 },
			{ name: "SIGLA", type: "C", length: 2 },
			{ name: "TIPO_UTS", type: "C", length: 50 },
		],
		PROVINCES.map(([region, code, name, sigla, kind]) => ({
			COD_REG: region,
			COD_UTS: code,
			DEN_UTS: name,
			SIGLA: sigla,
			TIPO_UTS: kind,
		})),
	);
	const com = writeDbf(
		[
			{ name: "COD_REG", type: "N", length: 10 },
			{ name: "COD_UTS", type: "N", length: 10 },
			{ name: "PRO_COM_T", type: "C", length: 6 },
			{ name: "COMUNE", type: "C", length: 100 },
			{ name: "COMUNE_A", type: "C", length: 100 },
			{ name: "CC_UTS", type: "N", length: 10 },
		],
		MUNICIPALITIES.map(([region, uts, code, name, other, capital]) => ({
			COD_REG: region,
			COD_UTS: uts,
			PRO_COM_T: code,
			COMUNE: name,
			COMUNE_A: other,
			CC_UTS: capital ? "1" : "0",
		})),
	);
	const shapes = writeShpPolygons(MUNICIPALITIES.map(([, , , , , , x, y]) => [square(x, y)]));
	return writeStoredZip([
		{ name: "Reg01012026_g/Reg01012026_g_WGS84.dbf", data: reg },
		{ name: "ProvCM01012026_g/ProvCM01012026_g_WGS84.dbf", data: prov },
		{ name: "Com01012026_g/Com01012026_g_WGS84.dbf", data: com },
		{ name: "Com01012026_g/Com01012026_g_WGS84.shp", data: shapes },
	]);
}

/** Where a place is, as the ministry writes it. */
type Town = {
	code: string;
	comune: string;
	province: string;
	sigla: string;
	region: string;
	regionName: string;
	cap: string;
	lat: number;
	lng: number;
};

const town = (
	code: string,
	comune: string,
	province: string,
	sigla: string,
	region: string,
	regionName: string,
	cap: string,
	lat: number,
	lng: number,
): Town => ({ code, comune, province, sigla, region, regionName, cap, lat, lng });

export const TOWNS = {
	roma: town("058091", "ROMA", "ROMA", "RM", "120", "LAZIO", "00184", 41.8986, 12.4964),
	fiumicino: town("058120", "FIUMICINO", "ROMA", "RM", "120", "LAZIO", "00054", 41.7711, 12.2276),
	marino: town("058057", "MARINO", "ROMA", "RM", "120", "LAZIO", "00047", 41.7695, 12.6595),
	milano: town("015146", "MILANO", "MILANO", "MI", "030", "LOMBARDIA", "20121", 45.4642, 9.19),
	sesto: town(
		"015209",
		"SESTO SAN GIOVANNI",
		"MILANO",
		"MI",
		"030",
		"LOMBARDIA",
		"20099",
		45.5333,
		9.2333,
	),
	torino: town("001272", "TORINO", "TORINO", "TO", "010", "PIEMONTE", "10121", 45.0703, 7.6869),
	moncalieri: town(
		"001156",
		"MONCALIERI",
		"TORINO",
		"TO",
		"010",
		"PIEMONTE",
		"10024",
		44.9985,
		7.6825,
	),
	bolzano: town(
		"021008",
		"BOLZANO/BOZEN",
		"BOLZANO",
		"BZ",
		"041",
		"PROV. AUTON. BOLZANO",
		"39100",
		46.4983,
		11.3548,
	),
	aosta: town("007003", "AOSTA", "AOSTA", "AO", "020", "VALLE D'AOSTA", "11100", 45.7372, 7.3206),
	napoli: town("063049", "NAPOLI", "NAPOLI", "NA", "150", "CAMPANIA", "80133", 40.8518, 14.2681),
	pozzuoli: town(
		"063060",
		"POZZUOLI",
		"NAPOLI",
		"NA",
		"150",
		"CAMPANIA",
		"80078",
		40.8227,
		14.1214,
	),
} as const;

/** A pharmacy or parapharmacy line. */
export type ItShopCase = {
	id: string;
	/** The company or shop name, as the ministry writes it. */
	name: string;
	street: string;
	town: Town;
	/** Pharmacy type (`codice_tipologia`), pharmacies only. */
	type?: "1" | "2" | "3" | "4";
	hamlet?: string;
	/** `dd/mm/yyyy` start and end of validity ("-": open-ended). */
	start?: string;
	end?: string;
	/** Coordinates published (`localizzazione` 1), else none. */
	located?: boolean;
	/** The municipality code the list writes, when not the town's (a renumbered municipality). */
	code?: string;
	/** The municipality name the list writes, when not the town's. */
	comune?: string;
	/** Written in Latin-1 in a file otherwise in UTF-8. */
	latin1?: boolean;
};

/** A hospital or clinic: one line per area of inpatient care. */
export type ItHospitalCase = {
	id: string;
	name: string;
	street: string;
	town: Town;
	typeCode: string;
	typeLabel: string;
	beds: [area: "ACUTI" | "RIABILITAZIONE" | "LUNGODEGENZA", total: number][];
};

const TYPE_LABELS: Record<string, string> = {
	"1": "Ordinaria",
	"2": "Succursale",
	"3": "Dispensario",
	"4": "Dispensario stagionale",
};

/** The pharmacies the tests name, then fillers. */
export const IT_PHARMACY_ANCHORS: ItShopCase[] = [
	{
		id: "9000001",
		name: "FARMACIA ESEMPIO S.N.C. DEI DOTT.RI FITTIZIO MARIO E PROVA ANNA",
		street: "VIA DELL'ESEMPIO, 1",
		town: TOWNS.roma,
		located: true,
	},
	{
		id: "9000002",
		name: "CAMPIONE DR.SSA MODELLO GIULIA",
		street: "Corso Fittizio, 22",
		town: TOWNS.milano,
		located: true,
	},
	{
		id: "9000003",
		name: "DISPENSARIO FARMACEUTICO PROVA",
		street: "Via del Campione, 3",
		town: TOWNS.fiumicino,
		type: "3",
		hamlet: "FREGENE",
	},
	{
		id: "9000004",
		name: "FARMACIA PROVA DI ESEMPIO ANNA &amp; C. S.A.S.",
		street: "Via Immaginaria; scala B, 4",
		town: TOWNS.roma,
		located: true,
	},
	{
		id: "9000005",
		// UTF-8 read as Windows-1252 and written again, as some of the ministry's lines are.
		name: "FARMACIA DELLA LIBERT\u00c3\u00a0",
		street: "Piazza della Libert\u00c3\u00a0, 5",
		town: TOWNS.napoli,
	},
	{
		// A municipality code ISTAT no longer lists: placed by its name in its region.
		id: "9000006",
		name: "FARMACIA MODELLO",
		street: "Via Modello, 6",
		town: TOWNS.roma,
		code: "058999",
	},
	{
		// Neither the code nor the name is ISTAT's: placed in its province only.
		id: "9000007",
		name: "FARMACIA BORGO IMMAGINARIO",
		street: "Via Immaginaria, 7",
		town: TOWNS.milano,
		code: "015999",
		comune: "BORGO IMMAGINARIO",
	},
	{
		// Closed in 2020: never imported.
		id: "9000008",
		name: "FARMACIA CHIUSA",
		street: "Via Chiusa, 8",
		town: TOWNS.torino,
		start: "01/01/2005",
		end: "31/12/2020",
	},
	{
		// Opens in 2099: not yet.
		id: "9000009",
		name: "FARMACIA FUTURA",
		street: "Via Futura, 9",
		town: TOWNS.torino,
		start: "01/01/2099",
	},
	{
		id: "9000010",
		name: "FARMACIA CITTÀ DI PROVA",
		street: "Via della Città, 10",
		town: TOWNS.torino,
		latin1: true,
	},
	{
		id: "9000011",
		name: "DISPENSARIO STAGIONALE ESEMPIO",
		street: "Lungomare Fittizio, 11",
		town: TOWNS.pozzuoli,
		type: "4",
	},
	{
		id: "9000012",
		name: "STADTAPOTHEKE BEISPIEL O.H.G. DES DR. MUSTER",
		street: "Musterplatz 12",
		town: TOWNS.bolzano,
		located: true,
	},
	{ id: "9000013", name: "FARMACIA OBIEZIONE", street: "Via Riservata, 13", town: TOWNS.milano },
	{ id: "9000014", name: "FARMACIA ASSENTE", street: "Via Assente, 14", town: TOWNS.roma },
	{
		id: "9000015",
		name: "FARMACIA SUCCURSALE CAMPIONE",
		street: "Via Campione, 15",
		town: TOWNS.aosta,
		type: "2",
	},
];

const WORDS = ["Esempio", "Prova", "Fittizio", "Campione", "Modello", "Immaginario", "Finto"];
const SAINTS = ["San Prova", "Santa Esempia", "Sant'Immaginario", "San Campione"];

/** Fillers: pharmacies spread over the towns, enough for listings of three and more. */
function pharmacyFillers(suffix = ""): ItShopCase[] {
	const spread: [Town, number][] = [
		[TOWNS.roma, 36],
		[TOWNS.milano, 22],
		[TOWNS.torino, 14],
		[TOWNS.napoli, 14],
		[TOWNS.fiumicino, 5],
		[TOWNS.marino, 4],
		[TOWNS.sesto, 5],
		[TOWNS.moncalieri, 4],
		[TOWNS.bolzano, 5],
		[TOWNS.aosta, 4],
		[TOWNS.pozzuoli, 4],
	];
	const cases: ItShopCase[] = [];
	let n = 0;
	for (const [where, count] of spread) {
		for (let index = 0; index < count; index++) {
			n++;
			const word = WORDS[n % WORDS.length] ?? "Esempio";
			const saint = SAINTS[n % SAINTS.length] ?? "San Prova";
			const name =
				n % 3 === 0
					? `FARMACIA ${saint.toUpperCase()} S.N.C. DEL DOTT. ${word.toUpperCase()} LUCA`
					: n % 3 === 1
						? `${word.toUpperCase()} ${n}`
						: `Farmacia ${word} ${n} S.r.l.`;
			cases.push({
				id: String(9_000_100 + n),
				name,
				street: `Via del Riempimento${suffix}, ${n}`,
				town: where,
				located: n % 4 !== 0,
			});
		}
	}
	return cases;
}

/** The parapharmacies the tests name, then fillers. */
export const IT_PARAPHARMACY_ANCHORS: ItShopCase[] = [
	{
		id: "900001",
		name: "PARAFARMACIA ESEMPIO DOTT.SSA PROVA LUCIA",
		street: "Via Esempio, 1",
		town: TOWNS.roma,
		located: true,
	},
	{
		id: "900002",
		name: "Corner Salute Campione srl",
		street: "Viale Campione, 2",
		town: TOWNS.milano,
	},
	{
		id: "900003",
		name: "PARAFARMACIA CHIUSA",
		street: "Via Chiusa, 3",
		town: TOWNS.napoli,
		start: "01/10/2006",
		end: "31/01/2014",
	},
];

function parapharmacyFillers(suffix = ""): ItShopCase[] {
	const spread: [Town, number][] = [
		[TOWNS.roma, 10],
		[TOWNS.milano, 8],
		[TOWNS.napoli, 6],
		[TOWNS.torino, 6],
	];
	const cases: ItShopCase[] = [];
	let n = 0;
	for (const [where, count] of spread) {
		for (let index = 0; index < count; index++) {
			n++;
			cases.push({
				id: String(900_100 + n),
				name:
					n % 2 === 0
						? `PARAFARMACIA ${WORDS[n % WORDS.length]?.toUpperCase()} ${n}`
						: `Salute ${n}`,
				street: `Via della Parafarmacia${suffix}, ${n}`,
				town: where,
				located: n % 3 !== 0,
			});
		}
	}
	return cases;
}

export const IT_HOSPITALS: ItHospitalCase[] = [
	{
		id: "990001",
		name: "OSPEDALE ESEMPIO",
		street: "VIA DELL'OSPEDALE ESEMPIO 1",
		town: TOWNS.roma,
		typeCode: "1",
		typeLabel: "Ospedale a gestione diretta",
		beds: [
			["ACUTI", 250],
			["RIABILITAZIONE", 20],
		],
	},
	{
		id: "990002",
		name: "AZIENDA OSPEDALIERA PROVA",
		street: "PIAZZA PROVA 2",
		town: TOWNS.roma,
		typeCode: "0",
		typeLabel: "Azienda Ospedaliera",
		beds: [["ACUTI", 600]],
	},
	{
		id: "990003",
		name: "CASA DI CURA VILLA CAMPIONE S.R.L.",
		street: "VIA DELLA VILLA 3",
		town: TOWNS.roma,
		typeCode: "5.1",
		typeLabel: "Casa di cura privata accreditata",
		beds: [
			["RIABILITAZIONE", 80],
			["LUNGODEGENZA", 1],
		],
	},
	{
		id: "990004",
		name: 'CASA DI CURA "MODELLO"',
		street: "VIA MODELLO 4",
		town: TOWNS.roma,
		typeCode: "5.1",
		typeLabel: "Casa di cura privata accreditata",
		beds: [["ACUTI", 40]],
	},
	{
		id: "990005",
		name: "UNIVERSITA' DI ESEMPIO POLICLINICO",
		street: "VIALE DELL'UNIVERSITA 5",
		town: TOWNS.roma,
		typeCode: "2.1",
		typeLabel: "Azienda Ospedaliera universitaria integrata con il Servizio Sanitario Nazionale",
		beds: [
			["ACUTI", 900],
			["LUNGODEGENZA", 30],
		],
	},
	{
		id: "990006",
		name: "CASA DI CURA SANT`ESEMPIO",
		street: "VIA SANT'ESEMPIO 6",
		town: TOWNS.roma,
		typeCode: "5.1",
		typeLabel: "Casa di cura privata accreditata",
		beds: [["ACUTI", 60]],
	},
	{
		id: "990007",
		name: "IRCCS ISTITUTO PROVA",
		street: "VIA PROVA 7",
		town: TOWNS.milano,
		typeCode: "3.1",
		typeLabel: "IRCCS pubblico",
		beds: [["ACUTI", 300]],
	},
	{
		id: "990008",
		name: "OSPEDALE FITTIZIO MILANO",
		street: "VIA FITTIZIA 8",
		town: TOWNS.milano,
		typeCode: "1",
		typeLabel: "Ospedale a gestione diretta",
		beds: [["ACUTI", 200]],
	},
	{
		id: "990009",
		name: "PRESIDIO OSPEDALIERO CAMPIONE",
		street: "VIA CAMPIONE 9",
		town: TOWNS.milano,
		typeCode: "1",
		typeLabel: "Ospedale a gestione diretta",
		beds: [["ACUTI", 150]],
	},
	{
		id: "990010",
		name: "OSPEDALE MODELLO NAPOLI",
		street: "VIA MODELLO 10",
		town: TOWNS.napoli,
		typeCode: "1",
		typeLabel: "Ospedale a gestione diretta",
		beds: [["ACUTI", 400]],
	},
	{
		id: "990011",
		name: "OSPEDALE IMMAGINARIO TORINO",
		street: "CORSO IMMAGINARIO 11",
		town: TOWNS.torino,
		typeCode: "4",
		typeLabel:
			"Ospedale classificato o assimilato ai sensi dell'art. 1, ultimo comma, della Legge 132/1968",
		beds: [["ACUTI", 120]],
	},
];

export type ItFixtureSet = {
	pharmacies: ItShopCase[];
	parapharmacies: ItShopCase[];
	hospitals: ItHospitalCase[];
	/** Appended to every filler's street, to change many pages at once (circuit breaker tests). */
	fillerStreetSuffix?: string;
};

export function itFixtureSet(suffix = ""): ItFixtureSet {
	return {
		pharmacies: [...IT_PHARMACY_ANCHORS, ...pharmacyFillers(suffix)],
		parapharmacies: [...IT_PARAPHARMACY_ANCHORS, ...parapharmacyFillers(suffix)],
		hospitals: IT_HOSPITALS,
		fillerStreetSuffix: suffix,
	};
}

export const IT_PLACES: ItFixtureSet = itFixtureSet();

/** The pharmacies and parapharmacies open in a set (closed and future ones left out). */
export function openShops(cases: readonly ItShopCase[]): ItShopCase[] {
	return cases.filter(
		(shop) => (!shop.end || shop.end === "-") && !(shop.start ?? "").endsWith("2099"),
	);
}

const quote = (value: string) => (/[;"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
const decimal = (value: number) => value.toFixed(6).replace(".", ",");
const vat = (id: string) => `999${id.padStart(8, "0")}`.slice(0, 11);

const FARMACIE_HEADER =
	"cod_farmacia;cod_farmacia_asl;indirizzo;descrizione_farmacia;p_iva;cap;cod_comune;comune;frazione;cod_provincia;sigla_provincia;provincia;cod_regione;regione;data_inizio_validita;data_fine_validita;descrizione_tipologia;codice_tipologia;latitudine;longitudine;localizzazione";

/** One line of the pharmacies' list, as bytes (UTF-8, or Latin-1 for `latin1`). */
function pharmacyLine(shop: ItShopCase, offset: number): Buffer {
	const type = shop.type ?? "1";
	const point = shop.located
		? [decimal(shop.town.lat + offset), decimal(shop.town.lng + offset), "1"]
		: ["-", "-", "2"];
	const line = [
		shop.id,
		"00000",
		quote(shop.street),
		quote(shop.name),
		vat(shop.id),
		shop.town.cap,
		shop.code ?? shop.town.code,
		shop.comune ?? shop.town.comune,
		shop.hamlet ?? "-",
		(shop.code ?? shop.town.code).slice(0, 3),
		shop.town.sigla,
		shop.town.province,
		shop.town.region,
		shop.town.regionName,
		shop.start ?? "01/01/2015",
		shop.end ?? "-",
		TYPE_LABELS[type] ?? "Ordinaria",
		type,
		...point,
	].join(";");
	return Buffer.from(`${line}\n`, shop.latin1 ? "latin1" : "utf8");
}

/** The pharmacies' list: every pharmacy, and before some of them a closed line of another owner. */
export function farmacieCsv(set: ItFixtureSet = IT_PLACES): Buffer {
	const parts: Buffer[] = [Buffer.from(`${FARMACIE_HEADER}\n`)];
	set.pharmacies.forEach((shop, index) => {
		if (index % 5 === 0 && !shop.end) {
			parts.push(
				pharmacyLine(
					{
						...shop,
						name: `${shop.name.split(" ")[0]} DEL DOTT. PRECEDENTE ${index}`,
						start: "01/01/2001",
						end: "31/12/2014",
					},
					0,
				),
			);
		}
		parts.push(pharmacyLine(shop, (index % 7) * 0.001));
	});
	return Buffer.concat(parts);
}

const PARAFARMACIE_HEADER =
	"codice_identificativo_sito;sito_logistico;indirizzo;partita_iva;cap;codice_comune;comune;codice_provincia;sigla_provincia;provincia;codice_regione;regione;data_inizio_validita;data_fine_validita;latitudine;longitudine;localizzazione";

/** The parapharmacies' list (UTF-8). */
export function parafarmacieCsv(set: ItFixtureSet = IT_PLACES): Buffer {
	const lines = [PARAFARMACIE_HEADER];
	set.parapharmacies.forEach((shop, index) => {
		const point = shop.located
			? [decimal(shop.town.lat - index * 0.0005), decimal(shop.town.lng + index * 0.0005), "1"]
			: ["-", "-", "2"];
		lines.push(
			[
				shop.id,
				quote(shop.name),
				quote(shop.street),
				vat(shop.id),
				shop.town.cap,
				shop.town.code,
				shop.town.comune,
				shop.town.code.slice(0, 3),
				shop.town.sigla,
				shop.town.province,
				shop.town.region,
				shop.town.regionName,
				shop.start ?? "01/10/2010",
				shop.end ?? "-",
				...point,
			].join(";"),
		);
	});
	return Buffer.from(`${lines.join("\n")}\n`, "utf8");
}

const POSTI_LETTO_HEADER =
	"Anno;Codice Regione;Descrizione Regione;Codice Azienda;Tipo Azienda;Codice struttura;Denominazione struttura;Indirizzo;Codice Comune;Comune;Sigla provincia;Codice tipo struttura;Descrizione tipo struttura;Tipo di Disciplina;Posti letto degenza ordinaria;Posti letto degenza a pagamento;Posti letto Day Hospital;Posti letto Day Surgery;Totale posti letto";

/** A column padded to its fixed width, as the bed counts write names, streets and towns. */
const padded = (value: string) => value.padEnd(40, " ");

/** The hospital bed counts (Latin-1, CRLF, padded columns), one line per area of care. */
export function postiLettoCsv(set: ItFixtureSet = IT_PLACES): Buffer {
	const lines = [POSTI_LETTO_HEADER];
	for (const hospital of set.hospitals) {
		for (const [area, total] of hospital.beds) {
			lines.push(
				[
					"2023",
					hospital.town.region,
					hospital.town.regionName,
					"901",
					hospital.typeCode.startsWith("5") ? "2" : "1",
					hospital.id,
					quote(padded(hospital.name)),
					quote(padded(hospital.street)),
					hospital.town.code,
					padded(hospital.town.comune),
					hospital.town.sigla,
					hospital.typeCode,
					quote(hospital.typeLabel),
					area,
					String(total),
					"0",
					"0",
					"0",
					String(total),
				].join(";"),
			);
		}
	}
	return Buffer.from(`${lines.join("\r\n")}\r\n`, "latin1");
}

export function writeItFixtures(dir: string = IT_FIXTURES, set: ItFixtureSet = IT_PLACES) {
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "farmacie.csv"), farmacieCsv(set));
	writeFileSync(join(dir, "parafarmacie.csv"), parafarmacieCsv(set));
	writeFileSync(join(dir, "posti-letto.csv"), postiLettoCsv(set));
	writeFileSync(join(dir, "istat-confini.zip"), istatZip());
}

if (import.meta.main) {
	writeItFixtures();
	console.log(`Wrote the Italian fixtures to ${IT_FIXTURES}`);
}
