/**
 * Generates the SYNTHETIC fixtures in `fixtures/fi/`: a snapshot of the Finnish Service
 * Catalogue in the format `etl:fi` writes (`ptv.json`: health services, their service locations
 * and organisations, as `fetchPtvSnapshot` trims them) and Statistics Finland's three files that
 * `etl:places --country fi` reads (`kunnat.geojson`, `kunta_hyvinvointialue.json`,
 * `kunta_maakunta.json`).
 *
 * Every location, organisation and street is made up: names say they are examples (Esimerkki,
 * Esimerkkilä, Example), ids are UUIDs from a range of their own, phone numbers too, and some
 * locations carry what the import must never store or list (an e-mail address, a private
 * company's clinic, a school's health room, a library). Never commit real rows. Deterministic:
 * the same files on every run. Run with `bun run --cwd packages/etl fixtures:fi`.
 *
 * The municipalities, wellbeing services counties and regions are real codes and names of
 * Statistics Finland, each municipality drawn as a small square around its real centre.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PTV_SNAPSHOT_FORMAT } from "../src/sources/fi/ptv";
import { wgs84ToTm35fin } from "../src/sources/fi/tm35fin";

export const FI_FIXTURES = join(import.meta.dirname, "fi");

/** Municipalities of the fixture: code, Finnish and Swedish names, county, region, centre. */
export const FI_MUNICIPALITIES: [
	string,
	string,
	string,
	[string, string],
	[string, string],
	number,
	number,
][] = [
	[
		"091",
		"Helsinki",
		"Helsingfors",
		["90", "Helsingin kaupunki"],
		["01", "Uusimaa"],
		60.1699,
		24.9384,
	],
	[
		"049",
		"Espoo",
		"Esbo",
		["03", "Länsi-Uudenmaan hyvinvointialue"],
		["01", "Uusimaa"],
		60.2055,
		24.6559,
	],
	[
		"837",
		"Tampere",
		"Tammerfors",
		["08", "Pirkanmaan hyvinvointialue"],
		["06", "Pirkanmaa"],
		61.4978,
		23.761,
	],
	[
		"853",
		"Turku",
		"Åbo",
		["05", "Varsinais-Suomen hyvinvointialue"],
		["02", "Varsinais-Suomi"],
		60.4518,
		22.2666,
	],
	[
		"564",
		"Oulu",
		"Uleåborg",
		["19", "Pohjois-Pohjanmaan hyvinvointialue"],
		["17", "Pohjois-Pohjanmaa"],
		65.0121,
		25.4651,
	],
	[
		"408",
		"Lapua",
		"Lappo",
		["16", "Etelä-Pohjanmaan hyvinvointialue"],
		["14", "Etelä-Pohjanmaa"],
		62.9697,
		23.0064,
	],
	["148", "Inari", "Enare", ["21", "Lapin hyvinvointialue"], ["19", "Lappi"], 68.9054, 27.0288],
	[
		"478",
		"Maarianhamina",
		"Mariehamn",
		["91", "Ahvenanmaa"],
		["21", "Ahvenanmaa"],
		60.0973,
		19.9348,
	],
];

/** The year of the statistical areas. */
export const FI_FIXTURE_YEAR = 2026;
/** The day the snapshot was taken. */
export const FI_FIXTURE_DAY = "2026-11-27";

/** A synthetic UUID of the fixtures (`e5e0…`), never a real catalogue id. */
export const fixtureId = (kind: number, index: number) =>
	`e5e0${String(kind).padStart(4, "0")}-0000-4000-8000-${String(index).padStart(12, "0")}`;

/** The 32-digit key a fixture id is stored under. */
export const fixtureKey = (kind: number, index: number) => fixtureId(kind, index).replace(/-/g, "");

type Service = { id: string; name: string; classes: string[] };

/** Health services of the fixture, in the catalogue's words, and two that are not health care. */
export const FI_SERVICES: Record<string, Service> = {
	doctor: { id: fixtureId(1, 1), name: "Lääkärin vastaanotto", classes: ["P5", "P5.1"] },
	nurse: { id: fixtureId(1, 2), name: "Hoitajan vastaanotto", classes: ["P5.1"] },
	vaccination: { id: fixtureId(1, 3), name: "Rokotukset", classes: ["P5.3"] },
	dental: { id: fixtureId(1, 4), name: "Suun terveydenhuolto", classes: ["P5.10"] },
	maternity: { id: fixtureId(1, 5), name: "Äitiysneuvola", classes: ["P5.2"] },
	child: { id: fixtureId(1, 6), name: "Lastenneuvola", classes: ["P5.2"] },
	emergency: { id: fixtureId(1, 7), name: "Yhteispäivystys", classes: ["P5.5"] },
	specialist: { id: fixtureId(1, 8), name: "Erikoissairaanhoidon poliklinikka", classes: ["P5.6"] },
	mental: { id: fixtureId(1, 9), name: "Mielenterveyspalvelut", classes: ["P5.7"] },
	rehabilitation: { id: fixtureId(1, 10), name: "Fysioterapia", classes: ["P5.13"] },
	laboratory: { id: fixtureId(1, 11), name: "Laboratoriopalvelut", classes: ["P5.4"] },
	school: { id: fixtureId(1, 12), name: "Kouluterveydenhuolto", classes: ["P5.9"] },
	library: { id: fixtureId(1, 13), name: "Kirjastopalvelut", classes: ["P20"] },
};

type Organization = { id: string; name: string; type: string };

export const FI_ORGANIZATIONS: Record<string, Organization> = {
	county: { id: fixtureId(2, 1), name: "Esimerkkilän hyvinvointialue", type: "Region" },
	city: { id: fixtureId(2, 2), name: "Esimerkkikaupunki", type: "Municipality" },
	district: {
		id: fixtureId(2, 3),
		name: "Esimerkkilän sairaanhoitopiiri",
		type: "RegionalOrganization",
	},
	company: { id: fixtureId(2, 4), name: "Esimerkki Lääkärit Oy", type: "Company" },
};

export type FiFixtureLocation = {
	index: number;
	name: string;
	nameSv?: string;
	organization: keyof typeof FI_ORGANIZATIONS;
	services: (keyof typeof FI_SERVICES)[];
	municipality: string;
	street?: string;
	number?: string;
	postcode?: string;
	postOffice?: string;
	/** Offset of the point from the municipality's centre, in degrees; null: no point. */
	at?: [number, number] | null;
	phone?: string;
	email?: string;
	country?: string;
	publishingStatus?: string;
};

export type FiFixtureSet = { day: string; locations: FiFixtureLocation[] };

const centreOf = (code: string) => {
	const row = FI_MUNICIPALITIES.find((municipality) => municipality[0] === code);
	return row ? { latitude: row[5], longitude: row[6] } : { latitude: 61, longitude: 25 };
};

/** Health centres in bulk: enough locations for the guards' floors, two municipalities. */
const healthCentres: FiFixtureLocation[] = Array.from({ length: 60 }, (_, i) => ({
	index: 100 + i,
	name: `Esimerkkilän terveysasema ${i + 1}`,
	organization: i % 2 === 0 ? "county" : "city",
	services: ["doctor", "nurse", "vaccination"],
	municipality: i % 2 === 0 ? "837" : "091",
	street: "Esimerkkitie",
	number: String(i + 1),
	postcode: i % 2 === 0 ? "33100" : "00100",
	postOffice: i % 2 === 0 ? "TAMPERE" : "HELSINKI",
	at: [i * 0.001, i * 0.001],
	phone: `03 990 ${String(1000 + i)}`,
}));

const dentalClinics: FiFixtureLocation[] = Array.from({ length: 40 }, (_, i) => ({
	index: 200 + i,
	name: `Esimerkkilän hammashoitola ${i + 1}`,
	organization: "county",
	services: ["dental"],
	municipality: i % 2 === 0 ? "853" : "049",
	street: "Esimerkkikatu",
	number: String(i + 1),
	postcode: i % 2 === 0 ? "20100" : "02100",
	postOffice: i % 2 === 0 ? "TURKU" : "ESPOO",
	at: [i * 0.001, 0],
	// One booking line for every dental clinic of the county: a public service number, kept.
	phone: "02 990 2000",
}));

const childClinics: FiFixtureLocation[] = Array.from({ length: 20 }, (_, i) => ({
	index: 300 + i,
	name: `Esimerkkipolun neuvola ${i + 1}`,
	organization: "county",
	services: ["maternity", "child"],
	municipality: "564",
	street: "Esimerkkipolku",
	number: String(i + 1),
	postcode: "90100",
	postOffice: "OULU",
	at: [0, i * 0.001],
}));

/** The fixture's locations: the bulk, one of every other kind, and what must be left out. */
export const FI_LOCATIONS: FiFixtureSet = {
	day: FI_FIXTURE_DAY,
	locations: [
		{
			index: 1,
			name: "Esimerkkilän keskussairaala",
			organization: "district",
			services: ["specialist", "laboratory"],
			municipality: "837",
			street: "Esimerkkisairaalantie",
			number: "1",
			postcode: "33520",
			postOffice: "TAMPERE",
			at: [0.01, 0.01],
			phone: "+358 3 990 0001",
			email: "kirjaamo@example.test",
		},
		{
			index: 2,
			name: "Esimerkkilän yhteispäivystys",
			organization: "district",
			services: ["emergency", "specialist"],
			municipality: "837",
			street: "Esimerkkisairaalantie",
			number: "1",
			postcode: "33520",
			postOffice: "TAMPERE",
			at: [0.01, 0.011],
			phone: "116117",
		},
		{
			index: 3,
			name: "Esimerkkilän mielenterveyskeskus",
			organization: "city",
			services: ["mental"],
			municipality: "091",
			street: "Esimerkkikuja",
			number: "5 B",
			postcode: "00530",
			postOffice: "HELSINKI",
			at: [0.002, 0.003],
			phone: "09 990 3000",
		},
		{
			index: 4,
			name: "Esimerkkilän kuntoutusyksikkö",
			organization: "county",
			services: ["rehabilitation"],
			municipality: "408",
			street: "Esimerkkiraitti",
			number: "3",
			postcode: "62100",
			postOffice: "LAPUA",
			// No point in the catalogue: at the municipality's centre.
			at: null,
		},
		{
			index: 5,
			name: "Esimerkkilän laboratorio",
			organization: "county",
			services: ["laboratory"],
			municipality: "148",
			street: "Esimerkkiväylä",
			number: "7",
			postcode: "99800",
			postOffice: "IVALO",
			at: [0.001, 0.001],
		},
		{
			index: 6,
			name: "Exempelby hälsocentral",
			organization: "county",
			services: ["doctor"],
			municipality: "478",
			street: "Exempelgatan",
			number: "2",
			postcode: "22100",
			postOffice: "MARIEHAMN",
			at: [0.001, 0.001],
		},
		// A location whose name says nothing: its services (specialised care) tell a hospital's.
		{
			index: 7,
			name: "Esimerkkilän haavakeskus",
			organization: "county",
			services: ["specialist", "library"],
			municipality: "564",
			street: "Esimerkkiaukio",
			number: "1",
			postcode: "90100",
			postOffice: "OULU",
			at: [0.002, 0.002],
		},
		...healthCentres,
		...dentalClinics,
		...childClinics,
		// Left out: a school's health room, a library, a private company's clinic, a location
		// abroad, one not published, one in an unknown municipality, one without a name.
		{
			index: 900,
			name: "Esimerkkilän koulu",
			organization: "city",
			services: ["school"],
			municipality: "091",
			street: "Koulutie",
			number: "1",
			postcode: "00100",
			postOffice: "HELSINKI",
			at: [0, 0],
		},
		{
			index: 901,
			name: "Esimerkkilän kirjasto",
			organization: "city",
			services: ["library"],
			municipality: "091",
			street: "Kirjastotie",
			number: "1",
			postcode: "00100",
			postOffice: "HELSINKI",
			at: [0, 0],
		},
		{
			index: 902,
			name: "Lääkäriasema Esimerkki",
			organization: "company",
			services: ["doctor"],
			municipality: "091",
			street: "Yksityistie",
			number: "9",
			postcode: "00100",
			postOffice: "HELSINKI",
			at: [0, 0],
		},
		{
			index: 903,
			name: "Esimerkkilän terveysasema Tallinnassa",
			organization: "county",
			services: ["doctor"],
			municipality: "091",
			street: "Näidise tn",
			number: "1",
			postcode: "10117",
			postOffice: "TALLINN",
			country: "EE",
			at: [0, 0],
		},
		{
			index: 904,
			name: "Esimerkkilän vanha terveysasema",
			organization: "county",
			services: ["doctor"],
			municipality: "837",
			street: "Esimerkkitie",
			number: "99",
			postcode: "33100",
			postOffice: "TAMPERE",
			publishingStatus: "Deleted",
			at: [0, 0],
		},
		{
			index: 905,
			name: "Esimerkkilän kaukainen terveysasema",
			organization: "county",
			services: ["doctor"],
			municipality: "999",
			street: "Esimerkkitie",
			number: "1",
			postcode: "99999",
			postOffice: "EI OLE",
			at: null,
		},
		{
			index: 906,
			name: "",
			organization: "county",
			services: ["doctor"],
			municipality: "837",
			street: "Esimerkkitie",
			number: "100",
			postcode: "33100",
			postOffice: "TAMPERE",
			at: [0, 0],
		},
	],
};

/** A channel as `fetchPtvSnapshot` writes it (an e-mail too, to prove it is never read). */
function channelOf(location: FiFixtureLocation) {
	const centre = centreOf(location.municipality);
	const point =
		location.at === null || location.at === undefined
			? null
			: wgs84ToTm35fin({
					latitude: centre.latitude + location.at[0],
					longitude: centre.longitude + location.at[1],
				});
	return {
		id: fixtureId(3, location.index),
		organizationId: FI_ORGANIZATIONS[location.organization]?.id ?? null,
		names: [
			{ language: "fi", value: location.name, type: "Name" },
			...(location.nameSv ? [{ language: "sv", value: location.nameSv, type: "Name" }] : []),
		],
		addresses: [
			{
				type: "Location",
				subType: "Single",
				country: location.country ?? "FI",
				streetAddress: {
					street: location.street ? [{ language: "fi", value: location.street }] : [],
					streetNumber: location.number ?? null,
					postalCode: location.postcode ?? null,
					postOffice: location.postOffice ? [{ language: "fi", value: location.postOffice }] : [],
					municipality: { code: location.municipality, name: [] },
					latitude: point ? point.northing.toFixed(3) : "0",
					longitude: point ? point.easting.toFixed(3) : "0",
					coordinateState: point ? "Ok" : "NotReceived",
				},
			},
		],
		phoneNumbers: location.phone
			? [
					{
						type: "Phone",
						prefixNumber: null,
						number: location.phone,
						isFinnishServiceNumber: false,
						serviceChargeType: "Chargeable",
						language: "fi",
					},
				]
			: [],
		emails: location.email ? [{ value: location.email, language: "fi" }] : [],
		services: location.services.map((key) => ({
			id: FI_SERVICES[key]?.id ?? "",
			name: FI_SERVICES[key]?.name ?? null,
		})),
		publishingStatus: location.publishingStatus ?? "Published",
	};
}

/** The snapshot of a fixture set. */
export function ptvSnapshot(set: FiFixtureSet = FI_LOCATIONS): string {
	const channels = set.locations.map(channelOf);
	const services = Object.values(FI_SERVICES).map((service) => ({
		id: service.id,
		names: [{ language: "fi", value: service.name, type: "Name" }],
		classes: service.classes,
		generalDescriptionId: null,
		channelIds: channels
			.filter((channel) => channel.services.some((link) => link.id === service.id))
			.map((channel) => channel.id),
	}));
	const organizations = Object.values(FI_ORGANIZATIONS).map((organization) => ({
		id: organization.id,
		names: [{ language: "fi", value: organization.name, type: "Name" }],
		type: organization.type,
		parentId: null,
	}));
	return `${JSON.stringify(
		{
			format: PTV_SNAPSHOT_FORMAT,
			api: "https://api.palvelutietovaranto.suomi.fi/api/v11",
			takenOn: set.day,
			services,
			organizations,
			channels,
		},
		null,
		1,
	)}\n`;
}

/** A square of about 2 km around a centre, as a GeoJSON polygon in WGS 84. */
function square(latitude: number, longitude: number) {
	const d = 0.01;
	return {
		type: "Polygon",
		coordinates: [
			[
				[longitude - d * 2, latitude - d],
				[longitude + d * 2, latitude - d],
				[longitude + d * 2, latitude + d],
				[longitude - d * 2, latitude + d],
				[longitude - d * 2, latitude - d],
			],
		],
	};
}

/** Statistics Finland's municipalities' layer, as its WFS answers in GeoJSON. */
export function municipalitiesGeojson(): string {
	return `${JSON.stringify({
		type: "FeatureCollection",
		features: FI_MUNICIPALITIES.map(([code, name, nameSv, , , latitude, longitude], index) => ({
			type: "Feature",
			id: `kunta4500k_${FI_FIXTURE_YEAR}.${index + 1}`,
			geometry: square(latitude, longitude),
			properties: {
				id: index + 1,
				kunta: code,
				vuosi: FI_FIXTURE_YEAR,
				nimi: name,
				namn: nameSv,
				name,
			},
		})),
	})}\n`;
}

/** A correspondence table of the classification server, municipality to `target`. */
function correspondence(target: "hyvinvointialue" | "maakunta"): string {
	return `${JSON.stringify(
		FI_MUNICIPALITIES.map(([code, name, , county, region]) => {
			const [targetCode, targetName] = target === "hyvinvointialue" ? county : region;
			return {
				sourceLocalId: `kunta_1_${FI_FIXTURE_YEAR}0101/${code}`,
				targetLocalId: `${target}_1_${FI_FIXTURE_YEAR}0101/${targetCode}`,
				sourceItem: { code, classificationItemNames: [{ lang: "fi", name }] },
				targetItem: {
					code: targetCode,
					classificationItemNames: [{ lang: "fi", name: targetName }],
				},
			};
		}),
	)}\n`;
}

export function writeFiFixtures(dir: string = FI_FIXTURES, set: FiFixtureSet = FI_LOCATIONS) {
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "ptv.json"), ptvSnapshot(set));
	writeFileSync(join(dir, "kunnat.geojson"), municipalitiesGeojson());
	writeFileSync(join(dir, "kunta_hyvinvointialue.json"), correspondence("hyvinvointialue"));
	writeFileSync(join(dir, "kunta_maakunta.json"), correspondence("maakunta"));
}

if (import.meta.main) {
	writeFiFixtures();
	console.log(`Wrote the Finnish fixtures to ${FI_FIXTURES}`);
}
