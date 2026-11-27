/**
 * Generates the SYNTHETIC fixtures in `fixtures/no/`: the Brønnøysund Register Centre's full
 * files of establishments and entities in their exact format (`underenheter.csv.gz`,
 * `enheter.csv.gz`: gzipped CSV, every field quoted, the real headers), Kartverket's national
 * address file (`adresser.zip`, one `;` CSV, EPSG:4258) and the counties and municipalities that
 * `etl:places --country no` reads (`fylkerkommuner.json`).
 *
 * Every establishment, owner and street is made up: names say they are examples (Eksempel,
 * Example), organisation numbers are valid (modulus 11) but from ranges the fixtures pick, phone
 * numbers are in a range of their own, and rows the import must never list are there on purpose
 * (a sole proprietorship named after its owner, a company named after a doctor, a holding
 * company, an owner in bankruptcy, a closed establishment, a purchasing unit of a health trust, a
 * unit on Svalbard, physiotherapy), with e-mails, mobile numbers and care-of lines the tests check
 * are never stored. Never commit real rows. Deterministic: the same files on every run. Run with
 * `bun run --cwd packages/etl fixtures:no`.
 *
 * The counties and municipalities are real (Kartverket's numbers, names and points).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { writeStoredZip } from "../src/lib/zip";

export const NO_FIXTURES = join(import.meta.dirname, "no");

/** The register's establishments' file header, word for word (November 2026). */
const ESTABLISHMENT_HEADER = [
	"organisasjonsnummer",
	"navn",
	"organisasjonsform.kode",
	"organisasjonsform.beskrivelse",
	"naeringskode1.kode",
	"naeringskode1.beskrivelse",
	"naeringskode2.kode",
	"naeringskode2.beskrivelse",
	"naeringskode3.kode",
	"naeringskode3.beskrivelse",
	"hjelpeenhetskode.kode",
	"hjelpeenhetskode.beskrivelse",
	"harRegistrertAntallAnsatte",
	"antallAnsatte",
	"registreringsdatoAntallAnsatteEnhetsregisteret",
	"registreringsdatoantallansatteNAVAaregisteret",
	"hjemmeside",
	"epostadresse",
	"telefon",
	"mobil",
	"postadresse.adresse",
	"postadresse.poststed",
	"postadresse.postnummer",
	"postadresse.kommune",
	"postadresse.kommunenummer",
	"postadresse.land",
	"postadresse.landkode",
	"beliggenhetsadresse.adresse",
	"beliggenhetsadresse.poststed",
	"beliggenhetsadresse.postnummer",
	"beliggenhetsadresse.kommune",
	"beliggenhetsadresse.kommunenummer",
	"beliggenhetsadresse.land",
	"beliggenhetsadresse.landkode",
	"registreringsdatoIEnhetsregisteret",
	"frivilligMvaRegistrertBeskrivelser",
	"registreringsdatoFrivilligMerverdiavgiftsregisteret",
	"registrertIMvaregisteret",
	"registreringsdatoMerverdiavgiftsregisteret",
	"registreringsdatoMerverdiavgiftsregisteretEnhetsregisteret",
	"oppstartsdato",
	"datoEierskifte",
	"overordnetEnhet",
	"nedleggelsesdato",
] as const;

/** The register's entities' file header, word for word (November 2026). */
const ENTITY_HEADER = [
	"organisasjonsnummer",
	"navn",
	"organisasjonsform.kode",
	"organisasjonsform.beskrivelse",
	"naeringskode1.kode",
	"naeringskode1.beskrivelse",
	"naeringskode2.kode",
	"naeringskode2.beskrivelse",
	"naeringskode3.kode",
	"naeringskode3.beskrivelse",
	"hjelpeenhetskode.kode",
	"hjelpeenhetskode.beskrivelse",
	"harRegistrertAntallAnsatte",
	"antallAnsatte",
	"registreringsdatoAntallAnsatteEnhetsregisteret",
	"registreringsdatoantallansatteNAVAaregisteret",
	"hjemmeside",
	"epostadresse",
	"telefon",
	"mobil",
	"postadresse.adresse",
	"postadresse.poststed",
	"postadresse.postnummer",
	"postadresse.kommune",
	"postadresse.kommunenummer",
	"postadresse.land",
	"postadresse.landkode",
	"forretningsadresse.adresse",
	"forretningsadresse.poststed",
	"forretningsadresse.postnummer",
	"forretningsadresse.kommune",
	"forretningsadresse.kommunenummer",
	"forretningsadresse.land",
	"forretningsadresse.landkode",
	"institusjonellSektorkode.kode",
	"institusjonellSektorkode.beskrivelse",
	"sisteInnsendteAarsregnskap",
	"registreringsdatoenhetsregisteret",
	"stiftelsesdato",
	"registrertIMvaRegisteret",
	"registreringsdatoMerverdiavgiftsregisteret",
	"registreringsdatoMerverdiavgiftsregisteretEnhetsregisteret",
	"frivilligMvaRegistrertBeskrivelser",
	"registreringsdatoFrivilligMerverdiavgiftsregisteret",
	"registrertIFrivillighetsregisteret",
	"registreringsdatoFrivillighetsregisteret",
	"registrertIForetaksregisteret",
	"registreringsdatoForetaksregisteret",
	"registrertIStiftelsesregisteret",
	"registrertIPartiregisteret",
	"registreringsdatoPartiregisteret",
	"konkurs",
	"konkursdato",
	"underAvvikling",
	"underAvviklingDato",
	"underTvangsavviklingEllerTvangsopplosning",
	"tvangsopplostPgaManglendeDagligLederDato",
	"tvangsopplostPgaManglendeRevisorDato",
	"tvangsopplostPgaManglendeRegnskapDato",
	"tvangsopplostPgaMangelfulltStyreDato",
	"tvangsavvikletPgaManglendeSlettingDato",
	"overordnetEnhet",
	"maalform",
	"vedtektsdato",
	"vedtektsfestetFormaal",
	"aktivitet",
	"paategninger",
	"underUtenlandskInsolvensbehandlingDato",
	"underRekonstruksjonsforhandlingDato",
	"fravalgRevisjonDato",
	"fravalgRevisjonBeslutningsDato",
	"erIKonsern",
	"kapital.belop",
	"kapital.antallAksjer",
	"kapital.type",
	"kapital.bundet",
	"kapital.valuta",
	"kapital.innbetalt",
	"kapital.fulltInnbetalt",
	"kapital.innfortDato",
	"registreringsnummerIHjemlandet",
	"utenlandskRegisterNavn",
	"utenlandskRegisterAdresse.land",
	"utenlandskRegisterAdresse.poststed",
	"utenlandskRegisterAdresse.adresse",
	"underlagtLovgivningLand",
	"underlagtLovgivningLandKode",
	"foretaksformIHjemlandet.kode",
	"foretaksformIHjemlandet.beskrivelse",
	"foretaksformIHjemlandet.beskrivelseBokmaal",
] as const;

/** Kartverket's address file header, word for word (November 2026). */
const ADDRESS_HEADER = [
	"lokalid",
	"kommunenummer",
	"kommunenavn",
	"adressetype",
	"adressetilleggsnavn",
	"adressetilleggsnavnKilde",
	"adressekode",
	"adressenavn",
	"nummer",
	"bokstav",
	"gardsnummer",
	"bruksnummer",
	"festenummer",
	"undernummer",
	"adresseTekst",
	"adresseTekstUtenAdressetilleggsnavn",
	"EPSG-kode",
	"Nord",
	"Øst",
	"postnummer",
	"poststed",
	"grunnkretsnummer",
	"grunnkretsnavn",
	"soknenummer",
	"soknenavn",
	"organisasjonsnummer",
	"tettstednummer",
	"tettstednavn",
	"valgkretsnummer",
	"valgkretsnavn",
	"oppdateringsdato",
	"datauttaksdato",
	"adresseId",
	"uuidAdresse",
	"atkomstId",
	"uuidAtkomst",
	"atkomstNord",
	"atkomstØst",
	"sommeratkomstId",
	"uuidSommeratkomst",
	"sommeratkomstNord",
	"sommeratkomstØst",
	"vinteratkomstId",
	"uuidVinteratkomst",
	"vinteratkomstNord",
	"vinteratkomstØst",
] as const;

/** Counties of the fixture, with the municipalities it uses: number, name, point. */
export const NO_PLACES: {
	code: string;
	name: string;
	municipalities: [string, string, number, number][];
}[] = [
	{ code: "03", name: "Oslo", municipalities: [["0301", "Oslo", 10.775729, 59.972397]] },
	{
		code: "32",
		name: "Akershus",
		municipalities: [
			["3201", "Bærum", 10.49971, 59.928964],
			["3209", "Ullensaker", 11.198429, 60.154107],
		],
	},
	{
		code: "46",
		name: "Vestland",
		municipalities: [
			["4601", "Bergen", 5.379239, 60.356091],
			["4631", "Alver", 5.230794, 60.67072],
		],
	},
	{ code: "50", name: "Trøndelag", municipalities: [["5001", "Trondheim", 10.475124, 63.338075]] },
	{ code: "55", name: "Troms", municipalities: [["5501", "Tromsø", 18.687659, 69.723858]] },
];

/** The weights of the organisation number's check digit. */
const WEIGHTS = [3, 2, 7, 6, 5, 4, 3, 2];

/** The valid organisation numbers from `start` on (eight digits, then the check digit). */
export function orgNumbers(start: number, count: number): string[] {
	const numbers: string[] = [];
	for (let base = start; numbers.length < count; base++) {
		const digits = String(base);
		const sum = WEIGHTS.reduce((total, weight, index) => total + weight * Number(digits[index]), 0);
		const remainder = sum % 11;
		const check = remainder === 0 ? 0 : 11 - remainder;
		if (check !== 10) numbers.push(`${digits}${check}`);
	}
	return numbers;
}

/** An establishment of the fixture's register file. */
export type NoFixtureEstablishment = {
	id: string;
	name: string;
	industry: string;
	industryLabel: string;
	/** Location address lines (joined with a newline inside one quoted field). */
	street: string[];
	postcode: string;
	postTown: string;
	municipality: string;
	municipalityName: string;
	owner: string;
	phone?: string;
	mobile?: string;
	email?: string;
	closedOn?: string;
	country?: string;
};

/** An owner of the fixture's entities' file. */
export type NoFixtureEntity = {
	id: string;
	name: string;
	form: string;
	bankrupt?: boolean;
};

const INDUSTRY: Readonly<Record<string, string>> = {
	"86.101": "Somatiske sykehustjenester",
	"86.102": "Psykiatriske sykehustjenester for voksne",
	"86.210": "Allmennlegetjenester",
	"86.221": "Spesialiserte legetjenester, unntatt psykiatriske legetjenester",
	"86.230": "Tannlegetjenester",
	"86.950": "Fysioterapi- og ergoterapitjenester",
	"87.102": "Sykehjemstjenester",
	"47.730": "Detaljhandel med apotekvarer",
};

/** The fixture's organisation numbers, in order. */
const FIXTURE_IDS = orgNumbers(91_000_000, 35);
const fixtureId = (index: number) => FIXTURE_IDS[index] ?? "";
const UUS_ULLEVAL = fixtureId(0);
const UUS = fixtureId(1);
const DPS = fixtureId(2);
const LEGESENTER = fixtureId(3);
const LEGESENTER_AS = fixtureId(4);
const LEGEVAKT = fixtureId(5);
const KOMMUNE = fixtureId(6);
const OYEKLINIKK = fixtureId(7);
const OYEKLINIKK_AS = fixtureId(8);
const TANNKLINIKK = fixtureId(9);
const FYLKE = fixtureId(10);
const SYKEHJEM = fixtureId(11);
const KOMMUNE_BERGEN = fixtureId(12);
const APOTEK1 = fixtureId(13);
const APOTEK1_AS = fixtureId(14);
const APOTEK_TROMSO = fixtureId(15);
const APOTEK_TROMSO_AS = fixtureId(16);
const TANNLEGESENTER = fixtureId(17);
const TANNLEGESENTER_AS = fixtureId(18);
const OLA = fixtureId(19);
const OLA_ENK = fixtureId(20);
const LEGE_KARI = fixtureId(21);
const LEGE_KARI_AS = fixtureId(22);
const HOLDING = fixtureId(23);
const HOLDING_AS = fixtureId(24);
const MEDICAL = fixtureId(25);
const MEDICAL_AS = fixtureId(26);
const FYSIO = fixtureId(27);
const KONKURS = fixtureId(28);
const KONKURS_AS = fixtureId(29);
const INNKJOP = fixtureId(30);
const CLOSED = fixtureId(31);
const SVALBARD = fixtureId(32);
const PARTNERS = fixtureId(33);
const PARTNERS_DA = fixtureId(34);

/** The pages the tests look for, and the rows they must never find. */
export const NO_KEYS = {
	hospital: UUS_ULLEVAL,
	mentalHealth: DPS,
	gp: LEGESENTER,
	emergency: LEGEVAKT,
	specialist: OYEKLINIKK,
	dental: TANNKLINIKK,
	nursingHome: SYKEHJEM,
	pharmacy: APOTEK1,
	pharmacyAtPostcode: APOTEK_TROMSO,
	careOf: TANNLEGESENTER,
	soleProprietorship: OLA,
	namedAfterDoctor: LEGE_KARI,
	holding: HOLDING,
	noCareWord: MEDICAL,
	physiotherapy: FYSIO,
	bankruptOwner: KONKURS,
	purchasing: INNKJOP,
	closed: CLOSED,
	svalbard: SVALBARD,
	partners: PARTNERS,
} as const;

const place = (municipality: string) => {
	for (const county of NO_PLACES) {
		const found = county.municipalities.find(([code]) => code === municipality);
		if (found) return found[1];
	}
	return "SVALBARD";
};

const est = (
	id: string,
	name: string,
	industry: string,
	municipality: string,
	street: string[],
	postcode: string,
	postTown: string,
	owner: string,
	extra: Partial<NoFixtureEstablishment> = {},
): NoFixtureEstablishment => ({
	id,
	name,
	industry,
	industryLabel: INDUSTRY[industry] ?? "",
	street,
	postcode,
	postTown,
	municipality,
	municipalityName: place(municipality).toUpperCase(),
	owner,
	...extra,
});

export const NO_ESTABLISHMENTS: NoFixtureEstablishment[] = [
	est(
		UUS_ULLEVAL,
		"EKSEMPEL UNIVERSITETSSYKEHUS HF AVD ULLEVÅL",
		"86.101",
		"0301",
		["Eksempelveien 1"],
		"0450",
		"OSLO",
		UUS,
	),
	est(DPS, "EKSEMPEL DPS DØGNENHET", "86.102", "4601", ["Eksempelveien 2"], "5021", "BERGEN", UUS),
	est(
		LEGESENTER,
		"EKSEMPEL LEGESENTER AS",
		"86.210",
		"0301",
		["Eksempelgata 10"],
		"0150",
		"OSLO",
		LEGESENTER_AS,
		{
			email: "post@legesenter.example",
			mobile: "912 34 567",
		},
	),
	est(
		LEGEVAKT,
		"EKSEMPEL INTERKOMMUNALE LEGEVAKT",
		"86.210",
		"5001",
		["Eksempelvegen 5"],
		"7030",
		"TRONDHEIM",
		KOMMUNE,
	),
	est(
		OYEKLINIKK,
		"EKSEMPEL ØYEKLINIKK AS",
		"86.221",
		"5501",
		["Eksempelgata 3"],
		"9008",
		"TROMSØ",
		OYEKLINIKK_AS,
	),
	est(
		TANNKLINIKK,
		"EKSEMPEL TANNKLINIKK",
		"86.230",
		"3209",
		["Eksempelvegen 7"],
		"2050",
		"JESSHEIM",
		FYLKE,
	),
	est(
		SYKEHJEM,
		"EKSEMPEL SYKEHJEM",
		"87.102",
		"4601",
		["Eksempelveien 9"],
		"5003",
		"BERGEN",
		KOMMUNE_BERGEN,
	),
	est(
		APOTEK1,
		"APOTEK 1 EKSEMPEL",
		"47.730",
		"0301",
		["Eksempelgata 12"],
		"0151",
		"OSLO",
		APOTEK1_AS,
		{
			phone: "22 12 34 56",
		},
	),
	// Not in the address file: located at its postcode's centre.
	est(
		APOTEK_TROMSO,
		"EKSEMPEL APOTEK TROMSØ AS",
		"47.730",
		"5501",
		["Eksempelgata 99"],
		"9008",
		"TROMSØ",
		APOTEK_TROMSO_AS,
	),
	// A care-of line naming someone, then the street.
	est(
		TANNLEGESENTER,
		"EKSEMPEL TANNLEGESENTER AS",
		"86.230",
		"4601",
		["c/o Kari Eksempelsen", "Eksempelveien 11"],
		"5003",
		"BERGEN",
		TANNLEGESENTER_AS,
	),
	// Never listed.
	est(OLA, "OLA EKSEMPEL", "86.210", "0301", ["Eksempelgata 20"], "0150", "OSLO", OLA_ENK),
	est(
		LEGE_KARI,
		"LEGE KARI EKSEMPEL AS",
		"86.210",
		"0301",
		["Eksempelgata 21"],
		"0150",
		"OSLO",
		LEGE_KARI_AS,
	),
	est(
		HOLDING,
		"EKSEMPEL HOLDING AS",
		"86.210",
		"4601",
		["Eksempelveien 22"],
		"5003",
		"BERGEN",
		HOLDING_AS,
	),
	est(
		MEDICAL,
		"EKSEMPEL MEDICAL AS",
		"86.221",
		"4601",
		["Eksempelveien 23"],
		"5003",
		"BERGEN",
		MEDICAL_AS,
	),
	est(
		FYSIO,
		"EKSEMPEL FYSIOTERAPI",
		"86.950",
		"4601",
		["Eksempelveien 24"],
		"5003",
		"BERGEN",
		KOMMUNE_BERGEN,
	),
	est(
		KONKURS,
		"EKSEMPEL PRIVATSYKEHUS",
		"86.101",
		"0301",
		["Eksempelgata 25"],
		"0150",
		"OSLO",
		KONKURS_AS,
	),
	est(
		INNKJOP,
		"EKSEMPEL SYKEHUSINNKJØP HF ADMINISTRASJON",
		"86.101",
		"0301",
		["Eksempelgata 26"],
		"0150",
		"OSLO",
		UUS,
	),
	est(
		CLOSED,
		"EKSEMPEL SYKEHJEM NORD",
		"87.102",
		"4601",
		["Eksempelveien 27"],
		"5003",
		"BERGEN",
		KOMMUNE_BERGEN,
		{
			closedOn: "2026-06-30",
		},
	),
	est(
		SVALBARD,
		"EKSEMPEL SYKEHUS LONGYEARBYEN",
		"86.101",
		"2100",
		["Eksempelvegen 28"],
		"9170",
		"LONGYEARBYEN",
		UUS,
	),
	est(
		PARTNERS,
		"TANNLEGENE EKSEMPELSEN OG PRØVE",
		"86.230",
		"4601",
		["Eksempelveien 29"],
		"5003",
		"BERGEN",
		PARTNERS_DA,
	),
];

export const NO_ENTITIES: NoFixtureEntity[] = [
	{ id: UUS, name: "EKSEMPEL UNIVERSITETSSYKEHUS HF", form: "SÆR" },
	{ id: LEGESENTER_AS, name: "EKSEMPEL LEGESENTER AS", form: "AS" },
	{ id: KOMMUNE, name: "EKSEMPEL KOMMUNE", form: "KOMM" },
	{ id: OYEKLINIKK_AS, name: "EKSEMPEL ØYEKLINIKK AS", form: "AS" },
	{ id: FYLKE, name: "EKSEMPEL FYLKESKOMMUNE", form: "FYLK" },
	{ id: KOMMUNE_BERGEN, name: "EKSEMPEL KOMMUNE VEST", form: "KOMM" },
	{ id: APOTEK1_AS, name: "APOTEK 1 EKSEMPEL AS", form: "AS" },
	{ id: APOTEK_TROMSO_AS, name: "EKSEMPEL APOTEK TROMSØ AS", form: "AS" },
	{ id: TANNLEGESENTER_AS, name: "EKSEMPEL TANNLEGESENTER AS", form: "AS" },
	{ id: OLA_ENK, name: "OLA EKSEMPEL", form: "ENK" },
	{ id: LEGE_KARI_AS, name: "LEGE KARI EKSEMPEL AS", form: "AS" },
	{ id: HOLDING_AS, name: "EKSEMPEL HOLDING AS", form: "AS" },
	{ id: MEDICAL_AS, name: "EKSEMPEL MEDICAL AS", form: "AS" },
	{ id: KONKURS_AS, name: "EKSEMPEL PRIVATSYKEHUS AS", form: "AS", bankrupt: true },
	{ id: PARTNERS_DA, name: "TANNLEGENE EKSEMPELSEN OG PRØVE DA", form: "DA" },
];

/** Fillers: places of care of every kind across the municipalities, for the guards' floors. */
const FILLER_KINDS: [string, string][] = [
	["86.210", "LEGESENTER"],
	["86.230", "TANNKLINIKK"],
	["87.102", "SYKEHJEM"],
	["47.730", "APOTEK"],
	["86.221", "SPESIALISTSENTER"],
];

/** Postcodes and post towns of the fixture's municipalities. */
const POSTCODES: Readonly<Record<string, [string, string]>> = {
	"0301": ["0152", "OSLO"],
	"3201": ["1337", "SANDVIKA"],
	"3209": ["2050", "JESSHEIM"],
	"4601": ["5003", "BERGEN"],
	"4631": ["5914", "ISDALSTØ"],
	"5001": ["7030", "TRONDHEIM"],
	"5501": ["9008", "TROMSØ"],
};

export function fillerEstablishments(
	count: number,
	phone: (index: number) => string = (index) =>
		// Four fillers share one number: it is never stored.
		index < 4 ? "22 99 99 99" : `22 98 ${String(10 + (index % 90)).padStart(2, "0")} 00`,
): {
	establishments: NoFixtureEstablishment[];
	entities: NoFixtureEntity[];
} {
	const ids = orgNumbers(92_000_000, count * 2);
	const municipalities = Object.keys(POSTCODES);
	const establishments: NoFixtureEstablishment[] = [];
	const entities: NoFixtureEntity[] = [];
	for (let index = 0; index < count; index++) {
		const [industry, word] = FILLER_KINDS[index % FILLER_KINDS.length] as [string, string];
		const municipality = municipalities[index % municipalities.length] as string;
		const [postcode, town] = POSTCODES[municipality] as [string, string];
		const id = ids[index * 2] as string;
		const owner = ids[index * 2 + 1] as string;
		const name = `EKSEMPEL ${word} ${place(municipality).toUpperCase()} ${index + 1}`;
		establishments.push(
			est(id, name, industry, municipality, [`Prøvegata ${index + 1}`], postcode, town, owner, {
				phone: phone(index),
			}),
		);
		entities.push({ id: owner, name: `${name} AS`, form: "AS" });
	}
	return { establishments, entities };
}

/** A field as the register quotes it. */
const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;

export function establishmentsCsv(rows: readonly NoFixtureEstablishment[]): Buffer {
	const lines = [ESTABLISHMENT_HEADER.map(quote).join(",")];
	for (const row of rows) {
		const values: Record<string, string> = {
			organisasjonsnummer: row.id,
			navn: row.name,
			"organisasjonsform.kode": "BEDR",
			"organisasjonsform.beskrivelse": "Underenhet til næringsdrivende og offentlig forvaltning",
			"naeringskode1.kode": row.industry,
			"naeringskode1.beskrivelse": row.industryLabel,
			harRegistrertAntallAnsatte: "false",
			epostadresse: row.email ?? "",
			telefon: row.phone ?? "",
			mobil: row.mobile ?? "",
			"beliggenhetsadresse.adresse": row.street.join("\n"),
			"beliggenhetsadresse.poststed": row.postTown,
			"beliggenhetsadresse.postnummer": row.postcode,
			"beliggenhetsadresse.kommune": row.municipalityName,
			"beliggenhetsadresse.kommunenummer": row.municipality,
			"beliggenhetsadresse.land": "Norge",
			"beliggenhetsadresse.landkode": row.country ?? "NO",
			registreringsdatoIEnhetsregisteret: "2020-01-01",
			registrertIMvaregisteret: "false",
			oppstartsdato: "2020-01-01",
			overordnetEnhet: row.owner,
			nedleggelsesdato: row.closedOn ?? "",
		};
		lines.push(ESTABLISHMENT_HEADER.map((column) => quote(values[column] ?? "")).join(","));
	}
	return gzipSync(Buffer.from(`${lines.join("\n")}\n`, "utf8"));
}

export function entitiesCsv(rows: readonly NoFixtureEntity[]): Buffer {
	const lines = [ENTITY_HEADER.map(quote).join(",")];
	for (const row of rows) {
		const values: Record<string, string> = {
			organisasjonsnummer: row.id,
			navn: row.name,
			"organisasjonsform.kode": row.form,
			konkurs: row.bankrupt ? "true" : "false",
			underAvvikling: "false",
			underTvangsavviklingEllerTvangsopplosning: "false",
			epostadresse: "styret@eksempel.example",
		};
		lines.push(ENTITY_HEADER.map((column) => quote(values[column] ?? "")).join(","));
	}
	return gzipSync(Buffer.from(`${lines.join("\n")}\n`, "utf8"));
}

export type NoFixtureAddress = {
	municipality: string;
	text: string;
	postcode: string;
	latitude: number;
	longitude: number;
};

/** The addresses of the fixture: those of the establishments (but one) and fillers around each centre. */
export function fixtureAddresses(rows: readonly NoFixtureEstablishment[]): NoFixtureAddress[] {
	const centre = (municipality: string) => {
		for (const county of NO_PLACES) {
			const found = county.municipalities.find(([code]) => code === municipality);
			if (found) return { longitude: found[2], latitude: found[3] };
		}
		return null;
	};
	const addresses: NoFixtureAddress[] = [];
	rows.forEach((row, index) => {
		const point = centre(row.municipality);
		const street = row.street.find((line) => /\d/.test(line) && !/^c\/o/i.test(line));
		if (!point || !street || row.id === NO_KEYS.pharmacyAtPostcode) return;
		addresses.push({
			municipality: row.municipality,
			text: street,
			postcode: row.postcode,
			latitude: Math.round((point.latitude + 0.001 * ((index % 7) - 3)) * 1e6) / 1e6,
			longitude: Math.round((point.longitude + 0.001 * ((index % 5) - 2)) * 1e6) / 1e6,
		});
	});
	// Other addresses of the postcodes, so a postcode's centre is the mean of several.
	for (const county of NO_PLACES) {
		for (const [code, , longitude, latitude] of county.municipalities) {
			const postcodes = new Set(
				rows.filter((row) => row.municipality === code).map((row) => row.postcode),
			);
			for (const postcode of postcodes) {
				for (let index = 1; index <= 4; index++) {
					addresses.push({
						municipality: code,
						text: `Eksempelstien ${index}`,
						postcode,
						latitude: Math.round((latitude + 0.002 * index) * 1e6) / 1e6,
						longitude: Math.round((longitude - 0.002 * index) * 1e6) / 1e6,
					});
				}
			}
		}
	}
	return addresses;
}

export function addressArchive(addresses: readonly NoFixtureAddress[]): Buffer {
	const lines = [ADDRESS_HEADER.join(";")];
	addresses.forEach((address, index) => {
		const values: Record<string, string> = {
			lokalid: String(90_000_000 + index),
			kommunenummer: address.municipality,
			kommunenavn: place(address.municipality).toUpperCase(),
			adressetype: "vegadresse",
			adressenavn: address.text.replace(/\s+\d.*$/, ""),
			nummer: /\d+/.exec(address.text)?.[0] ?? "",
			adresseTekst: address.text,
			adresseTekstUtenAdressetilleggsnavn: address.text,
			"EPSG-kode": "4258",
			Nord: address.latitude.toFixed(6),
			Øst: address.longitude.toFixed(6),
			postnummer: address.postcode,
			poststed: "EKSEMPEL",
			oppdateringsdato: "01.11.2026 08:00:00",
			datauttaksdato: "21.11.2026 16:40:01",
		};
		lines.push(ADDRESS_HEADER.map((column) => values[column] ?? "").join(";"));
	});
	return writeStoredZip(
		[
			{
				name: "Basisdata_0000_Norge_4258_MatrikkelenAdresse_CSV/matrikkelenAdresse.csv",
				data: Buffer.from(`﻿${lines.join("\n")}\n`, "utf8"),
			},
		],
		{ deflate: true },
	);
}

/** The counties with their municipalities, as Kartverket's `/fylkerkommuner` answers. */
export function placesJson(): string {
	return `${JSON.stringify(
		NO_PLACES.map((county) => ({
			fylkesnavn: county.name,
			fylkesnummer: county.code,
			kommuner: county.municipalities.map(([code, name, longitude, latitude]) => ({
				fylkesnavn: county.name,
				fylkesnummer: county.code,
				kommunenavn: name,
				kommunenavnNorsk: name,
				kommunenummer: code,
				punktIOmrade: {
					coordinates: [longitude, latitude],
					crs: { properties: { name: "EPSG:4258" }, type: "name" },
					type: "Point",
				},
				samiskForvaltningsomrade: false,
			})),
		})),
		null,
		1,
	)}\n`;
}

/** How many fillers the fixtures hold: enough for the guards' floors. */
export const NO_FILLERS = 140;

export type NoFixtureOptions = {
	/** Organisation numbers of establishments left out of the register's file. */
	without?: readonly string[];
	/** The fillers' published numbers, by index. */
	fillerPhone?: (index: number) => string;
};

export function writeNoFixtures(dir: string, options: NoFixtureOptions = {}) {
	mkdirSync(dir, { recursive: true });
	const extra = fillerEstablishments(NO_FILLERS, options.fillerPhone);
	const all = [...NO_ESTABLISHMENTS, ...extra.establishments];
	// The address file stays the same when the register loses an establishment.
	writeFileSync(join(dir, "adresser.zip"), addressArchive(fixtureAddresses(all)));
	const establishments = all.filter((row) => !options.without?.includes(row.id));
	writeFileSync(join(dir, "underenheter.csv.gz"), establishmentsCsv(establishments));
	writeFileSync(join(dir, "enheter.csv.gz"), entitiesCsv([...NO_ENTITIES, ...extra.entities]));
	writeFileSync(join(dir, "fylkerkommuner.json"), placesJson());
}

if (import.meta.main) {
	writeNoFixtures(NO_FIXTURES);
	console.log(`Wrote the synthetic Norwegian fixtures to ${NO_FIXTURES}`);
}
