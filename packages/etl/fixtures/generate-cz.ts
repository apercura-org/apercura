/**
 * Generates the SYNTHETIC fixtures in `fixtures/cz/`: a file in the exact format of the NRPZS
 * export (the 49 quoted columns of "Místa poskytování zdravotních služeb") and a small RÚIAN
 * state file (VFR 3.1 XML, the elements `etl:places --country cz` reads), filled with
 * fictitious facilities.
 *
 * Every facility is made up: names are made-up words (Ukázka, Příklad, Vzorek, Fiktivní,
 * Smyšlený…), the sole traders some facilities are named after are invented
 * (`MUDr. Jana Ukázková`), streets do not exist, facility numbers start at 900001 (the real
 * register's are below 200000), company numbers start with 99, and phone numbers are in a range
 * no real practice of the file uses. Each line also carries a made-up provider seat, e-mail and
 * professional representative, so the tests can check they are never stored. Never commit real
 * rows. Run with `bun run --cwd packages/etl fixtures:cz`.
 *
 * The regions, districts, municipalities and Prague districts are real public RÚIAN names,
 * codes and definition points: a small subset of the state file.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const CZ_FIXTURES = join(import.meta.dirname, "cz");

/** The 14 regions: RÚIAN code, NUTS code, name, definition point (EPSG:5514). */
export const CZ_REGIONS_RUIAN: [string, string, string, number, number][] = [
	["19", "CZ010", "Hlavní město Praha", -743100, -1043300],
	["27", "CZ020", "Středočeský kraj", -764439, -1033266],
	["35", "CZ031", "Jihočeský kraj", -755832, -1166165],
	["43", "CZ032", "Plzeňský kraj", -822400, -1069700],
	["51", "CZ041", "Karlovarský kraj", -849146, -1012216],
	["60", "CZ042", "Ústecký kraj", -760769, -976136],
	["78", "CZ051", "Liberecký kraj", -687904, -973739],
	["86", "CZ052", "Královéhradecký kraj", -641027, -1042391],
	["94", "CZ053", "Pardubický kraj", -647000, -1060800],
	["108", "CZ063", "Kraj Vysočina", -669075, -1130105],
	["116", "CZ064", "Jihomoravský kraj", -597977, -1161136],
	["124", "CZ071", "Olomoucký kraj", -547169, -1121464],
	["132", "CZ080", "Moravskoslezský kraj", -470650, -1101660],
	["141", "CZ072", "Zlínský kraj", -521095, -1165015],
];

/** Districts: RÚIAN code, NUTS code, name, region's RÚIAN code, point. */
export const CZ_DISTRICTS_RUIAN: [string, string, string, string, number, number][] = [
	["3201", "CZ0201", "Benešov", "27", -728486, -1079285],
	["3502", "CZ0421", "Děčín", "60", -746700, -964459],
	["3601", "CZ0631", "Havlíčkův Brod", "108", -666986, -1106637],
	["3702", "CZ0642", "Brno-město", "116", -597977, -1161136],
	["3807", "CZ0806", "Ostrava-město", "132", -470650, -1101660],
];

/** Municipalities: code, name, district's RÚIAN code (none for Prague), point. */
export const CZ_MUNICIPALITIES_RUIAN: [string, string, string | null, number, number][] = [
	["554782", "Praha", null, -743100, -1043300],
	["582786", "Brno", "3702", -597977, -1161136],
	["554821", "Ostrava", "3807", -470650, -1101660],
	["529303", "Benešov", "3201", -728486, -1079285],
	["529451", "Bystřice", "3201", -730615, -1084553],
	["529796", "Chocerady", "3201", -718937, -1070316],
	["530883", "Vlašim", "3201", -714452, -1089593],
	["562335", "Děčín", "3502", -746700, -964459],
	["562394", "Česká Kamenice", "3502", -732290, -964704],
	["568414", "Havlíčkův Brod", "3601", -666986, -1106637],
	// Two municipalities of one district share this name (RÚIAN 2026): the slug of the second
	// takes its code, and a facility naming it is placed by distance.
	["569291", "Pohled", "3601", -662208, -1107688],
	["573591", "Pohled", "3601", -671500, -1117000],
];

/** Prague's administrative districts: code, name, point. */
export const CZ_PRAGUE_DISTRICTS_RUIAN: [string, string, number, number][] = [
	["19", "Praha 1", -742600, -1043000],
	["27", "Praha 2", -742900, -1044900],
	["35", "Praha 3", -739600, -1043300],
	["43", "Praha 4", -742300, -1046100],
	["51", "Praha 5", -744100, -1044200],
	["60", "Praha 6", -745700, -1040700],
	["78", "Praha 7", -741600, -1041700],
	["86", "Praha 8", -738600, -1040800],
	["94", "Praha 9", -736900, -1041300],
	["108", "Praha 10", -737600, -1045500],
	["116", "Praha 11", -737600, -1049600],
	["124", "Praha 12", -745000, -1051400],
	["132", "Praha 13", -750800, -1046200],
	["141", "Praha 14", -733300, -1042600],
	["159", "Praha 15", -733800, -1049100],
	["167", "Praha 19", -732900, -1039400],
	["175", "Praha 20", -728200, -1041900],
	["183", "Praha 21", -726100, -1046600],
	["191", "Praha 22", -731600, -1050500],
	["205", "Praha 16", -748200, -1053400],
	["213", "Praha 17", -751600, -1043700],
	["221", "Praha 18", -735400, -1038400],
];

/** Where a facility is: its municipality as the register writes it, district and region. */
type Town = {
	obec: string;
	okres: string;
	okresName: string;
	kraj: string;
	krajName: string;
	psc: string;
	/** WGS 84 centre the fixture's points are spread around. */
	lat: number;
	lng: number;
};

const PRAGUE = (district: number, lat: number, lng: number): Town => ({
	obec: `Praha ${district}`,
	okres: "CZ0100",
	okresName: "Hlavní město Praha",
	kraj: "CZ010",
	krajName: "Hlavní město Praha",
	psc: `${10 + district}000`,
	lat,
	lng,
});

export const TOWNS = {
	praha1: PRAGUE(1, 50.0875, 14.4213),
	praha2: PRAGUE(2, 50.0755, 14.4378),
	praha3: PRAGUE(3, 50.0833, 14.4545),
	praha4: PRAGUE(4, 50.0411, 14.4478),
	praha5: PRAGUE(5, 50.0705, 14.4033),
	brno: {
		obec: "Brno",
		okres: "CZ0642",
		okresName: "Brno-město",
		kraj: "CZ064",
		krajName: "Jihomoravský kraj",
		psc: "60200",
		lat: 49.1951,
		lng: 16.6068,
	},
	ostrava: {
		obec: "Ostrava",
		okres: "CZ0806",
		okresName: "Ostrava-město",
		kraj: "CZ080",
		krajName: "Moravskoslezský kraj",
		psc: "70200",
		lat: 49.8347,
		lng: 18.282,
	},
	benesov: {
		obec: "Benešov",
		okres: "CZ0201",
		okresName: "Benešov",
		kraj: "CZ020",
		krajName: "Středočeský kraj",
		psc: "25601",
		lat: 49.7816,
		lng: 14.687,
	},
	chocerady: {
		obec: "Chocerady",
		okres: "CZ0201",
		okresName: "Benešov",
		kraj: "CZ020",
		krajName: "Středočeský kraj",
		psc: "25724",
		lat: 49.8733,
		lng: 14.8024,
	},
	decin: {
		obec: "Děčín",
		okres: "CZ0421",
		okresName: "Děčín",
		kraj: "CZ042",
		krajName: "Ústecký kraj",
		psc: "40502",
		lat: 50.7736,
		lng: 14.1958,
	},
	havlickuvBrod: {
		obec: "Havlíčkův Brod",
		okres: "CZ0631",
		okresName: "Havlíčkův Brod",
		kraj: "CZ063",
		krajName: "Kraj Vysočina",
		psc: "58001",
		lat: 49.6078,
		lng: 15.5807,
	},
} satisfies Record<string, Town>;

export type CzCase = {
	id: number;
	/** The place of care number (`ZZ_misto_poskytovani_ID`). */
	site: number;
	kind: string;
	kindName: string;
	name: string;
	natural: boolean;
	town: Town;
	/** The municipality written on the line, when it is not the town's (`Praha`, an unknown name). */
	obec?: string;
	street: string;
	number: string;
	/** WGS 84, or null for a line without coordinates. */
	point: [number, number] | null;
	fields: string;
	phone: string;
};

const KIND_NAMES: Record<string, string> = {
	"320": "Samost. ordinace všeob. prakt. lékaře",
	"321": "Sam.ord.prakt.lékaře pro děti a dorost",
	"322": "Samostatná ordinace PL - stomatologa",
	"323": "Samostatná ordinace PL - gynekologa",
	"324": "Samostatná ordinace lékaře specialisty",
	"340": "Samostatné zařízení psychologa",
	"341": "Samostatné zařízení logopeda",
	"350": "Domácí zdravotní péče",
	"351": "Samostatné zařízení fyzioterapeuta",
	"353": "Samostatné zařízení porodní asistence",
	"510": "Lékárna",
};

/** The anchors the end-to-end tests rely on (docs/data-import.md, "Czechia"). */
export const CZ_ANCHORS: CzCase[] = [
	{
		id: 900001,
		site: 9_900_001,
		kind: "320",
		kindName: KIND_NAMES["320"] ?? "",
		name: "MUDr. Jana Ukázková",
		natural: true,
		town: TOWNS.praha2,
		street: "Ukázková",
		number: "1234/12",
		point: [50.0755, 14.4378],
		fields: "všeobecné praktické lékařství",
		phone: "+420222333444",
	},
	{
		id: 900002,
		site: 9_900_002,
		kind: "510",
		kindName: KIND_NAMES["510"] ?? "",
		name: "Lékárna U Zlatého příkladu",
		natural: false,
		town: TOWNS.brno,
		street: "Příkladová",
		number: "5",
		point: [49.1951, 16.6068],
		fields: "praktické lékárenství",
		phone: "+420542000002",
	},
	{
		id: 900003,
		site: 9_900_003,
		kind: "324",
		kindName: KIND_NAMES["324"] ?? "",
		name: "Kardiologie Příklad s.r.o.",
		natural: false,
		town: TOWNS.ostrava,
		street: "Vzorová",
		number: "1672/4",
		point: [49.8347, 18.282],
		fields: "kardiologie, vnitřní lékařství",
		phone: "+420595000003",
	},
	{
		id: 900004,
		site: 9_900_004,
		kind: "322",
		kindName: KIND_NAMES["322"] ?? "",
		name: "Zubní ordinace Ukázkov s.r.o.",
		natural: false,
		town: TOWNS.chocerady,
		street: "",
		number: "15",
		point: [49.8733, 14.8024],
		fields: "zubní lékařství",
		phone: "+420317000004",
	},
	{
		id: 900005,
		site: 9_900_005,
		kind: "351",
		kindName: KIND_NAMES["351"] ?? "",
		name: "Mgr. Petra Smyšlená",
		natural: true,
		town: TOWNS.brno,
		street: "Fiktivní",
		number: "77",
		point: [49.1971, 16.6088],
		fields: "Fyzioterapeut",
		phone: "+420542000005",
	},
];

const SURNAMES = ["Ukázka", "Příklad", "Vzorek", "Fiktivní", "Smyšlený", "Zkušební", "Modelový"];
const FIRST = ["Jan", "Eva", "Petr", "Jana", "Pavel", "Lucie", "Tomáš", "Marie"];

/** `count` facilities of a kind spread over `towns`, numbered from `from`. */
function fillers(
	from: number,
	count: number,
	kind: string,
	towns: Town[],
	options: { fields: string | string[]; label: string; phonePrefix: string },
): CzCase[] {
	return Array.from({ length: count }, (_, index) => {
		const id = from + index;
		const town = towns[index % towns.length] as Town;
		const natural = index % 2 === 0;
		const surname = SURNAMES[index % SURNAMES.length] ?? "Ukázka";
		const first = FIRST[index % FIRST.length] ?? "Jan";
		const fields = Array.isArray(options.fields)
			? (options.fields[index % options.fields.length] ?? "")
			: options.fields;
		return {
			id,
			site: 9_000_000 + id,
			kind,
			kindName: KIND_NAMES[kind] ?? "",
			name: natural
				? `MUDr. ${first} ${surname} ${index + 1}`
				: `${options.label} ${surname} ${index + 1} s.r.o.`,
			natural,
			town,
			street: `Výplňová ${kind}`,
			number: String(100 + index),
			point: [town.lat + (index % 7) * 0.0007, town.lng + (index % 5) * 0.0009],
			fields,
			phone: `${options.phonePrefix}${String(index).padStart(3, "0")}`,
		};
	});
}

const P = TOWNS;
const PRAGUE_CORE = [P.praha1, P.praha2, P.praha3, P.praha4, P.praha5];

/** Every imported facility of the fixture: anchors, fillers and the placement cases. */
export function czCases(): CzCase[] {
	const cases: CzCase[] = [
		...CZ_ANCHORS,
		...fillers(901_000, 60, "320", [...PRAGUE_CORE, P.brno, P.ostrava, P.benesov], {
			fields: ["všeobecné praktické lékařství", "vnitřní lékařství, všeobecné praktické lékařství"],
			label: "Praktik",
			phonePrefix: "+420221100",
		}),
		...fillers(902_000, 24, "321", [P.praha2, P.brno, P.ostrava], {
			fields: "praktické lékařství pro děti a dorost",
			label: "Pediatrie",
			phonePrefix: "+420221200",
		}),
		...fillers(903_000, 60, "322", [...PRAGUE_CORE, P.brno, P.ostrava, P.chocerady], {
			fields: ["zubní lékařství", "Dentální hygienistka, zubní lékařství"],
			label: "Dentál",
			phonePrefix: "+420221300",
		}),
		...fillers(904_000, 24, "323", [P.praha2, P.brno, P.ostrava], {
			fields: "gynekologie a porodnictví",
			label: "Gynekologie",
			phonePrefix: "+420221400",
		}),
		...fillers(905_000, 105, "324", [P.praha1, P.praha2, P.brno, P.ostrava, P.decin], {
			fields: [
				"kardiologie, vnitřní lékařství",
				"neurologie",
				"oftalmologie",
				"dermatovenerologie",
				"psychiatrie",
				"ortopedie a traumatologie pohybového ústrojí",
				"soudní lékařství",
			],
			label: "Specialista",
			phonePrefix: "+420221500",
		}),
		...fillers(906_000, 54, "510", [...PRAGUE_CORE, P.brno, P.ostrava, P.havlickuvBrod], {
			fields: "praktické lékárenství",
			label: "Lékárna",
			phonePrefix: "+420221600",
		}),
		...fillers(907_000, 12, "350", [P.praha2, P.brno, P.ostrava], {
			fields: ["Všeobecná sestra", "paliativní medicína, Všeobecná sestra"],
			label: "Domácí péče",
			phonePrefix: "+420221700",
		}),
		...fillers(908_000, 24, "351", [P.praha2, P.brno, P.ostrava], {
			fields: "Fyzioterapeut",
			label: "Fyzio",
			phonePrefix: "+420221800",
		}),
		...fillers(909_000, 12, "340", [P.praha2, P.brno, P.ostrava], {
			fields: "Klinický psycholog",
			label: "Psychologie",
			phonePrefix: "+420221900",
		}),
		...fillers(910_000, 12, "341", [P.praha2, P.brno, P.ostrava], {
			fields: "Klinický logoped",
			label: "Logopedie",
			phonePrefix: "+420222000",
		}),
		...fillers(911_000, 9, "353", [P.praha2, P.brno, P.ostrava], {
			fields: "Porodní asistentka",
			label: "Porodní asistence",
			phonePrefix: "+420222100",
		}),
	];
	// A pharmacy chain: one head-office number on six pharmacies, never stored as theirs.
	for (let index = 0; index < 6; index++) {
		cases.push({
			id: 912_000 + index,
			site: 9_912_000 + index,
			kind: "510",
			kindName: KIND_NAMES["510"] ?? "",
			name: `Lékárny Vzorek a.s., Lékárna ${index + 1}`,
			natural: false,
			town: [P.praha1, P.brno, P.ostrava][index % 3] as Town,
			street: "Řetězová",
			number: String(index + 1),
			point: null,
			fields: "praktické lékárenství",
			phone: "+420222999000",
		});
	}
	for (const [index, pharmacy] of cases.slice(-6).entries()) {
		pharmacy.point = [pharmacy.town.lat + 0.001 * index, pharmacy.town.lng];
	}
	// Placement cases: Prague without a district (nearest district), a name RÚIAN does not
	// know (nearest municipality), an ambiguous name (nearest of the two), no coordinates.
	cases.push(
		{
			id: 913_001,
			site: 9_913_001,
			kind: "320",
			kindName: KIND_NAMES["320"] ?? "",
			name: "Ordinace Pražský příklad s.r.o.",
			natural: false,
			town: P.praha2,
			obec: "Praha",
			street: "Nádražní příklad",
			number: "9",
			point: [50.0748, 14.4381],
			fields: "všeobecné praktické lékařství",
			phone: "+420222100901",
		},
		{
			id: 913_002,
			site: 9_913_002,
			kind: "320",
			kindName: KIND_NAMES["320"] ?? "",
			name: "Ordinace Smyšlená Lhota s.r.o.",
			natural: false,
			town: P.benesov,
			obec: "Smyšlená Lhota",
			street: "",
			number: "3",
			point: [49.7465, 14.6582],
			fields: "všeobecné praktické lékařství",
			phone: "+420222100902",
		},
		{
			id: 913_003,
			site: 9_913_003,
			kind: "322",
			kindName: KIND_NAMES["322"] ?? "",
			name: "Zubní ordinace Pohled s.r.o.",
			natural: false,
			town: P.havlickuvBrod,
			obec: "Pohled",
			street: "Hlavní příklad",
			number: "2",
			point: [49.6012, 15.6461],
			fields: "zubní lékařství",
			phone: "+420222100903",
		},
		{
			id: 913_004,
			site: 9_913_004,
			kind: "320",
			kindName: KIND_NAMES["320"] ?? "",
			name: "Ordinace Bez souřadnic s.r.o.",
			natural: false,
			town: P.benesov,
			street: "Neznámá",
			number: "1",
			point: null,
			fields: "všeobecné praktické lékařství",
			phone: "+420222100904",
		},
	);
	return cases;
}

/** Kinds of facility the import leaves out (hospitals, laboratories, opticians…), as lines. */
const OUT_OF_SCOPE: [string, string][] = [
	["102", "Nemocnice"],
	["301", "Poskytovatel amb. služeb (nad 5 oborů)"],
	["360", "Samostatná stomatologická laboratoř"],
	["481", "Zdravotnická zachranná služba"],
	["523", "Oční optika"],
];

export type CzFixtureSet = {
	cases: CzCase[];
	/** Lines of kinds the import leaves out, to bring the file above its line floor. */
	outOfScope: number;
	/** Appended to every filler's street (a run that changes many pages). */
	fillerStreetSuffix?: string;
};

export const CZ_FACILITIES: CzFixtureSet = { cases: czCases(), outOfScope: 650 };

/** The 49 columns of the export, in order. */
const HEADER = [
	"poskytovatel_ICO",
	"ZZ_ID",
	"ZZ_kod",
	"PCZ",
	"PCDP",
	"ZZ_nazev",
	"ZZ_druh_kod",
	"ZZ_druh_nazev",
	"ZZ_druh_nazev_sekundarni",
	"ZZ_misto_poskytovani_ID",
	"ZZ_kraj_kod",
	"ZZ_kraj_nazev",
	"ZZ_okres_kod",
	"ZZ_okres_nazev",
	"ZZ_ORP_kod",
	"ZZ_ORP_nazev",
	"ZZ_obec",
	"ZZ_spravni_obvod",
	"ZZ_PSC",
	"ZZ_ulice",
	"ZZ_cislo_domovni_orientacni",
	"ZZ_RUIAN_kod",
	"ZZ_GPS",
	"ZZ_datum_zahajeni_cinnosti",
	"ZZ_obor_pece",
	"ZZ_forma_pece",
	"ZZ_druh_pece",
	"ZZ_rozsah_pece",
	"poskytovatel_druh",
	"poskytovatel_nazev",
	"poskytovatel_osoba_typ",
	"poskytovatel_pravni_forma_kod",
	"poskytovatel_pravni_forma_nazev",
	"poskytovatel_sidlo_kraj_kod",
	"poskytovatel_sidlo_kraj_nazev",
	"poskytovatel_sidlo_okres_kod",
	"poskytovatel_sidlo_okres_nazev",
	"poskytovatel_sidlo_obec",
	"poskytovatel_sidlo_PSC",
	"poskytovatel_sidlo_ulice",
	"poskytovatel_sidlo_cislo_domovni_orientacni",
	"poskytovatel_sidlo_RUIAN_kod",
	"poskytovatel_telefon",
	"poskytovatel_fax",
	"poskytovatel_email",
	"poskytovatel_web",
	"poskytovatel_datova_schranka",
	"poskytovatel_odborny_zastupce",
	"zrizovatel_typ",
];

/** The columns written unquoted by the register (numbers). */
const NUMERIC = new Set([
	"poskytovatel_ICO",
	"ZZ_ID",
	"ZZ_kod",
	"ZZ_druh_kod",
	"ZZ_misto_poskytovani_ID",
	"ZZ_ORP_kod",
	"ZZ_PSC",
	"ZZ_cislo_domovni_orientacni",
	"ZZ_RUIAN_kod",
	"poskytovatel_pravni_forma_kod",
	"poskytovatel_sidlo_PSC",
	"poskytovatel_sidlo_RUIAN_kod",
]);

const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;

function line(values: Record<string, string>): string {
	return HEADER.map((name) => {
		const value = values[name] ?? "";
		return NUMERIC.has(name) && /^\d+$/.test(value) ? value : quote(value);
	}).join(",");
}

/** The NRPZS export of a fixture set. */
export function nrpzsCsv(set: CzFixtureSet = CZ_FACILITIES): string {
	const lines = [HEADER.map(quote).join(",")];
	for (const item of set.cases) {
		const ico = `99${String(item.id).padStart(6, "0")}`;
		const filler = item.id >= 901_000;
		lines.push(
			line({
				poskytovatel_ICO: ico,
				ZZ_ID: String(item.id),
				ZZ_kod: `${ico}000000`,
				PCZ: "000",
				PCDP: "000",
				ZZ_nazev: item.name,
				ZZ_druh_kod: item.kind,
				ZZ_druh_nazev: item.kindName,
				ZZ_misto_poskytovani_ID: String(item.site),
				ZZ_kraj_kod: item.town.kraj,
				ZZ_kraj_nazev: item.town.krajName,
				ZZ_okres_kod: item.town.okres,
				ZZ_okres_nazev: item.town.okresName,
				ZZ_ORP_kod: "1000",
				ZZ_ORP_nazev: item.town.okresName,
				ZZ_obec: item.obec ?? item.town.obec,
				ZZ_spravni_obvod: item.town.okres === "CZ0100" ? item.town.obec : "",
				ZZ_PSC: item.town.psc,
				ZZ_ulice: item.street
					? `${item.street}${filler && set.fillerStreetSuffix ? set.fillerStreetSuffix : ""}`
					: "",
				ZZ_cislo_domovni_orientacni: item.number,
				ZZ_RUIAN_kod: String(90_000_000 + item.id),
				ZZ_GPS: item.point ? `POINT(${item.point[0].toFixed(6)} ${item.point[1].toFixed(6)})` : "",
				ZZ_datum_zahajeni_cinnosti: "2020-01-01",
				ZZ_obor_pece: item.fields,
				ZZ_forma_pece: "ambulantní péče",
				poskytovatel_druh: item.kindName,
				poskytovatel_nazev: item.natural ? item.name.replace(/^MUDr\. /, "MUDr.") : item.name,
				poskytovatel_osoba_typ: item.natural ? "fyzická osoba" : "právnická osoba",
				poskytovatel_pravni_forma_kod: item.natural ? "" : "112",
				poskytovatel_pravni_forma_nazev: item.natural ? "" : "Společnost s ručením omezeným",
				poskytovatel_sidlo_kraj_kod: item.town.kraj,
				poskytovatel_sidlo_kraj_nazev: item.town.krajName,
				poskytovatel_sidlo_okres_kod: item.town.okres,
				poskytovatel_sidlo_okres_nazev: item.town.okresName,
				poskytovatel_sidlo_obec: item.town.obec,
				poskytovatel_sidlo_PSC: item.town.psc,
				poskytovatel_sidlo_ulice: "Domovská smyšlená",
				poskytovatel_sidlo_cislo_domovni_orientacni: String(item.id % 1000),
				poskytovatel_sidlo_RUIAN_kod: String(80_000_000 + item.id),
				poskytovatel_telefon: item.phone,
				poskytovatel_fax: "+420299999999",
				poskytovatel_email: `ordinace${item.id}@example.invalid`,
				poskytovatel_web: `https://ordinace${item.id}.example.invalid`,
				poskytovatel_datova_schranka: `ds${item.id}`,
				poskytovatel_odborny_zastupce: "MUDr. Zástupce Smyšlený",
				zrizovatel_typ: item.natural ? "Fyzická osoba" : "Jiná právnická osoba",
			}),
		);
	}
	for (let index = 0; index < set.outOfScope; index++) {
		const [kind, kindName] = OUT_OF_SCOPE[index % OUT_OF_SCOPE.length] as [string, string];
		const id = 950_000 + index;
		lines.push(
			line({
				poskytovatel_ICO: `98${String(id).padStart(6, "0")}`,
				ZZ_ID: String(id),
				ZZ_nazev: `${kindName} Výplň ${index + 1}`,
				ZZ_druh_kod: kind,
				ZZ_druh_nazev: kindName,
				ZZ_misto_poskytovani_ID: String(9_500_000 + index),
				ZZ_kraj_kod: "CZ064",
				ZZ_okres_kod: "CZ0642",
				ZZ_obec: "Brno",
				ZZ_PSC: "60200",
				poskytovatel_osoba_typ: "právnická osoba",
			}),
		);
	}
	// A line the import cannot read (its facility number is not one): quarantined.
	lines.push(
		line({ ZZ_ID: "x1", ZZ_nazev: "Výplň nečitelná", ZZ_druh_kod: "320", ZZ_obec: "Brno" }),
	);
	return `${lines.join("\n")}\n`;
}

const pos = (x: number, y: number) => `${x.toFixed(2)} ${y.toFixed(2)}`;
const SRS = 'srsName="urn:ogc:def:crs:EPSG::5514" srsDimension="2"';

/** The RÚIAN state file of the fixture's places (the VFR elements the import reads). */
export function ruianXml(): string {
	const parts: string[] = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<vf:VymennyFormat xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:vf="urn:cz:isvs:ruian:schemas:VymennyFormatTypy:v1" xmlns:vci="urn:cz:isvs:ruian:schemas:VuscIntTypy:v1" xmlns:oki="urn:cz:isvs:ruian:schemas:OkresIntTypy:v1" xmlns:obi="urn:cz:isvs:ruian:schemas:ObecIntTypy:v1" xmlns:spi="urn:cz:isvs:ruian:schemas:SpravObvIntTypy:v1">',
		"<vf:Hlavicka><vf:VerzeVFR>3.1</vf:VerzeVFR><vf:TypSouboru>ST_UZSZ</vf:TypSouboru><vf:Datum>2026-11-01T00:00:29</vf:Datum></vf:Hlavicka>",
		"<vf:Data><vf:Vusc>",
	];
	for (const [code, nuts, name, x, y] of CZ_REGIONS_RUIAN) {
		parts.push(
			`<vf:Vusc gml:id="VC.${code}"><vci:Kod>${code}</vci:Kod><vci:Nazev>${name}</vci:Nazev><vci:NutsLau>${nuts}</vci:NutsLau><vci:Geometrie><vci:DefinicniBod><gml:Point gml:id="DVC.${code}" ${SRS}><gml:pos>${pos(x, y)}</gml:pos></gml:Point></vci:DefinicniBod></vci:Geometrie></vf:Vusc>`,
		);
	}
	parts.push("</vf:Vusc><vf:Okresy>");
	for (const [code, nuts, name, region, x, y] of CZ_DISTRICTS_RUIAN) {
		parts.push(
			`<vf:Okres gml:id="OK.${code}"><oki:Kod>${code}</oki:Kod><oki:Nazev>${name}</oki:Nazev><oki:Vusc><vci:Kod>${region}</vci:Kod></oki:Vusc><oki:NutsLau>${nuts}</oki:NutsLau><oki:Geometrie><oki:DefinicniBod><gml:Point gml:id="DOK.${code}" ${SRS}><gml:pos>${pos(x, y)}</gml:pos></gml:Point></oki:DefinicniBod></oki:Geometrie></vf:Okres>`,
		);
	}
	parts.push("</vf:Okresy><vf:Obce>");
	for (const [code, name, district, x, y] of CZ_MUNICIPALITIES_RUIAN) {
		const okres = district ? `<obi:Okres><oki:Kod>${district}</oki:Kod></obi:Okres>` : "";
		parts.push(
			`<vf:Obec gml:id="OB.${code}"><obi:Kod>${code}</obi:Kod><obi:Nazev>${name}</obi:Nazev><obi:StatusKod>2</obi:StatusKod>${okres}<obi:Geometrie><obi:DefinicniBod><gml:MultiPoint gml:id="DOB.${code}" ${SRS}><gml:pointMembers><gml:Point gml:id="DOB.${code}.1"><gml:pos>${pos(x, y)}</gml:pos></gml:Point></gml:pointMembers></gml:MultiPoint></obi:DefinicniBod></obi:Geometrie></vf:Obec>`,
		);
	}
	parts.push("</vf:Obce><vf:SpravniObvody>");
	for (const [code, name, x, y] of CZ_PRAGUE_DISTRICTS_RUIAN) {
		parts.push(
			`<vf:SpravniObvod gml:id="SP.${code}"><spi:Kod>${code}</spi:Kod><spi:Nazev>${name}</spi:Nazev><spi:Obec><obi:Kod>554782</obi:Kod></spi:Obec><spi:Geometrie><spi:DefinicniBod><gml:Point gml:id="DSP.${code}" ${SRS}><gml:pos>${pos(x, y)}</gml:pos></gml:Point></spi:DefinicniBod></spi:Geometrie></vf:SpravniObvod>`,
		);
	}
	parts.push("</vf:SpravniObvody></vf:Data></vf:VymennyFormat>");
	return `${parts.join("\n")}\n`;
}

export function writeCzFixtures(dir: string, set: CzFixtureSet = CZ_FACILITIES) {
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "nrpzs.csv"), nrpzsCsv(set));
	writeFileSync(join(dir, "ruian-st-uzsz.xml"), ruianXml());
}

if (import.meta.main) {
	writeCzFixtures(CZ_FIXTURES);
	console.log(`Wrote the synthetic Czech fixtures to ${CZ_FIXTURES}`);
}
