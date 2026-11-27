/**
 * Generates the SYNTHETIC fixtures in `fixtures/ee/`: the Health Board's register in its exact
 * format (`od_asutused.xml`: providers, licences, places of activity, services and the health
 * workers registered with each provider), the State Agency of Medicines' pharmacies' export
 * (`apteekide_koondandmed.csv`, `;`, quoted, a BOM), the Land Board's address file
 * (`sihtnumbrid.zip`, a CSV with points in L-EST97) and the settlements' shapefile that
 * `etl:places --country ee` reads (`asustusyksus_shp.zip`, its table in Windows-1257).
 *
 * Every provider, pharmacy, person and street is made up: names say they are examples (Näidis,
 * Näide, Example), licence numbers and place codes start from numbers no real row uses, phone
 * numbers are in a range of their own, and each provider names made-up health workers and each
 * pharmacy a made-up pharmacist, e-mail and licence holder, so the tests can check they are
 * never stored. Never commit real rows. Deterministic: the same files on every run. Run with
 * `bun run --cwd packages/etl fixtures:ee`.
 *
 * The counties, municipalities and settlements are real EHAK codes and names, each drawn as a
 * small square around its real centre.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeDbf, writeShpPolygons } from "../src/lib/shapefile";
import { writeStoredZip } from "../src/lib/zip";
import { wgs84ToLest97 } from "../src/sources/ee/lest97";

export const EE_FIXTURES = join(import.meta.dirname, "ee");

/** Settlements of the fixture: code, name, municipality code and name, county code and name, centre. */
export const EE_SETTLEMENTS: [string, string, string, string, string, string, number, number][] = [
	["0298", "Kesklinna linnaosa", "0784", "Tallinn", "0037", "Harju maakond", 59.4133, 24.7653],
	["0387", "Lasnamäe linnaosa", "0784", "Tallinn", "0037", "Harju maakond", 59.4339, 24.8518],
	["0296", "Keila linn", "0296", "Keila linn", "0037", "Harju maakond", 59.3118, 24.3932],
	["1675", "Haabneeme alevik", "0890", "Viimsi vald", "0037", "Harju maakond", 59.5152, 24.8233],
	["8151", "Tartu linn", "0793", "Tartu linn", "0079", "Tartu maakond", 58.3701, 26.7286],
	["2049", "Ilmatsalu küla", "0793", "Tartu linn", "0079", "Tartu maakond", 58.3998, 26.5319],
	["6619", "Pärnu linn", "0624", "Pärnu linn", "0068", "Pärnu maakond", 58.384, 24.5258],
	["3655", "Kuressaare linn", "0714", "Saaremaa vald", "0074", "Saare maakond", 58.2489, 22.4903],
	["0511", "Narva linn", "0511", "Narva linn", "0045", "Ida-Viru maakond", 59.3477, 28.1137],
	[
		"0120",
		"Ahtme linnaosa",
		"0321",
		"Kohtla-Järve linn",
		"0045",
		"Ida-Viru maakond",
		59.3229,
		27.4349,
	],
	["1900", "Hullo küla", "0907", "Vormsi vald", "0056", "Lääne maakond", 58.9947, 23.2417],
];

/** The date of the settlements' data (`EKSPORT`). */
export const EE_FIXTURE_PLACES_DATE = "20261101";

export type EeAddress = {
	adrId: string;
	postcode: string;
	short: string;
	full: string;
	latitude: number;
	longitude: number;
};

/** The address file's rows the providers and pharmacies are located at. */
export const EE_ADDRESSES: EeAddress[] = [
	{
		adrId: "9000001",
		postcode: "50410",
		short: "Näidise tn 1",
		full: "Tartu maakond, Tartu linn, Tartu linn, Näidise tn 1",
		latitude: 58.3712,
		longitude: 26.7301,
	},
	{
		adrId: "9000002",
		postcode: "10117",
		short: "Näite pst 7",
		full: "Harju maakond, Tallinn, Kesklinna linnaosa, Näite pst 7",
		latitude: 59.4371,
		longitude: 24.7536,
	},
	{
		adrId: "9000003",
		postcode: "76607",
		short: "Näidise tn 2b",
		full: "Harju maakond, Keila linn, Näidise tn 2b",
		latitude: 59.3121,
		longitude: 24.4011,
	},
	{
		adrId: "9000004",
		postcode: "80010",
		short: "Näidise pst 8",
		full: "Pärnu maakond, Pärnu linn, Pärnu linn, Näidise pst 8",
		latitude: 58.3851,
		longitude: 24.5011,
	},
	{
		adrId: "9000005",
		postcode: "93815",
		short: "Näite tn 3",
		full: "Saare maakond, Saaremaa vald, Kuressaare linn, Näite tn 3",
		latitude: 58.2532,
		longitude: 22.4855,
	},
	{
		adrId: "9000006",
		postcode: "74001",
		short: "Näidistee 4",
		full: "Harju maakond, Viimsi vald, Haabneeme alevik, Näidistee 4",
		latitude: 59.5101,
		longitude: 24.8222,
	},
	{
		adrId: "9000007",
		postcode: "20309",
		short: "Näite tn 5",
		full: "Ida-Viru maakond, Narva linn, Näite tn 5",
		latitude: 59.3791,
		longitude: 28.1901,
	},
	{
		adrId: "9000008",
		postcode: "31025",
		short: "Näidise tn 6",
		full: "Ida-Viru maakond, Kohtla-Järve linn, Ahtme linnaosa, Näidise tn 6",
		latitude: 59.3301,
		longitude: 27.4211,
	},
	{
		adrId: "9000009",
		postcode: "10118",
		short: "Näite pst 9",
		full: "Harju maakond, Tallinn, Kesklinna linnaosa, Näite pst 9",
		latitude: 59.4366,
		longitude: 24.7601,
	},
];

/** A filler address in Lasnamäe (`Näidise tänav {n}`), in the address file. */
export const fillerAddress = (n: number): EeAddress => ({
	adrId: String(9100000 + n),
	postcode: "13917",
	short: `Näidise tn ${n + 10}`,
	full: `Harju maakond, Tallinn, Lasnamäe linnaosa, Näidise tn ${n + 10}`,
	latitude: 59.43 + (n % 50) * 0.0002,
	longitude: 24.84 + Math.floor(n / 50) * 0.0003,
});

export type EeLicenceCase = {
	number: string;
	kind: string;
	kindName: string;
	hospitalKind?: string;
	hospitalKindName?: string;
	from?: string;
	to?: string;
	places: { address: string; services: [string, string][] }[];
};

export type EeProviderCase = {
	registryCode: string;
	name: string;
	legalAddress: string;
	licences: EeLicenceCase[];
	/** Made-up health workers: never read. */
	workers: [string, string, string][];
};

export type EePharmacyCase = {
	name: string;
	address: string;
	adrId: string;
	kind: string;
	licence: string;
	code: string;
	pharmacist: string;
	phone: string;
	email: string;
	holder: string;
};

export type EeFixtureSet = {
	providers: EeProviderCase[];
	pharmacies: EePharmacyCase[];
	/** The register's extract time (`hetk`). */
	extract: string;
};

const SPECIALIST = { kind: "1", kindName: "Eriarstiabi" } as const;
const NURSING = { kind: "2", kindName: "Õendusabi" } as const;
const GENERAL = { kind: "7", kindName: "Üldarstiabi" } as const;
const FAMILY_LIST: [string, string] = ["TPmed", "perearstiabi osutamine perearsti nimistu alusel"];
const DENTAL: [string, string] = ["T0003", "hambaraviteenused"];
const SCHOOL: [string, string] = ["T0001", "koolitervishoiuteenus"];
const WORKERS: [string, string, string][] = [
	["D99001", "Mari", "Näidis"],
	["N99002", "Jaan", "Example"],
];

const provider = (
	fields: Partial<EeProviderCase> & Pick<EeProviderCase, "name" | "licences">,
): EeProviderCase => ({
	registryCode: "19999999",
	legalAddress: "Harju maakond, Tallinn, Kesklinna linnaosa, Näidise registriaadress 1, 10111",
	workers: WORKERS,
	...fields,
});

const TARTU = "Tartu maakond, Tartu linn, Tartu linn, Näidise tn 1";
const TALLINN = "Harju maakond, Tallinn, Kesklinna linnaosa, Näite pst 7";

export const EE_NAMED_PROVIDERS: EeProviderCase[] = [
	provider({
		registryCode: "90099901",
		name: "SIHTASUTUS NÄIDISE HAIGLA",
		licences: [
			{
				number: "L00012",
				...NURSING,
				places: [{ address: TARTU, services: [["T0204", "koduõendusteenus"]] }],
			},
			{
				number: "L00011",
				...SPECIALIST,
				hospitalKind: "YLD",
				hospitalKindName: "Üldhaigla",
				places: [
					{
						address: `${TARTU}, 50410`,
						services: [
							["T0038", "ambulatoorsed üldkirurgiateenused"],
							["T0058", "intensiivraviteenused"],
						],
					},
					// The register names a village alone: placed there, at its centre.
					{ address: "Tartu maakond, Tartu linn, Ilmatsalu küla", services: [["T0038", "x"]] },
					// A school nurse's office and a mobile unit are no places a patient visits.
					{ address: "Tartu maakond, Tartu linn, Tartu linn, Näidise kool 1", services: [SCHOOL] },
					{
						address: "Eesti Vabariik (mobiilne näidiskabinet)",
						services: [["T0061", "ambulatoorsed oftalmoloogiateenused"]],
					},
				],
			},
		],
	}),
	provider({
		name: "Näidise Perearstikeskus OÜ",
		licences: [
			{
				number: "L00021",
				...GENERAL,
				places: [{ address: `${TALLINN} // Näite pst 99`, services: [FAMILY_LIST] }],
			},
			{
				number: "L00022",
				...NURSING,
				places: [{ address: TALLINN, services: [["T0236", "õe vastuvõtuteenus"]] }],
			},
		],
	}),
	provider({
		name: "Hambakliinik Näide OÜ",
		licences: [
			{
				number: "L00031",
				...SPECIALIST,
				// A single-town municipality: the address names no settlement.
				places: [
					{
						address: "Harju maakond, Keila linn, Näidise tn 2b",
						services: [DENTAL, ["T0292", "ortodontiateenused"]],
					},
				],
			},
		],
	}),
	provider({
		name: "Näidise Silmakeskus AS",
		licences: [
			{
				number: "L00041",
				...SPECIALIST,
				places: [
					{
						address: "Pärnu maakond, Pärnu linn, Pärnu linn, Näidise pst 8",
						services: [DENTAL, ["T0061", "ambulatoorsed oftalmoloogiateenused"]],
					},
				],
			},
		],
	}),
	provider({
		name: "Sihtasutus Näidise Õendushaigla",
		licences: [
			{
				number: "L00051",
				...NURSING,
				hospitalKind: "OEH",
				hospitalKindName: "Õendushaigla",
				places: [
					{
						address: "Saare maakond, Saaremaa vald, Kuressaare linn, Näite tn 3",
						services: [["T0218", "iseseisev statsionaarne õendusabiteenus"]],
					},
				],
			},
		],
	}),
	provider({
		name: "Näidise Kiirabi SA",
		licences: [
			{
				number: "L00061",
				kind: "3",
				kindName: "Kiirabi",
				places: [{ address: TARTU, services: [["T0014", "kiirabiteenus"]] }],
			},
		],
	}),
	provider({
		name: "Näidis Ämmaemandusabi OÜ",
		licences: [
			{
				number: "L00071",
				kind: "6",
				kindName: "Ämmaemandusabi",
				places: [
					{
						address: "Harju maakond, Viimsi vald, Haabneeme alevik, Näidistee 4",
						services: [["T0251", "iseseisev ämmaemandusabi teenus"]],
					},
				],
			},
		],
	}),
	provider({
		name: "Näidisfüsio OÜ",
		licences: [
			{
				number: "L00081",
				kind: "33",
				kindName: "Füsioteraapia",
				places: [
					{
						address: "Ida-Viru maakond, Narva linn, Näite tn 5",
						services: [["T0295", "iseseisvalt füsioteraapia osutamine"]],
					},
				],
			},
		],
	}),
	provider({
		name: "Näidise Psühholoogiakabinet OÜ",
		licences: [
			{
				number: "L00091",
				kind: "32",
				kindName: "Psühholoogiline ravi",
				places: [
					{
						address: "Ida-Viru maakond, Kohtla-Järve linn, Ahtme linnaosa, Näidise tn 6",
						services: [["T0297", "iseseisvalt psühholoogilise ravi osutamine"]],
					},
				],
			},
		],
	}),
	provider({
		name: "Näidise Logopeed OÜ",
		licences: [
			{
				number: "L00101",
				kind: "31",
				kindName: "Logopeediline ravi",
				places: [
					{
						address: "Lääne maakond, Vormsi vald, Hullo küla",
						services: [["T0296", "iseseisvalt logopeedilise ravi osutamine"]],
					},
				],
			},
		],
	}),
	provider({
		name: "Näidise Koolitervishoid SA",
		licences: [
			{
				number: "L00111",
				...NURSING,
				places: [
					{ address: "Tartu maakond, Tartu linn, Tartu linn, Näidise kool 2", services: [SCHOOL] },
				],
			},
		],
	}),
	provider({
		name: "Näidise Lõppenud Kliinik OÜ",
		licences: [
			{
				number: "L00121",
				...SPECIALIST,
				from: "2020-01-01",
				to: "2024-12-31",
				places: [{ address: TARTU, services: [DENTAL] }],
			},
		],
	}),
	provider({
		name: "Näidise Kaugkliinik OÜ",
		licences: [
			{
				number: "L00131",
				...SPECIALIST,
				places: [{ address: "Pärnu maakond, Näidise vald", services: [["T0065", "x"]] }],
			},
		],
	}),
	provider({
		name: "Näidise Vigane Kliinik OÜ",
		licences: [
			{ number: "X0141", ...SPECIALIST, places: [{ address: TARTU, services: [DENTAL] }] },
		],
	}),
];

/** Filler providers in Lasnamäe: family practices, dental clinics and specialists in turn. */
function fillerProviders(count: number): EeProviderCase[] {
	const kinds = [
		{ ...GENERAL, word: "Perearstikeskus", services: [FAMILY_LIST] },
		{ ...SPECIALIST, word: "Hambaravi", services: [DENTAL] },
		{
			...SPECIALIST,
			word: "Kliinik",
			services: [["T0065", "ambulatoorsed dermatoveneroloogiateenused"]],
		},
	] as const;
	return Array.from({ length: count }, (_, index) => {
		const kind = kinds[index % kinds.length] ?? kinds[0];
		return provider({
			name: `Näidise ${kind.word} ${index + 1} OÜ`,
			licences: [
				{
					number: `L${String(1000 + index).padStart(5, "0")}`,
					kind: kind.kind,
					kindName: kind.kindName,
					places: [
						{
							address: fillerAddress(index).full,
							services: kind.services.map(([code, name]) => [code, name] as [string, string]),
						},
					],
				},
			],
		});
	});
}

export const EE_NAMED_PHARMACIES: EePharmacyCase[] = [
	{
		name: "Näidise Apteek",
		address: "Tartu maakond, Tartu linn, Tartu linn, Näidise tn 1",
		adrId: "9000001",
		kind: "Üldapteek",
		licence: "901",
		code: "9001",
		pharmacist: "Pille Näidis",
		phone: "+372 699 0001",
		email: "apteek@example.test",
		holder: "Näidisapteegid OÜ",
	},
	{
		// An address id the address file no longer has: located by its address.
		name: "Näidisapteek Kesklinn",
		address: "Harju maakond, Tallinn, Kesklinna linnaosa, Näite pst 9",
		adrId: "8999999",
		kind: "Üldapteek",
		licence: "902",
		code: "9002",
		pharmacist: "",
		phone: "6990002",
		email: "kesklinn@example.test",
		holder: "Näidisapteegid OÜ",
	},
	{
		name: "AS Näidise Haiglaapteek",
		address: TARTU,
		adrId: "9000001",
		kind: "Haiglaapteek",
		licence: "903",
		code: "9003",
		pharmacist: "Peeter Example",
		phone: "6990003",
		email: "haigla@example.test",
		holder: "Sihtasutus Näidise Haigla",
	},
	{
		name: "Näidise Loomaapteek",
		address: TALLINN,
		adrId: "9000002",
		kind: "Veterinaarapteek",
		licence: "904",
		code: "9004",
		pharmacist: "",
		phone: "6990004",
		email: "loom@example.test",
		holder: "Näidisloomad OÜ",
	},
];

/** Filler pharmacies in Lasnamäe; four share a chain's number, which is no pharmacy's own. */
function fillerPharmacies(count: number): EePharmacyCase[] {
	return Array.from({ length: count }, (_, index) => {
		const address = fillerAddress(200 + index);
		return {
			name: `Näidise Apteek ${index + 1}`,
			address: address.full,
			adrId: address.adrId,
			kind: "Üldapteek",
			licence: String(1000 + index),
			code: String(9100 + index),
			pharmacist: `Proviisor Näidis ${index + 1}`,
			phone: index < 4 ? "+372 699 9999" : `699${String(1000 + index).padStart(4, "0")}`,
			email: `apteek${index}@example.test`,
			holder: "Näidisapteegid OÜ",
		};
	});
}

export const EE_FACILITIES: EeFixtureSet = {
	providers: [...EE_NAMED_PROVIDERS, ...fillerProviders(150)],
	pharmacies: [...EE_NAMED_PHARMACIES, ...fillerPharmacies(62)],
	extract: "2026-11-27T08:05:04",
};

/** The set with every filler pharmacy's number in another range (a breaker test). */
export function withFillerPhones(set: EeFixtureSet, prefix: string): EeFixtureSet {
	return {
		...set,
		pharmacies: set.pharmacies.map((pharmacy, index) =>
			pharmacy.name.match(/^Näidise Apteek \d+$/)
				? { ...pharmacy, phone: `${prefix}${String(index).padStart(4, "0")}` }
				: pharmacy,
		),
	};
}

const escapeXml = (value: string) =>
	value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const element = (indent: string, tag: string, value: string | undefined) =>
	value ? `${indent}<${tag}>${escapeXml(value)}</${tag}>` : `${indent}<${tag}/>`;

/** The register's XML, indented as the Health Board's file is. */
export function registerXml(set: EeFixtureSet): string {
	const lines = [
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
		`<asutused hetk="${set.extract}">`,
	];
	for (const row of set.providers) {
		lines.push("    <asutus>");
		lines.push(element("        ", "registrikood", row.registryCode));
		lines.push(element("        ", "nimi", row.name));
		lines.push(element("        ", "aadress", row.legalAddress));
		lines.push("        <tegevusload>");
		for (const licence of row.licences) {
			const i = "                ";
			lines.push("            <tegevusluba>");
			lines.push(element(i, "tegevusloa_number", licence.number));
			lines.push(element(i, "alates", licence.from ?? "2020-03-01"));
			lines.push(element(i, "kuni", licence.to));
			lines.push(element(i, "loaliik_kood", licence.kind));
			lines.push(element(i, "loaliik_nimi", licence.kindName));
			lines.push(element(i, "haiglaliik_kood", licence.hospitalKind));
			lines.push(element(i, "haiglaliik_nimi", licence.hospitalKindName));
			lines.push(`${i}<tegevuskohad>`);
			for (const place of licence.places) {
				lines.push(`${i}    <tegevuskoht>`);
				lines.push(element(`${i}        `, "aadress", place.address));
				lines.push(`${i}        <teenused>`);
				for (const [code, name] of place.services) {
					lines.push(`${i}            <teenus>`);
					lines.push(element(`${i}                `, "kood", code));
					lines.push(element(`${i}                `, "nimi", name));
					lines.push(`${i}            </teenus>`);
				}
				lines.push(`${i}        </teenused>`);
				lines.push(`${i}    </tegevuskoht>`);
			}
			lines.push(`${i}</tegevuskohad>`);
			lines.push("            </tegevusluba>");
		}
		lines.push("        </tegevusload>");
		lines.push("        <tootajad>");
		for (const [code, first, last] of row.workers) {
			lines.push("            <tootaja>");
			lines.push(element("                ", "kood", code));
			lines.push(element("                ", "eesnimi", first));
			lines.push(element("                ", "perenimi", last));
			lines.push(element("                ", "kutse_kood", "11"));
			lines.push(element("                ", "kutse_nimi", "Arst"));
			lines.push("                <erialad/>");
			lines.push("            </tootaja>");
		}
		lines.push("        </tootajad>");
		lines.push("    </asutus>");
	}
	lines.push("</asutused>");
	return `${lines.join("\n")}\n`;
}

/** The pharmacies' export: `;`, every field quoted, a BOM, CRLF. */
export function pharmaciesCsv(rows: readonly EePharmacyCase[]): string {
	const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
	const header =
		"Apteegi nimi;Apteegi aadress;ADR_ID;ADS_OID;Apteegi liik;Tegevusloa number;Tegutsemiskoha kood;Pädev isik;Telefon;Faks;Epost;Tegevusloa omaja";
	const lines = rows.map((row) =>
		[
			row.name,
			row.address,
			row.adrId,
			`ME0${row.adrId}`,
			row.kind,
			row.licence,
			row.code,
			row.pharmacist,
			row.phone,
			"",
			row.email,
			row.holder,
		]
			.map(quote)
			.join(";"),
	);
	return `﻿${[header, ...lines].join("\r\n")}\r\n`;
}

/** The address file: a CSV in a ZIP, points in L-EST97, CRLF. */
export function addressArchive(addresses: readonly EeAddress[]): Buffer {
	const lines = ["ADR_ID;SIHTNUMBER;LAHIAADRESS;TAISAADRESS;VIITEPUNKT_X;VIITEPUNKT_Y"];
	for (const address of addresses) {
		const { x, y } = wgs84ToLest97(address);
		lines.push(
			[
				address.adrId,
				address.postcode,
				address.short,
				address.full,
				x.toFixed(2),
				y.toFixed(2),
			].join(";"),
		);
	}
	return writeStoredZip(
		[{ name: "sihtnumbrid.csv", data: Buffer.from(`${lines.join("\r\n")}\r\n`, "utf8") }],
		{ deflate: true },
	);
}

/** Estonian letters in Windows-1257, as latin1 characters `writeDbf` copies byte for byte. */
const WINDOWS_1257: Readonly<Record<string, number>> = {
	õ: 0xf5,
	Õ: 0xd5,
	ä: 0xe4,
	Ä: 0xc4,
	ö: 0xf6,
	Ö: 0xd6,
	ü: 0xfc,
	Ü: 0xdc,
	š: 0xf0,
	Š: 0xd0,
	ž: 0xfe,
	Ž: 0xde,
};

const cp1257 = (value: string) =>
	[...value].map((char) => String.fromCharCode(WINDOWS_1257[char] ?? char.charCodeAt(0))).join("");

/** The settlements' shapefile: a 1.2 km square around each centre, the table in Windows-1257. */
export function settlementsArchive(): Buffer {
	const fields = [
		{ name: "ANIMI", type: "C", length: 100 },
		{ name: "AKOOD", type: "C", length: 4 },
		{ name: "TYYP", type: "C", length: 2 },
		{ name: "ONIMI", type: "C", length: 100 },
		{ name: "OKOOD", type: "C", length: 4 },
		{ name: "MNIMI", type: "C", length: 100 },
		{ name: "MKOOD", type: "C", length: 4 },
		{ name: "EKSPORT", type: "D", length: 8 },
	];
	const type = (name: string) =>
		/linnaosa$/.test(name) ? "6" : /linn$/.test(name) ? "4" : /alevik$/.test(name) ? "7" : "8";
	const records = EE_SETTLEMENTS.map(
		([code, name, municipalityCode, municipality, countyCode, county]) => ({
			ANIMI: cp1257(name),
			AKOOD: code,
			TYYP: type(name),
			ONIMI: cp1257(municipality),
			OKOOD: municipalityCode,
			MNIMI: cp1257(county),
			MKOOD: countyCode,
			EKSPORT: EE_FIXTURE_PLACES_DATE,
		}),
	);
	const polygons = EE_SETTLEMENTS.map(([, , , , , , latitude, longitude]) => {
		const { x, y } = wgs84ToLest97({ latitude, longitude });
		const d = 600;
		// Outer rings clockwise, as the shapefile format wants them.
		return [
			[
				{ x: x - d, y: y - d },
				{ x: x - d, y: y + d },
				{ x: x + d, y: y + d },
				{ x: x + d, y: y - d },
				{ x: x - d, y: y - d },
			],
		];
	});
	return writeStoredZip(
		[
			{ name: "asustusyksus.dbf", data: writeDbf(fields, records, { encoding: "latin1" }) },
			{ name: "asustusyksus.shp", data: writeShpPolygons(polygons) },
			{
				name: "asustusyksus.prj",
				data: Buffer.from('PROJCS["Estonia_1997_Estonia_National_Grid",AUTHORITY["EPSG",3301]]'),
			},
		],
		{ deflate: true },
	);
}

export function writeEeFixtures(dir: string, set: EeFixtureSet = EE_FACILITIES) {
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "od_asutused.xml"), registerXml(set));
	writeFileSync(join(dir, "apteekide_koondandmed.csv"), pharmaciesCsv(set.pharmacies));
	writeFileSync(
		join(dir, "sihtnumbrid.zip"),
		addressArchive([
			...EE_ADDRESSES,
			...Array.from({ length: 300 }, (_, index) => fillerAddress(index)),
		]),
	);
	writeFileSync(join(dir, "asustusyksus_shp.zip"), settlementsArchive());
}

if (import.meta.main) {
	writeEeFixtures(EE_FIXTURES);
	console.log(`Wrote the synthetic Estonian fixtures to ${EE_FIXTURES}`);
}
