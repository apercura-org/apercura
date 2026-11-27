import { describe, expect, it } from "vitest";
import {
	FI_LOCATIONS,
	fixtureKey,
	municipalitiesGeojson,
	ptvSnapshot,
} from "../../../fixtures/generate-fi";
import { buildFiPlaceRows, parseFiPlaces } from "./places";
import { isHealthClass, parsePtv, postOfficeName, serviceClassCode } from "./ptv";
import { inFinland, tm35finToWgs84, wgs84ToTm35fin } from "./tm35fin";

const correspondence = (target: string, rows: [string, string, string, string][]) =>
	Buffer.from(
		JSON.stringify(
			rows.map(([code, name, targetCode, targetName]) => ({
				sourceItem: { code, classificationItemNames: [{ name }] },
				targetItem: { code: targetCode, classificationItemNames: [{ name: targetName }] },
				target,
			})),
		),
	);

describe("ETRS-TM35FIN", () => {
	it("converts the catalogue's points to WGS 84 and back", () => {
		// Lapua's health centre as the catalogue gives it (northing, easting).
		const lapua = tm35finToWgs84(6988237.637, 299501.513);
		expect(lapua?.latitude).toBeCloseTo(62.9684, 3);
		expect(lapua?.longitude).toBeCloseTo(23.0441, 3);
		const helsinki = tm35finToWgs84(6672000, 385700);
		expect(helsinki?.latitude).toBeCloseTo(60.1689, 3);
		expect(helsinki?.longitude).toBeCloseTo(24.9401, 3);
		const back = wgs84ToTm35fin({ latitude: 68.9054, longitude: 27.0288 });
		const again = tm35finToWgs84(back.northing, back.easting);
		expect(again?.latitude).toBeCloseTo(68.9054, 7);
		expect(again?.longitude).toBeCloseTo(27.0288, 7);
	});

	it("refuses points that are not in Finland", () => {
		expect(tm35finToWgs84(0, 0)).toBeNull();
		expect(tm35finToWgs84(Number.NaN, 300000)).toBeNull();
		expect(inFinland({ latitude: 59.3293, longitude: 18.0686 })).toBe(false);
		expect(inFinland({ latitude: 60.0973, longitude: 19.9348 })).toBe(true);
	});
});

describe("the Finnish Service Catalogue", () => {
	it("reads service classes and the health care class", () => {
		expect(
			serviceClassCode({ uri: "http://uri.suomi.fi/codelist/ptv/ptvserclass2/code/P5.10" }),
		).toBe("P5.10");
		expect(serviceClassCode({ code: "P5.1" })).toBe("P5.1");
		expect(isHealthClass("P5")).toBe(true);
		expect(isHealthClass("P5.20")).toBe(true);
		expect(isHealthClass("P5.21")).toBe(false);
		expect(isHealthClass("P50")).toBe(false);
		expect(postOfficeName("ETELÄ-POHJANMAA")).toBe("Etelä-Pohjanmaa");
		expect(postOfficeName("Mariehamn")).toBe("Mariehamn");
		expect(postOfficeName(null)).toBeNull();
	});

	it("keeps the health locations of public organisers, placed by their municipality", () => {
		const result = parsePtv(Buffer.from(ptvSnapshot()));
		expect(result.edition).toBe(20261127);
		expect(result.lines).toBe(FI_LOCATIONS.locations.length);
		expect(result.skipped).toEqual({
			"no kind": 2,
			"organisation:Company": 1,
			abroad: 1,
			unpublished: 1,
		});
		expect(result.quarantined).toEqual([
			{ lineNo: FI_LOCATIONS.locations.length, reason: "name", sample: fixtureKey(3, 906) },
		]);
		const hospital = result.rows.find((row) => row.nationalId === fixtureKey(3, 1));
		expect(hospital).toMatchObject({
			professionCode: "FI_HOSPITAL",
			name: "Esimerkkilän keskussairaala",
			street: "Esimerkkisairaalantie 1",
			postcode: "33520",
			city: "Tampere",
			municipality: "837",
			phone: "+35839900001",
		});
		expect(hospital?.qualifications).toEqual([
			{
				source: "palvelu",
				code: fixtureKey(1, 8),
				label: "Erikoissairaanhoidon poliklinikka",
			},
			{ source: "palvelu", code: fixtureKey(1, 11), label: "Laboratoriopalvelut" },
			{ source: "jarjestaja", code: fixtureKey(2, 3), label: "Esimerkkilän sairaanhoitopiiri" },
		]);
		// No e-mail address is ever read.
		expect(JSON.stringify(result.rows)).not.toContain("example.test");
		// A name that says nothing: its specialised care tells a hospital's unit.
		expect(result.rows.find((row) => row.nationalId === fixtureKey(3, 7))?.professionCode).toBe(
			"FI_HOSPITAL",
		);
		// No point in the catalogue: placed at the municipality's centre later.
		expect(result.rows.find((row) => row.nationalId === fixtureKey(3, 4))).toMatchObject({
			professionCode: "FI_REHABILITATION",
			latitude: null,
			longitude: null,
		});
		// A booking line shared by many locations is a public service number: kept.
		expect(result.rows.filter((row) => row.phone === "+35829902000").length).toBe(40);
		// The national helpline is no subscriber number.
		expect(result.counters.invalidPhones).toBe(1);
		expect(result.rows.find((row) => row.nationalId === fixtureKey(3, 6))?.city).toBe("Mariehamn");
	});

	it("refuses a file that is not a snapshot", () => {
		expect(() => parsePtv(Buffer.from("{}"))).toThrow(/apercura-ptv-snapshot/);
	});
});

describe("Finland's places", () => {
	it("makes counties departments, regions regions and municipalities their communes", () => {
		const sources = parseFiPlaces({
			municipalities: Buffer.from(municipalitiesGeojson()),
			counties: correspondence("hyvinvointialue", [
				["091", "Helsinki", "90", "Helsingin kaupunki"],
				["049", "Espoo", "03", "Länsi-Uudenmaan hyvinvointialue"],
				["837", "Tampere", "08", "Pirkanmaan hyvinvointialue"],
				["853", "Turku", "05", "Varsinais-Suomen hyvinvointialue"],
				["564", "Oulu", "19", "Pohjois-Pohjanmaan hyvinvointialue"],
				["408", "Lapua", "16", "Etelä-Pohjanmaan hyvinvointialue"],
				["148", "Inari", "21", "Lapin hyvinvointialue"],
				["478", "Maarianhamina", "91", "Ahvenanmaa"],
			]),
			regions: correspondence("maakunta", [
				["091", "Helsinki", "01", "Uusimaa"],
				["049", "Espoo", "01", "Uusimaa"],
				["837", "Tampere", "06", "Pirkanmaa"],
				["853", "Turku", "02", "Varsinais-Suomi"],
				["564", "Oulu", "17", "Pohjois-Pohjanmaa"],
				["408", "Lapua", "14", "Etelä-Pohjanmaa"],
				["148", "Inari", "19", "Lappi"],
				["478", "Maarianhamina", "21", "Ahvenanmaa"],
			]),
		});
		expect(sources.year).toBe(2026);
		expect(sources.counties.find((county) => county.code === "90")?.name).toBe("Helsinki");
		const rows = buildFiPlaceRows(sources, []);
		const of = (kind: string, code: string) =>
			rows.find((row) => row.kind === kind && row.code === code);
		expect(of("department", "08")).toMatchObject({
			slug: "pirkanmaan-hyvinvointialue",
			region_code: "06",
			parent_kind: "region",
		});
		expect(of("department", "90")?.slug).toBe("helsinki");
		expect(of("commune", "091")).toMatchObject({ slug: "helsinki", department_code: "90" });
		expect(of("commune", "837")?.latitude).toBeCloseTo(61.4978, 2);
		// A region and a county of the same name share the slug space: the county keeps it.
		expect(of("department", "91")?.slug).toBe("ahvenanmaa");
		expect(of("region", "21")?.slug).toBe("ahvenanmaa-21");
	});

	it("refuses a municipality without its county", () => {
		expect(() =>
			parseFiPlaces({
				municipalities: Buffer.from(municipalitiesGeojson()),
				counties: correspondence("hyvinvointialue", [["091", "Helsinki", "90", "Helsinki"]]),
				regions: correspondence("maakunta", [["091", "Helsinki", "01", "Uusimaa"]]),
			}),
		).toThrow(/has no wellbeing services county/);
	});
});
