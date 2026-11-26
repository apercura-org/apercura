/**
 * Generates the SYNTHETIC fixtures in `fixtures/es/`: the three monthly extracts of REGCESS in
 * their exact format (`centros_C1.xlsx`, `centros_C2.xlsx`, `centros_E.xlsx`: one worksheet,
 * shared strings, the register's column headers) and the two collections of the IGN's API that
 * `etl:places --country es` reads (`ign-unidades-administrativas.json`, `ign-nucleos.json`),
 * filled with fictitious centres.
 *
 * Every centre is made up: names are made-up words (Ejemplo, Muestra, Ficticio, Prueba,
 * Modelo…), the professionals some practices and pharmacies are named after are invented (`DRA.
 * ANA EJEMPLAR FICTICIA`), streets do not exist, centre codes use the sequence 900001 and above
 * (the real register's stop near 34000), and phone numbers are in a range no centre of the real
 * extracts uses. Each row also carries a made-up regional code, e-mail, fax, web address and
 * authorisation dates, so the tests can check they are never stored. Never commit real rows.
 * Deterministic: the same files on every run. Run with `bun run --cwd packages/etl fixtures:es`.
 *
 * The communities, provinces and municipalities are real public IGN names and INE codes, and the
 * points the real capital population centres of the municipalities: a small subset of the API.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeXlsx } from "../src/lib/xlsx";

export const ES_FIXTURES = join(import.meta.dirname, "es");

/** Communities: INE code, IGN name, REGCESS name. */
export const ES_COMMUNITIES_IGN: [string, string, string][] = [
	["01", "Andalucía", "Andalucía"],
	["05", "Canarias", "Canarias"],
	["09", "Cataluña/Catalunya", "Cataluña"],
	["10", "Comunitat Valenciana", "Comunitat Valenciana"],
	["13", "Comunidad de Madrid", "Madrid, Comunidad de"],
];

/** Provinces: INE code, community, IGN name, REGCESS name. */
export const ES_PROVINCES_IGN: [string, string, string, string][] = [
	["03", "10", "Alacant/Alicante", "Alicante/Alacant"],
	["08", "09", "Barcelona", "Barcelona"],
	["28", "13", "Madrid", "Madrid"],
	["35", "05", "Las Palmas", "Palmas, Las"],
	["41", "01", "Sevilla", "Sevilla"],
	["46", "10", "València/Valencia", "Valencia/València"],
];

/**
 * Municipalities: INE code, IGN name, REGCESS name, and the capital population centre's point
 * (longitude, latitude), population and capital flags; null for a municipality the IGN gives no
 * population centre (el Brull): its centres are placed there, without a point.
 */
export const ES_MUNICIPALITIES_IGN: [
	string,
	string,
	string,
	[number, number, number, string] | null,
][] = [
	["28079", "Madrid", "Madrid", [-3.691978, 40.419026, 3422416, "111100"]],
	["28006", "Alcobendas", "Alcobendas", [-3.641871, 40.547459, 121330, "000100"]],
	// Its population centre is not flagged as the capital: the most populous one locates it.
	["28065", "Getafe", "Getafe", [-3.732332, 40.305551, 161160, "000000"]],
	["08019", "Barcelona", "Barcelona", [2.15465, 41.394708, 1686208, "011100"]],
	[
		"08101",
		"L'Hospitalet de Llobregat",
		"Hospitalet de Llobregat, L'",
		[2.111387, 41.36383, 282299, "000100"],
	],
	["08026", "el Brull", "Brull, El", null],
	["46250", "València", "Valencia", [-0.377393, 39.469901, 784303, "011100"]],
	["03014", "Alacant/Alicante", "Alicante/Alacant", [-0.491955, 38.354831, 345455, "001100"]],
	["03090", "Mutxamel", "Mutxamel", [-0.446237, 38.415027, 15107, "000100"]],
	["41091", "Sevilla", "Sevilla", [-5.994477, 37.388637, 685914, "011100"]],
	[
		"35016",
		"Las Palmas de Gran Canaria",
		"Palmas de Gran Canaria, Las",
		[-15.42847, 28.124924, 302202, "011100"],
	],
];

/** A municipality the register names but the IGN's units of the fixture do not know (Elx). */
export const ES_UNKNOWN_MUNICIPALITY = { code: "03065", name: "Elche/Elx", province: "03" };

/** The extract a centre is in. */
type Listing = "C1" | "C2" | "E";

export type EsCase = {
	/** REGCESS centre code (CCN), ten digits. */
	id: string;
	listing: Listing;
	/** `Tipo centro`, as the register writes it. */
	type: string;
	/** Name in capitals, as the register writes it. */
	name: string;
	municipality: string;
	wayType: string;
	street: string;
	number: string;
	postcode: string;
	phone: string;
	/** `Grupo de dependencia funcional`: `Publicos` or `Privados`. */
	dependency: string;
	/** `Oferta Asistencial`, as the register writes it (`U.7 Cardiología,`). */
	units: string;
};

export type EsFixtureSet = {
	cases: EsCase[];
	/** Rows of each extract of a type the import leaves out. */
	outOfScope: Record<Listing, number>;
	/** Appended to the street of every filler centre: changes more than 10% of the pages. */
	fillerStreetSuffix?: string;
};

const TYPES = {
	C11: "C11 - Hospitales Generales",
	C12: "C12 - Hospitales especializados",
	C13: "C13 - Hospitales de media y larga estancia",
	C14: "C14 - Hospitales de salud mental y tratamiento de toxicomanías",
	C21: "C21 - Consultas Médicas",
	C22: "C22 - Consultas de Otros Profesionales Sanitarios",
	C231: "C231 - Centros de salud",
	C232: "C232 - Consultorios de atencion primaria",
	C24: "C24 - Centros Polivalentes",
	C251: "C251 - Clínicas Dentales",
	E1: "E1 - Oficinas de farmacia",
} as const;

const OUT_OF_SCOPE: Record<Listing, string[]> = {
	C1: ["C190 - Otros Centros con Internamiento"],
	C2: [
		"C257 - Centros moviles de asistencia sanitaria",
		"C256 - Centros de Diagnostico",
		"C255 - Centros de Diálisis",
		"C2511 - Centros de Salud Mental",
		"C2590 - Otros Centros Especializados",
		"C290 - Otros proveedores de asistencia sin internamiento",
	],
	E: [
		"E3 - Opticas",
		"E5 - Establecimientos de  audioprotesis",
		"E4 - Ortopedias",
		"E2 - Botiquines",
	],
};

const UNITS = {
	gp: "U.1 Medicina general/de familia",
	nursing: "U.2 Enfermería",
	midwife: "U.3 Enfermería obstétrico-ginecológica (matrona)",
	podiatry: "U.4 Podología",
	vaccination: "U.5 Vacunación",
	cardiology: "U.7 Cardiología",
	dermatology: "U.8 Dermatología",
	internal: "U.13 Medicina interna",
	paediatrics: "U.20 Pediatría",
	gynaecology: "U.26 Ginecología",
	dental: "U.44 Odontología/Estomatología",
	aesthetic: "U.48 Medicina estética",
	ophthalmology: "U.50 Oftalmología",
	trauma: "U.55 Cirugía ortopédica y Traumatología",
	physio: "U.59 Fisioterapia",
	speech: "U.61 Logopedia",
	home: "U.66 Atención sanitaria domiciliaria",
	emergency: "U.68 Urgencias",
	psychiatry: "U.69 Psiquiatría",
	psychology: "U.70 Psicología clínica",
	samples: "U.72 Obtención de muestras",
	medicines: "U.84 Depósito de medicamentos",
	transport: "U.100 Transporte sanitario (carretera, aéreo, marítimo)",
	other: "U.900 Otras unidades asistenciales",
} as const;

const units = (...list: string[]) => list.map((unit) => `${unit},`).join("");

/** Made-up words of the names: never a real centre's. */
const WORDS = [
	"EJEMPLO",
	"MUESTRA",
	"FICTICIO",
	"PRUEBA",
	"MODELO",
	"SIMULADO",
	"INVENTADO",
	"IMAGINARIO",
	"SUPUESTO",
	"FINGIDO",
	"PATRON",
	"BOCETO",
];

/** Community code of a province, for the centre codes. */
const COMMUNITY_OF: Record<string, string> = Object.fromEntries(
	ES_PROVINCES_IGN.map(([province, community]) => [province, community]),
);

/** A synthetic centre code: community, province, then 9 and five digits. */
export const esCode = (province: string, seq: number) =>
	`${COMMUNITY_OF[province] ?? "13"}${province}9${String(seq).padStart(5, "0")}`;

/** The anchors the end-to-end tests read (`apps/web/e2e/es.spec.ts`). */
export const ES_ANCHORS = {
	dental: "1328900001",
	healthCentre: "1328900002",
	pharmacy: "1328900003",
	hospital: "1328900004",
	cardiology: "1328900005",
	psychology: "1328900006",
	localClinic: "1328900007",
	/** A practice named after a (made-up) doctor. */
	namedDoctor: "1328900008",
	/** A practice in a municipality the places do not know: placed in its province. */
	unknownMunicipality: "1003900009",
	/** A centre in el Brull, which has no population centre: placed, without a point. */
	noPoint: "0908900010",
	/** Another professional's practice whose only unit is "other units", not a psychologist. */
	otherProfessional: "1328900011",
	/** A doctor's practice with no unit that decides a listing. */
	plainPractice: "1328900012",
} as const;

/** The fictitious centres of the fixture, deterministic. */
export function esCases(): EsCase[] {
	const cases: EsCase[] = [];
	let seq = 100;
	const add = (item: Omit<EsCase, "id"> & { id?: string }) => {
		const province = item.municipality.slice(0, 2);
		cases.push({ ...item, id: item.id ?? esCode(province, seq++) });
	};
	const base = (municipality: string, index: number) => ({
		municipality,
		wayType: (["CALLE", "AVDA", "PLAZA", "PASEO"] as const)[index % 4] ?? "CALLE",
		street: `${WORDS[index % WORDS.length]} ${WORDS[(index + 5) % WORDS.length]}`,
		number: index % 7 === 0 ? "S/N" : String((index % 90) + 1),
		postcode: postcodeOf(municipality),
		phone: `9${municipality.slice(0, 2)}99${String(index).padStart(4, "0")}`.slice(0, 9),
		dependency: "Privados",
	});

	// The anchors, in Madrid.
	const madrid = "28079";
	add({
		...base(madrid, 1),
		id: ES_ANCHORS.dental,
		listing: "C2",
		type: TYPES.C251,
		name: "CLINICA DENTAL EJEMPLO CENTRO",
		wayType: "CALLE",
		street: "ALCALA",
		number: "10",
		postcode: "28014",
		phone: "910000001",
		units: units(UNITS.dental),
	});
	add({
		...base(madrid, 2),
		id: ES_ANCHORS.healthCentre,
		listing: "C2",
		type: TYPES.C231,
		name: "CENTRO DE SALUD EJEMPLO SOL",
		phone: "+34 910 000 002",
		dependency: "Publicos",
		units: units(UNITS.gp, UNITS.nursing, UNITS.paediatrics, UNITS.vaccination, UNITS.emergency),
	});
	add({
		...base(madrid, 3),
		id: ES_ANCHORS.pharmacy,
		listing: "E",
		type: TYPES.E1,
		name: "FARMACIA EJEMPLO MAYOR",
		phone: "910000003",
		units: "",
	});
	add({
		...base(madrid, 4),
		id: ES_ANCHORS.hospital,
		listing: "C1",
		type: TYPES.C11,
		name: "HOSPITAL GENERAL EJEMPLO",
		wayType: "AVDA",
		street: "DE LA PRUEBA",
		number: "S/N",
		phone: "910000004, 910000040",
		dependency: "Publicos",
		units: units(
			UNITS.gp,
			UNITS.nursing,
			UNITS.cardiology,
			UNITS.internal,
			UNITS.paediatrics,
			UNITS.emergency,
			UNITS.psychiatry,
			UNITS.trauma,
		),
	});
	add({
		...base(madrid, 5),
		id: ES_ANCHORS.cardiology,
		listing: "C2",
		type: TYPES.C21,
		name: "CONSULTA DE CARDIOLOGIA EJEMPLO",
		phone: "910000005",
		units: units(UNITS.internal, UNITS.cardiology, UNITS.medicines),
	});
	add({
		...base(madrid, 6),
		id: ES_ANCHORS.psychology,
		listing: "C2",
		type: TYPES.C22,
		name: "CONSULTA DE PSICOLOGIA SANITARIA EJEMPLO",
		phone: "910000006",
		units: units(UNITS.other),
	});
	add({
		...base(madrid, 7),
		id: ES_ANCHORS.localClinic,
		listing: "C2",
		type: TYPES.C232,
		name: "CONSULTORIO LOCAL EJEMPLO NORTE",
		phone: "910000007",
		dependency: "Publicos",
		units: units(UNITS.gp, UNITS.nursing, UNITS.home),
	});
	add({
		...base(madrid, 8),
		id: ES_ANCHORS.namedDoctor,
		listing: "C2",
		type: TYPES.C21,
		name: "DRA. ANA EJEMPLAR FICTICIA",
		number: "NÃ?Âº 5",
		phone: "000000000",
		units: units(UNITS.dermatology, UNITS.aesthetic),
	});
	add({
		...base("03065", 9),
		id: ES_ANCHORS.unknownMunicipality,
		listing: "C2",
		type: TYPES.C251,
		name: "CLINICA DENTAL MUESTRA ELX",
		postcode: "03201",
		units: units(UNITS.dental),
	});
	add({
		...base("08026", 10),
		id: ES_ANCHORS.noPoint,
		listing: "C2",
		type: TYPES.C232,
		name: "CONSULTORI LOCAL DEL BRULL",
		postcode: "08559",
		dependency: "Publicos",
		units: units(UNITS.gp, UNITS.nursing),
	});
	add({
		...base(madrid, 11),
		id: ES_ANCHORS.otherProfessional,
		listing: "C2",
		type: TYPES.C22,
		name: "SERVICIOS SANITARIOS SUPUESTO SLU",
		units: units(UNITS.other),
	});
	add({
		...base(madrid, 12),
		id: ES_ANCHORS.plainPractice,
		listing: "C2",
		type: TYPES.C21,
		name: "CONSULTA MEDICA BOCETO",
		units: units(UNITS.medicines, UNITS.samples),
	});

	// The filler: enough centres of each kind for listings with three or more pages.
	type Kind = { listing: Listing; type: string; prefix: string; units: string; public?: boolean };
	const kinds: Record<string, Kind> = {
		dental: {
			listing: "C2",
			type: TYPES.C251,
			prefix: "CLINICA DENTAL",
			units: units(UNITS.dental),
		},
		pharmacy: { listing: "E", type: TYPES.E1, prefix: "FARMACIA", units: "" },
		health: {
			listing: "C2",
			type: TYPES.C231,
			prefix: "CENTRO DE SALUD",
			units: units(UNITS.gp, UNITS.nursing, UNITS.paediatrics),
			public: true,
		},
		local: {
			listing: "C2",
			type: TYPES.C232,
			prefix: "CONSULTORIO LOCAL",
			units: units(UNITS.gp, UNITS.nursing),
			public: true,
		},
		cardiology: {
			listing: "C2",
			type: TYPES.C21,
			prefix: "CONSULTA DE CARDIOLOGIA",
			units: units(UNITS.cardiology),
		},
		gp: { listing: "C2", type: TYPES.C21, prefix: "CONSULTA MEDICA", units: units(UNITS.gp) },
		paediatrics: {
			listing: "C2",
			type: TYPES.C21,
			prefix: "CONSULTA DE PEDIATRIA",
			units: units(UNITS.paediatrics),
		},
		gynaecology: {
			listing: "C2",
			type: TYPES.C21,
			prefix: "CONSULTA GINECOLOGICA",
			units: units(UNITS.gynaecology),
		},
		ophthalmology: {
			listing: "C2",
			type: TYPES.C21,
			prefix: "CLINICA OFTALMOLOGICA",
			units: units(UNITS.ophthalmology),
		},
		psychology: {
			listing: "C2",
			type: TYPES.C22,
			prefix: "CENTRO DE PSICOLOGIA",
			units: units(UNITS.other),
		},
		physio: {
			listing: "C2",
			type: TYPES.C22,
			prefix: "FISIOTERAPIA",
			units: units(UNITS.physio),
		},
		podiatry: {
			listing: "C2",
			type: TYPES.C22,
			prefix: "CLINICA DEL PIE",
			units: units(UNITS.podiatry, UNITS.physio),
		},
		speech: { listing: "C2", type: TYPES.C22, prefix: "LOGOPEDIA", units: units(UNITS.speech) },
		polyclinic: {
			listing: "C2",
			type: TYPES.C24,
			prefix: "POLICLINICA",
			units: units(UNITS.gp, UNITS.physio, UNITS.podiatry, UNITS.dermatology),
		},
		hospital: {
			listing: "C1",
			type: TYPES.C11,
			prefix: "HOSPITAL",
			units: units(UNITS.gp, UNITS.nursing, UNITS.emergency, UNITS.trauma),
			public: true,
		},
		longStay: {
			listing: "C1",
			type: TYPES.C13,
			prefix: "HOSPITAL DE MEDIA ESTANCIA",
			units: units(UNITS.nursing, UNITS.physio),
		},
		mentalHealth: {
			listing: "C1",
			type: TYPES.C14,
			prefix: "CLINICA PSIQUIATRICA",
			units: units(UNITS.psychiatry, UNITS.psychology),
		},
	};
	/** Centres per municipality and kind. */
	const plan: Record<string, Partial<Record<keyof typeof kinds, number>>> = {
		"28079": {
			dental: 5,
			pharmacy: 5,
			health: 4,
			local: 1,
			cardiology: 4,
			gp: 4,
			paediatrics: 4,
			gynaecology: 4,
			ophthalmology: 3,
			psychology: 5,
			physio: 5,
			podiatry: 4,
			speech: 3,
			polyclinic: 4,
			hospital: 5,
			longStay: 2,
			mentalHealth: 2,
		},
		"28006": { dental: 4, pharmacy: 4, health: 3, physio: 3, hospital: 3 },
		"28065": { dental: 4, pharmacy: 4, health: 3, local: 3, psychology: 3, hospital: 3 },
		"08019": {
			dental: 5,
			pharmacy: 5,
			health: 4,
			cardiology: 3,
			psychology: 4,
			physio: 4,
			polyclinic: 3,
			hospital: 4,
			mentalHealth: 2,
		},
		"08101": { dental: 3, pharmacy: 4, health: 3, hospital: 3 },
		"08026": { pharmacy: 1 },
		"46250": {
			dental: 4,
			pharmacy: 5,
			health: 4,
			physio: 3,
			gp: 3,
			hospital: 4,
			longStay: 1,
		},
		"03014": { dental: 3, pharmacy: 4, health: 3, podiatry: 3, hospital: 3 },
		"03090": { dental: 3, pharmacy: 3, local: 3 },
		"41091": { dental: 4, pharmacy: 4, health: 3, psychology: 3, hospital: 3 },
		"35016": { dental: 4, pharmacy: 4, health: 3, physio: 3, hospital: 3 },
	};
	let index = 100;
	for (const [municipality, counts] of Object.entries(plan)) {
		for (const [kindName, count] of Object.entries(counts)) {
			const kind = kinds[kindName];
			if (!kind || !count) continue;
			for (let n = 0; n < count; n++) {
				index++;
				const word = WORDS[index % WORDS.length] ?? "EJEMPLO";
				// Every third pharmacy is named after its (made-up) titular pharmacist, as in Spain.
				const name =
					kindName === "pharmacy" && index % 3 === 0
						? `${["MARIA", "JOSE", "CARMEN", "LUIS"][index % 4]} ${word} ${WORDS[(index + 3) % WORDS.length]}`
						: `${kind.prefix} ${word} ${index}`;
				add({
					...base(municipality, index),
					listing: kind.listing,
					type: kind.type,
					name,
					dependency: kind.public ? "Publicos" : "Privados",
					units: kind.units,
				});
			}
		}
	}
	// A chain's number on five dental clinics: a head office's, not stored.
	for (const item of cases
		.filter((c) => c.type === TYPES.C251 && c.municipality !== madrid)
		.slice(0, 5)) {
		item.phone = "902999000";
	}
	return cases;
}

/** A postcode of the municipality (made-up within the province's range). */
function postcodeOf(municipality: string): string {
	const known: Record<string, string> = {
		"28079": "28013",
		"28006": "28100",
		"28065": "28901",
		"08019": "08001",
		"08101": "08901",
		"08026": "08559",
		"46250": "46001",
		"03014": "03001",
		"03090": "03110",
		"41091": "41001",
		"35016": "35001",
		"03065": "03201",
	};
	return known[municipality] ?? `${municipality.slice(0, 2)}001`;
}

export const ES_CENTRES: EsFixtureSet = {
	cases: esCases(),
	outOfScope: { C1: 15, C2: 900, E: 300 },
};

const HEADERS_C = [
	"Tipo centro",
	"Código de Centro Normalizado\nREGCESS (CCN)",
	"Código Autonómico\ndel Centro",
	"Nombre Centro",
	"Código Comunidad Autónoma",
	"Comunidad Autónoma",
	"Código Provincia",
	"Provincia",
	"Código Municipio",
	"Municipio",
	"Código\nTipo Vía",
	"Nombre de la vía",
	"Número\nVía",
	"Código\nPostal",
	"Correo \nElectrónico",
	"Fax",
	"Teléfono",
	"Url",
	"Código Dependencia\nFuncional",
	"Dependencia \nFuncional",
	"Área o Sector",
	"Grupo de dependencia \nFuncional",
	"Fecha Autorización \nde Funcionamiento",
	"Fecha de última \nAutorización",
	"Tipo de última\nAutorización",
	"Modificación Estructural",
];

/** The column headers of each extract, in the register's order. */
export const ES_HEADERS: Record<Listing, string[]> = {
	C1: [...HEADERS_C, "Número \nCamas", "Oferta Asistencial"],
	C2: [...HEADERS_C, "Oferta Asistencial"],
	E: HEADERS_C.filter((header) => header !== "Área o Sector"),
};

const MUNICIPALITY_NAMES: Record<string, string> = {
	...Object.fromEntries(ES_MUNICIPALITIES_IGN.map(([code, , regcess]) => [code, regcess])),
	[ES_UNKNOWN_MUNICIPALITY.code]: ES_UNKNOWN_MUNICIPALITY.name,
};
const PROVINCE_NAMES: Record<string, string> = Object.fromEntries(
	ES_PROVINCES_IGN.map(([code, , , regcess]) => [code, regcess]),
);
const COMMUNITY_NAMES: Record<string, string> = Object.fromEntries(
	ES_COMMUNITIES_IGN.map(([code, , regcess]) => [code, regcess]),
);

/** A row of an extract, in its column order; what the import must never store is made up too. */
function sheetRow(listing: Listing, item: EsCase, streetSuffix = ""): string[] {
	const province = item.municipality.slice(0, 2);
	const community = COMMUNITY_OF[province] ?? "13";
	const values: Record<string, string> = {
		"Tipo centro": item.type,
		"Código de Centro Normalizado\nREGCESS (CCN)": item.id,
		"Código Autonómico\ndel Centro": `R-${item.id.slice(-5)}`,
		"Nombre Centro": item.name,
		"Código Comunidad Autónoma": community,
		"Comunidad Autónoma": COMMUNITY_NAMES[community] ?? "",
		"Código Provincia": province,
		Provincia: PROVINCE_NAMES[province] ?? "",
		// The INE code and a check digit (not computed: the import reads the first five digits).
		"Código Municipio": `${item.municipality}0`,
		Municipio: MUNICIPALITY_NAMES[item.municipality] ?? "",
		"Código\nTipo Vía": item.wayType,
		"Nombre de la vía": `${item.street}${streetSuffix}`,
		"Número\nVía": item.number,
		"Código\nPostal": item.postcode,
		"Correo \nElectrónico": `buzon${item.id.slice(-4)}@example.invalid`,
		Fax: "919990000",
		Teléfono: item.phone,
		Url: "https://example.invalid/centro",
		"Código Dependencia\nFuncional": item.dependency === "Publicos" ? "02" : "20",
		"Dependencia \nFuncional":
			item.dependency === "Publicos"
				? "Servicios o Institutos de Salud de las comunidades autónomas"
				: "Privados",
		"Área o Sector": item.dependency === "Publicos" ? "AREA FICTICIA" : "",
		"Grupo de dependencia \nFuncional": item.dependency,
		"Fecha Autorización \nde Funcionamiento": "01/02/2003",
		"Fecha de última \nAutorización": "04/05/2026",
		"Tipo de última\nAutorización": "Renovacion de funcionamiento",
		"Modificación Estructural": "NO",
		"Número \nCamas": listing === "C1" ? "120" : "",
		"Oferta Asistencial": item.units,
	};
	return ES_HEADERS[listing].map((header) => values[header] ?? "");
}

/** The worksheet rows of an extract of a fixture set. */
export function esSheetRows(listing: Listing, set: EsFixtureSet = ES_CENTRES): string[][] {
	const rows: string[][] = [ES_HEADERS[listing]];
	const anchors = new Set<string>(Object.values(ES_ANCHORS));
	for (const item of set.cases) {
		if (item.listing !== listing) continue;
		const filler = !anchors.has(item.id);
		rows.push(
			sheetRow(listing, item, filler && set.fillerStreetSuffix ? set.fillerStreetSuffix : ""),
		);
	}
	const types = OUT_OF_SCOPE[listing];
	for (let index = 0; index < set.outOfScope[listing]; index++) {
		const type = types[index % types.length] ?? "";
		const municipality =
			ES_MUNICIPALITIES_IGN[index % ES_MUNICIPALITIES_IGN.length]?.[0] ?? "28079";
		rows.push(
			sheetRow(listing, {
				id: esCode(
					municipality.slice(0, 2),
					{ C1: 50_000, C2: 60_000, E: 80_000 }[listing] + index,
				),
				listing,
				type,
				name: `${type.split(" - ")[1]?.toUpperCase() ?? "CENTRO"} RELLENO ${index + 1}`,
				municipality,
				wayType: "CALLE",
				street: "RELLENO",
				number: String(index + 1),
				postcode: postcodeOf(municipality),
				phone: "",
				dependency: "Privados",
				units: units(UNITS.transport),
			}),
		);
	}
	if (listing === "C2") {
		// A row the import cannot read (its centre code is not one): quarantined.
		rows.push(
			sheetRow(listing, {
				id: "X1",
				listing,
				type: TYPES.C251,
				name: "CLINICA ILEGIBLE",
				municipality: "28079",
				wayType: "CALLE",
				street: "ILEGIBLE",
				number: "1",
				postcode: "28001",
				phone: "",
				dependency: "Privados",
				units: units(UNITS.dental),
			}),
		);
	}
	return rows;
}

/** The IGN's administrative units of the fixture (communities, provinces, municipalities). */
export function ignUnits(): object {
	const level = (order: string) =>
		`https://inspire.ec.europa.eu/codelist/AdministrativeHierarchyLevel/${order}`;
	const feature = (code: string, name: string, order: string, levelName: string) => ({
		type: "Feature",
		properties: {
			nameunit: name,
			country: "ES",
			nationalcode: code,
			nationallevel: level(order),
			nationallevelname: levelName,
		},
		geometry: null,
	});
	const features = [
		feature("34000000000", "España", "1stOrder", "País"),
		...ES_COMMUNITIES_IGN.map(([code, name]) =>
			feature(`34${code}0000000`, name, "2ndOrder", "Comunidad autónoma"),
		),
		...ES_PROVINCES_IGN.map(([code, community, name]) =>
			feature(`34${community}${code}00000`, name, "3rdOrder", "Provincia"),
		),
		...ES_MUNICIPALITIES_IGN.map(([code, name]) => {
			const province = code.slice(0, 2);
			return feature(
				`34${COMMUNITY_OF[province]}${province}${code}`,
				name,
				"4thOrder",
				"Municipio",
			);
		}),
		// A shared territory and a territory outside any community: left out.
		feature("34205354001", "Parzonería ficticia", "4thOrder", "Territorio"),
	];
	return { type: "FeatureCollection", features, numberMatched: features.length };
}

/** The IGN's population centres of the fixture: each municipality's capital, and a smaller one. */
export function ignCentres(): object {
	const features: object[] = [];
	let id = 100_000_001;
	for (const [code, name, , point] of ES_MUNICIPALITIES_IGN) {
		if (!point) continue;
		const [longitude, latitude, population, capital] = point;
		features.push({
			type: "Feature",
			id,
			properties: {
				nombre: name,
				codine: `${code}000101`,
				capital,
				habitantes: population,
				longitud: longitude,
				latitud: latitude,
				tipo: "NUCL",
			},
			geometry: null,
		});
		id++;
		// A smaller population centre a few kilometres away: never the municipality's point.
		features.push({
			type: "Feature",
			id,
			properties: {
				nombre: `${name} (núcleo secundario)`,
				codine: `${code}000201`,
				capital: "000000",
				habitantes: Math.floor(population / 100),
				longitud: longitude + 0.03,
				latitud: latitude + 0.02,
				tipo: "NUCL",
			},
			geometry: null,
		});
		id++;
	}
	return { type: "FeatureCollection", features, numberMatched: features.length };
}

export function writeEsFixtures(dir: string, set: EsFixtureSet = ES_CENTRES) {
	mkdirSync(dir, { recursive: true });
	for (const listing of ["C1", "C2", "E"] as const) {
		writeFileSync(
			join(dir, `centros_${listing}.xlsx`),
			writeXlsx(esSheetRows(listing, set), { deflate: true }),
		);
	}
	writeFileSync(
		join(dir, "ign-unidades-administrativas.json"),
		`${JSON.stringify(ignUnits(), null, "\t")}\n`,
	);
	writeFileSync(join(dir, "ign-nucleos.json"), `${JSON.stringify(ignCentres(), null, "\t")}\n`);
}

if (import.meta.main) {
	writeEsFixtures(ES_FIXTURES);
	console.log(`Wrote the synthetic Spanish fixtures to ${ES_FIXTURES}`);
}
