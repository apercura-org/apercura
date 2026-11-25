/**
 * Generates the SYNTHETIC fixtures in `fixtures/at/`: files in the exact
 * formats of the Austrian lists (Vienna GeoJSON, Styria shapefile ZIP,
 * Salzburg ArcGIS JSON for doctors and dentists) and Statistik Austria's
 * Gemeinde centres, filled with fictitious doctors.
 *
 * Every person is made up: family names are made-up words (Beispiel, Muster,
 * Fiktiv, Exempel…) followed by a number for the fillers, streets do not
 * exist, phone numbers have a subscriber part starting with 0, which the
 * Austrian numbering plan never assigns. Doctor numbers are in ranges far
 * above the real lists'. Never commit real rows. Run with
 * `bun run --cwd packages/etl fixtures:at`.
 *
 * The Gemeinden are real public place names and codes, with approximate
 * centres: a small subset of the Statistik Austria layer.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeDbf, writeShpPoints } from "../src/lib/shapefile";
import { writeStoredZip } from "../src/lib/zip";

export const AT_FIXTURES = join(import.meta.dirname, "at");

/** Gemeinde centres (longitude, latitude), real codes and names, approximate points. */
export const GEMEINDEN: [string, string, number, number][] = [
	["90101", "Wien-Innere Stadt", 16.368, 48.2099],
	["90201", "Wien-Leopoldstadt", 16.3972, 48.2192],
	["90901", "Wien-Alsergrund", 16.3539, 48.2246],
	["91901", "Wien-Döbling", 16.3347, 48.2541],
	["92201", "Wien-Donaustadt", 16.4669, 48.2289],
	["60101", "Graz", 15.4395, 47.0707],
	["60608", "Feldkirchen bei Graz", 15.4466, 46.9969],
	["60624", "Kalsdorf bei Graz", 15.4806, 46.9649],
	["61108", "Leoben", 15.0912, 47.3818],
	["50101", "Salzburg", 13.0457, 47.8027],
	["50203", "Hallein", 13.0956, 47.6833],
	["30101", "Krems an der Donau", 15.6143, 48.4092],
];

/** A Vienna feature: titles and name, district and street, specialty, phone, practice link. */
type WienCase = {
	id: number;
	name: string;
	district: number;
	street: string;
	fach: string;
	phone?: string | null;
	practice?: number;
	point?: [number, number] | null;
	link?: string | null;
};

/**
 * Hand-written Vienna cases: a doctor at two practices, one with two
 * specialties at one practice (listed as the specialist), titles before and
 * after the name, phones with and without the 01, a feature without a
 * practice link (quarantined).
 */
export const WIEN_CASES: WienCase[] = [
	{
		id: 900001,
		name: "Dr. Anna Beispiel",
		district: 9,
		street: "Fiktivgasse 1/2",
		fach: "Allgemeinmedizin",
		phone: "01 0000101",
	},
	{
		id: 900001,
		name: "Dr. Anna Beispiel",
		district: 19,
		street: "Probeweg 3",
		fach: "Allgemeinmedizin",
		phone: "0000102",
		practice: 2,
	},
	{
		id: 900002,
		name: "Ao.Univ.Prof. Dr. Lukas Muster, MSc",
		district: 1,
		street: "Exempelplatz 4",
		fach: "Innere Medizin u. Kardiologie",
		phone: "+43 1 0000103",
	},
	{
		id: 900002,
		name: "Ao.Univ.Prof. Dr. Lukas Muster, MSc",
		district: 1,
		street: "Exempelplatz 4",
		fach: "Allgemeinmedizin",
	},
	{
		id: 900003,
		name: "MR Dr. Jürgen Fiktiv-Weiß",
		district: 9,
		street: "Fiktivgasse 7",
		fach: "Kinder- u. Jugendheilkunde",
		phone: "0664 0000104",
	},
	{
		id: 900004,
		name: "Dr. Maria von Exempel",
		district: 22,
		street: "Musterstraße 12",
		fach: "Frauenheilkunde u. Geburtshilfe",
		phone: null,
	},
	{
		id: 900005,
		name: "Dr. Sophie Probe",
		district: 2,
		street: "Testallee 5",
		fach: "Approbierte*r Ärzt*in",
	},
	{
		id: 900006,
		name: "Dr. Clara Specimen",
		district: 9,
		street: "Fiktivgasse 9",
		fach: "Allgemeinmedizin",
		link: null,
	},
];

/** Styria record: doctor number, titles, names, address, specialty, practice kind, point. */
type StmkCase = {
	number: number;
	grdtitel?: string;
	verltitel?: string;
	first: string;
	last: string;
	street: string;
	plz: string;
	ort: string;
	adrcode?: string;
	fach: string;
	main?: boolean;
	point: [number, number] | null;
};

/**
 * Hand-written Styria cases: a doctor at a main and a second practice, a town
 * that names its Gemeinde (Graz) and one that does not (Feldkirchen, placed by
 * the nearest Gemeinde centre), a record without an address (skipped).
 */
export const STMK_CASES: StmkCase[] = [
	{
		number: 800001,
		verltitel: "Dr.",
		first: "Eva",
		last: "Beispielhuber",
		street: "Fiktivkai 1",
		plz: "8010",
		ort: "Graz",
		adrcode: "9900001",
		fach: "FA - Frauenheilkunde und Geburtshilfe",
		main: true,
		point: [15.4402, 47.0712],
	},
	{
		number: 800001,
		verltitel: "Dr.",
		first: "Eva",
		last: "Beispielhuber",
		street: "Probegasse 2",
		plz: "8073",
		ort: "Feldkirchen",
		adrcode: "9900002",
		fach: "FA - Frauenheilkunde und Geburtshilfe",
		main: false,
		point: [15.4471, 46.9975],
	},
	{
		number: 800002,
		grdtitel: "Univ.Prof.",
		verltitel: "Dr.",
		first: "Paul",
		last: "Musterer",
		street: "Exempelweg 3",
		plz: "8010",
		ort: "Graz",
		adrcode: "9900003",
		fach: "AM - Allgemein Medizin",
		main: true,
		point: [15.43, 47.07],
	},
	{
		number: 800003,
		verltitel: "Dr.",
		first: "Lena",
		last: "Fiktivova",
		street: "",
		plz: "",
		ort: "",
		fach: "FA - Innere Medizin",
		main: true,
		point: null,
	},
];

/** Salzburg doctor attributes, with a point in EPSG:31258. */
type SbgCase = {
	titel: string;
	first: string;
	last: string;
	nachg?: string;
	gender: "M" | "W";
	street: string;
	hnr: string;
	plz: number;
	ort: string;
	fach: string;
	kategorie: string;
	group?: string;
	adrcd: string;
	point: [number, number];
};

/** Hand-written Salzburg doctors: one with two specialties at two practices, a group practice. */
export const SBG_CASES: SbgCase[] = [
	{
		titel: "Dr.",
		first: "Hanna",
		last: "BEISPIELER",
		gender: "W",
		street: "Fiktivstraße",
		hnr: "10",
		plz: 5020,
		ort: "Salzburg",
		fach: "Allgemeinmedizin",
		kategorie: "Arzt für Allgemeinmedizin",
		adrcd: "9800001",
		point: [430800, 298400],
	},
	{
		titel: "Dr.",
		first: "Hanna",
		last: "BEISPIELER",
		gender: "W",
		street: "Probeplatz",
		hnr: "2A",
		plz: 5400,
		ort: "Hallein",
		fach: "Innere Medizin",
		kategorie: "Facharzt",
		adrcd: "9800002",
		point: [434500, 285500],
	},
	{
		titel: "Dr. Priv.-Doz.",
		first: "Felix",
		last: "MUSTERMANN",
		nachg: "PhD",
		gender: "M",
		street: "Exempelgasse",
		hnr: "5",
		plz: 5020,
		ort: "Salzburg",
		fach: "Orthopädie und Traumatologie",
		kategorie: "Facharzt",
		group: "Gruppenpraxis Fiktiv OG",
		adrcd: "9800003",
		point: [431200, 297900],
	},
];

/** Hand-written Salzburg dentists: the name in one field, titles first. */
export const SBG_DENTISTS: {
	name: string;
	street: string;
	hnr: string;
	plz: number;
	ort: string;
	point: [number, number];
}[] = [
	{
		name: "DDr. Nora Zahnbeispiel",
		street: "Fiktivweg",
		hnr: "1",
		plz: 5020,
		ort: "Salzburg",
		point: [430600, 298100],
	},
	{
		name: "Dr. med. dent. Tom Probezahn, MSc",
		street: "Probegasse",
		hnr: "8",
		plz: 5400,
		ort: "Hallein",
		point: [434400, 285300],
	},
];

const pad = (n: number, width = 4) => String(n).padStart(width, "0");

/** Filler doctors so each list clears its row floor (`AT_LIMITS.minRows`). */
export function wienFillers(count: number): WienCase[] {
	const districts = [1, 2, 9, 19, 22];
	const fachs = ["Allgemeinmedizin", "Innere Medizin", "Augenheilkunde u. Optometrie", "Urologie"];
	return Array.from({ length: count }, (_, index) => ({
		id: 910000 + index,
		name: `Dr. Testa Wienfiktiv${pad(index)}`,
		district: districts[index % districts.length] ?? 9,
		street: `Fillergasse ${index + 1}`,
		fach: fachs[index % fachs.length] ?? "Allgemeinmedizin",
		phone: index % 3 === 0 ? `01 0${pad(index, 6)}` : null,
	}));
}

export function stmkFillers(count: number): StmkCase[] {
	const towns: [string, string, [number, number]][] = [
		["8010", "Graz", [15.44, 47.07]],
		["8700", "Leoben", [15.09, 47.38]],
		["8401", "Kalsdorf bei Graz", [15.48, 46.965]],
	];
	return Array.from({ length: count }, (_, index) => {
		const [plz, ort, point] = towns[index % towns.length] ?? ["8010", "Graz", [15.44, 47.07]];
		return {
			number: 810000 + index,
			verltitel: "Dr.",
			first: "Testo",
			last: `Stmkfiktiv${pad(index)}`,
			street: `Fillerweg ${index + 1}`,
			plz,
			ort,
			adrcode: String(9910000 + index),
			fach: index % 2 === 0 ? "AM - Allgemeinmedizin" : "FA - Urologie",
			main: true,
			point,
		};
	});
}

export function sbgFillers(count: number): SbgCase[] {
	return Array.from({ length: count }, (_, index) => ({
		titel: "Dr.",
		first: "Testi",
		last: `SBGFIKTIV${pad(index)}`,
		gender: index % 2 === 0 ? "W" : "M",
		street: "Fillerstraße",
		hnr: String(index + 1),
		plz: 5020,
		ort: "Salzburg",
		fach: index % 2 === 0 ? "Allgemeinmedizin" : "Haut- und Geschlechtskrankheiten",
		kategorie: "Facharzt",
		adrcd: String(9810000 + index),
		point: [430000 + (index % 50) * 20, 297000 + (index % 40) * 20],
	}));
}

export function dentistFillers(count: number) {
	return Array.from({ length: count }, (_, index) => ({
		name: `Dr. Testu Zahnfiktiv${pad(index)}`,
		street: "Fillerweg",
		hnr: String(index + 1),
		plz: 5020,
		ort: "Salzburg",
		point: [430000 + index * 10, 297500] as [number, number],
	}));
}

export type AtFixtureSet = {
	wien: WienCase[];
	stmk: StmkCase[];
	sbg: SbgCase[];
	dentists: typeof SBG_DENTISTS;
};

export const AT_PEOPLE: AtFixtureSet = {
	wien: [...WIEN_CASES, ...wienFillers(1_100)],
	stmk: [...STMK_CASES, ...stmkFillers(600)],
	sbg: [...SBG_CASES, ...sbgFillers(350)],
	dentists: [...SBG_DENTISTS, ...dentistFillers(60)],
};

export function gemeindenJson() {
	return JSON.stringify({
		type: "FeatureCollection",
		features: GEMEINDEN.map(([code, name, lon, lat]) => ({
			type: "Feature",
			id: `STATISTIK_AUSTRIA_GEM_MP_20260101.${code}`,
			geometry: { type: "Point", coordinates: [lon, lat] },
			geometry_name: "geom",
			properties: { g_id: code, g_name: name },
		})),
	});
}

export function wienJson(cases: WienCase[]) {
	return JSON.stringify({
		type: "FeatureCollection",
		totalFeatures: cases.length,
		features: cases.map((item, index) => {
			const centre = GEMEINDEN.find(([code]) => code === `9${pad(item.district, 2)}01`);
			const point =
				item.point === undefined
					? ([centre?.[2] ?? 16.37, centre?.[3] ?? 48.21] as [number, number])
					: item.point;
			const slug = item.name.toLowerCase().replace(/[^a-z]+/g, "-");
			return {
				type: "Feature",
				id: `ARZTOGD.${700000 + index}`,
				geometry: point ? { type: "Point", coordinates: point } : null,
				properties: {
					OBJECTID: 700000 + index,
					NAME: item.name,
					ADRESSE: `${pad(item.district, 2)}., ${item.street}`,
					FACH: item.fach,
					TELEFON: item.phone ?? null,
					INTERNET:
						item.link === null
							? null
							: `https://praxisplan.at/${item.id}/${slug}/ordination/${item.practice ?? 1}`,
					SE_ANNO_CAD_DATA: null,
				},
			};
		}),
		crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::4326" } },
	});
}

const STMK_FIELDS = [
	{ name: "ARZTNR", type: "N", length: 10 },
	{ name: "GRDTITEL", type: "C", length: 50 },
	{ name: "VERLTITEL", type: "C", length: 50 },
	{ name: "NACHNAME", type: "C", length: 50 },
	{ name: "ADRCODE", type: "C", length: 7 },
	{ name: "STRASSE", type: "C", length: 100 },
	{ name: "PLZ", type: "C", length: 25 },
	{ name: "ORT", type: "C", length: 50 },
	{ name: "VORNAME", type: "C", length: 50 },
	{ name: "FACH", type: "C", length: 100 },
	{ name: "ORDINATION", type: "C", length: 50 },
	{ name: "URL", type: "C", length: 254 },
];

export function stmkZip(cases: StmkCase[]) {
	const records = cases.map((item) => ({
		ARZTNR: String(item.number).padStart(10, " "),
		GRDTITEL: item.grdtitel ?? "",
		VERLTITEL: item.verltitel ?? "",
		NACHNAME: item.last,
		ADRCODE: item.adrcode ?? "",
		STRASSE: item.street,
		PLZ: item.plz,
		ORT: item.ort,
		VORNAME: item.first,
		FACH: item.fach,
		ORDINATION: item.main === false ? "Zweitordination" : "Hauptordination",
		URL: "",
	}));
	return writeStoredZip([
		{ name: "Niedergelassene_Aerzte.dbf", data: writeDbf(STMK_FIELDS, records) },
		{
			name: "Niedergelassene_Aerzte.shp",
			data: writeShpPoints(
				cases.map((item) => (item.point ? { x: item.point[0], y: item.point[1] } : null)),
			),
		},
		{ name: "Niedergelassene_Aerzte.cpg", data: Buffer.from("UTF-8") },
	]);
}

export function sbgJson(cases: SbgCase[]) {
	return JSON.stringify({
		displayFieldName: "Nachname",
		geometryType: "esriGeometryPoint",
		spatialReference: { wkid: 31258, latestWkid: 31258 },
		fields: [],
		features: cases.map((item, index) => ({
			attributes: {
				OBJECTID: index + 1,
				Titel: item.titel,
				Nachname: item.last,
				Vorname: item.first,
				TitelNachg: item.nachg ?? null,
				HNR: item.hnr,
				Strasse: item.street,
				Ort: item.ort,
				PLZ: item.plz,
				Fach: item.fach,
				Kategorie: item.kategorie,
				Gruppenpraxis: item.group ?? null,
				GeschlechtCode: item.gender,
				ADRCD: item.adrcd,
				SUBCD: "001",
			},
			geometry: { x: item.point[0], y: item.point[1] },
		})),
	});
}

export function dentistsJson(cases: typeof SBG_DENTISTS) {
	return JSON.stringify({
		displayFieldName: "Name",
		geometryType: "esriGeometryPoint",
		spatialReference: { wkid: 31258, latestWkid: 31258 },
		fields: [],
		features: cases.map((item, index) => ({
			attributes: {
				OBJECTID: index + 1,
				Strasse: item.street,
				Name: item.name,
				PLZ: Number(`${item.plz}.0`),
				Ort: item.ort,
				HNR: item.hnr,
				SKZ_HNR: null,
				ADRCD: String(9820000 + index),
				SUBCD: "001",
			},
			geometry: { x: item.point[0], y: item.point[1] },
		})),
	});
}

/** Writes every Austrian fixture file to `out`. */
export function writeAtFixtures(out: string, people: AtFixtureSet = AT_PEOPLE) {
	mkdirSync(out, { recursive: true });
	writeFileSync(join(out, "gemeinden.json"), gemeindenJson());
	writeFileSync(join(out, "wien.json"), wienJson(people.wien));
	writeFileSync(join(out, "steiermark.zip"), stmkZip(people.stmk));
	writeFileSync(join(out, "salzburg-aerzte.json"), sbgJson(people.sbg));
	writeFileSync(join(out, "salzburg-zahnaerzte.json"), dentistsJson(people.dentists));
}

if (import.meta.main) writeAtFixtures(AT_FIXTURES);
