import { describe, expect, it } from "vitest";
import {
	CY_FACILITIES,
	CY_PHARMACIST,
	censusJson,
	centresCsv,
	hospitalsCsv,
	pharmaciesCsv,
	postcodesXlsx,
} from "../../../fixtures/generate-cy";
import { parsePharmacies, pharmacyName } from "./pharmacies";
import {
	buildCyPlaceIndex,
	buildCyPlaceRows,
	type CyPlace,
	parseCensus,
	parseCyPlaceSources,
	placeFacility,
	placeName,
} from "./places";
import {
	districtOfPhone,
	parseHealthCentres,
	parseHospitals,
	splitAddress,
	stateKey,
} from "./state";
import { cleanStreet, csvRecords, nameKey, stem, stems } from "./text";

const buffer = (text: string) => Buffer.from(text, "utf8");

describe("the Cypriot lists' text", () => {
	it("reads quoted CSV records, a line break inside a field joined", () => {
		const records = csvRecords(buffer('\uFEFFa,b\r\n"x, y","1\n2"\r\n\r\nz,3\r\n'));
		expect(records).toEqual([
			{ lineNo: 1, fields: ["a", "b"] },
			{ lineNo: 2, fields: ["x, y", "1\n2"] },
			{ lineNo: 5, fields: ["z", "3"] },
		]);
		expect(() => csvRecords(buffer('a\n"open\n'))).toThrow(/never closes/);
		expect(() => csvRecords(Buffer.from([0xff, 0xfe]))).toThrow();
	});

	it("compares Greek names without accents, case or inflection", () => {
		expect(nameKey("Χοιροκoιτία")).toBe(nameKey("Χοιροκοιτία"));
		expect(nameKey("Σούνι-Ζανακιά")).toBe("σουνι ζανακια");
		const pairs: [string, string][] = [
			["Στροβόλου", "Στρόβολος"],
			["Λάρνακας", "Λάρνακα"],
			["Λατσιών", "Λατσιά"],
			["Αγλαντζιάς", "Αγλαντζιά"],
			["Ορμήδειας", "Ορμίδεια"],
			["Κελλακίου", "Κελλάκι"],
			["Ομόδους", "Όμοδος"],
		];
		for (const [genitive, name] of pairs) {
			expect(stem(genitive), genitive).toBe(stem(name));
		}
		expect(stems("Αγίας Νάπας")).toEqual(stems("Αγία Νάπα"));
		expect(stem("Λευκωσία")).not.toBe(stem("Λεμεσός"));
	});

	it("drops a trailing part that only repeats the town", () => {
		expect(cleanStreet("Αχυρώνα 2, Αυγόρου", ["Αυγόρου"])).toBe("Αχυρώνα 2");
		expect(cleanStreet("Μακαρίου Γ'  34,  Σωτήρα", ["Σωτήρα"])).toBe("Μακαρίου Γ' 34");
		expect(cleanStreet("Λεωφ. Πρωταρά 13", ["Παραλίμνι"])).toBe("Λεωφ. Πρωταρά 13");
		expect(cleanStreet("Σωτήρα", ["Σωτήρα"])).toBe("Σωτήρα");
	});
});

describe("the list of private pharmacies", () => {
	const result = parsePharmacies(buffer(pharmaciesCsv(CY_FACILITIES.pharmacies)));

	it("reads a pharmacy, named after its address, keyed by its registration number", () => {
		expect(result.rows.find((row) => row.nationalId === "101")).toEqual({
			source: "farmakeia",
			lineNo: 2,
			nationalId: "101",
			professionCode: "CY_PHARMACY",
			name: "Φαρμακείο, Οδός Παραδείγματος 12, Λευκωσία",
			location: {
				street: "Οδός Παραδείγματος 12",
				postcode: "1010",
				town: "Λευκωσία",
				district: "Λευκωσία",
				point: null,
				phone: "+35722000101",
			},
		});
		expect(pharmacyName("Ερμού 51Γ", "Λάρνακα")).toBe("Φαρμακείο, Ερμού 51Γ, Λάρνακα");
	});

	it("never reads the pharmacist's name, house telephone or the landmark line", () => {
		const text = JSON.stringify(result);
		for (const value of Object.values(CY_PHARMACIST)) expect(text).not.toContain(value);
	});

	it("drops mobile and shared numbers, merges one pharmacy listed twice, quarantines a row without a number", () => {
		expect(result.lines).toBe(165);
		expect(result.rows).toHaveLength(163);
		expect(result.skipped).toEqual({ "same pharmacy": 1 });
		expect(result.counters).toEqual({ sharedPhones: 4, mobilePhones: 1, invalidPhones: 0 });
		expect(result.rows.find((row) => row.nationalId === "107")?.location.phone).toBeNull();
		expect(result.rows.find((row) => row.nationalId === "106")).toBeUndefined();
		expect(result.quarantined).toEqual([
			{ lineNo: 10, reason: "no registration number", sample: "x109" },
		]);
	});

	it("refuses a file that is not the list", () => {
		expect(() => parsePharmacies(buffer("a,b\n1,2\n"))).toThrow(/no column/);
		expect(() =>
			parsePharmacies(buffer("District,S/N,Address,City / Community,Postal Code,Telephone\n")),
		).toThrow(/no row/);
	});
});

describe("the state hospitals and health centres", () => {
	it("splits a hospital's address into its street, postcode and town", () => {
		expect(splitAddress("Κορυτσάς 6, 2012 Στρόβολος Λευκωσία")).toEqual({
			street: "Κορυτσάς 6",
			postcode: "2012",
			town: "Στρόβολος Λευκωσία",
		});
		expect(splitAddress("Παλαιός Δρόμος Λευκωσίας Λεμεσού, Αρ. 215, 2029 Στρόβολος")).toEqual({
			street: "Παλαιός Δρόμος Λευκωσίας Λεμεσού, Αρ. 215",
			postcode: "2029",
			town: "Στρόβολος",
		});
		expect(splitAddress("Βεργίνας 25, 8820\nΠόλης Χρυσοχούς")).toEqual({
			street: "Βεργίνας 25",
			postcode: "8820",
			town: "Πόλης Χρυσοχούς",
		});
		expect(splitAddress("Χρίστου Κκέλη 25, Παραλίμνι")).toEqual({
			street: "Χρίστου Κκέλη 25",
			postcode: null,
			town: "Παραλίμνι",
		});
		expect(splitAddress("Κυπερούντα Λεμεσός")).toEqual({
			street: null,
			postcode: null,
			town: "Κυπερούντα Λεμεσός",
		});
	});

	it("keys a facility by a hash of its kind and name, stable across spellings of space and case", () => {
		expect(stateKey("CY_HOSPITAL", "Γενικό Νοσοκομείο Παραδείγματος")).toMatch(/^[0-9a-f]{10}$/);
		expect(stateKey("CY_HOSPITAL", "Γενικό  Νοσοκομείο Παραδείγματος ")).toBe(
			stateKey("CY_HOSPITAL", "ΓΕΝΙΚΟ ΝΟΣΟΚΟΜΕΙΟ ΠΑΡΑΔΕΙΓΜΑΤΟΣ"),
		);
		expect(stateKey("CY_HEALTH_CENTRE", "Παράδειγμα")).not.toBe(
			stateKey("CY_HOSPITAL", "Παράδειγμα"),
		);
		expect(districtOfPhone("+35724000303")).toBe("Λάρνακα");
		expect(districtOfPhone("+35799000303")).toBeNull();
		expect(districtOfPhone(null)).toBeNull();
	});

	it("reads the hospitals with their points and the centres by the place their name gives", () => {
		const hospitals = parseHospitals(buffer(hospitalsCsv()));
		expect(hospitals.rows).toHaveLength(4);
		expect(hospitals.rows[0]?.location).toEqual({
			street: "Οδός Παραδείγματος 215",
			postcode: "2029",
			town: "Στρόβολος Λευκωσία",
			district: "Λευκωσία",
			point: { latitude: 35.1275, longitude: 33.3775 },
			phone: "+35722000201",
		});
		expect(hospitals.rows[2]?.location.point).toBeNull();
		expect(JSON.stringify(hospitals)).not.toContain("example.invalid");
		const centres = parseHealthCentres(buffer(centresCsv()));
		expect(centres.rows).toHaveLength(11);
		expect(centres.rows[0]?.location).toEqual({
			street: null,
			postcode: null,
			town: "Παραδείγματος Στροβόλου",
			district: "Λευκωσία",
			point: null,
			phone: "+35722000301",
		});
		// The fax is never read.
		expect(JSON.stringify(centres)).not.toContain("0399");
	});
});

describe("Cyprus's places", () => {
	it("joins the census's units to Cyprus Post's postcodes and centres", async () => {
		const sources = await parseCyPlaceSources(buffer(censusJson()), postcodesXlsx());
		expect(sources.censusUpdated).toBe("2025-04-16");
		expect(sources.municipalities.map((unit) => unit.code).sort()).toEqual([
			"1000",
			"1012",
			"1013",
			"3100",
			"4000",
			"5000",
			"6000",
		]);
		// Famagusta and Kyrenia: postcodes, but no census count.
		expect(sources.postcodesLeftOut).toBe(2);
		expect(sources.municipalities.find((unit) => unit.code === "1013")).toEqual({
			code: "1013",
			name: "Αγλαντζιά",
			latin: "Aglantzia",
			district: "1",
			population: 21510,
			latitude: 35.1453,
			longitude: 33.4165,
			postcodes: ["2101"],
		});
		const rows = buildCyPlaceRows(sources, []);
		expect(rows.filter((row) => row.kind === "department").map((row) => row.slug)).toEqual([
			"eparchia-lefkosias",
			"eparchia-ammochostou",
			"eparchia-larnakas",
			"eparchia-lemesou",
			"eparchia-pafou",
		]);
		expect(rows.find((row) => row.code === "3100")).toMatchObject({
			kind: "commune",
			slug: "agia-napa",
			department_code: "3",
			parent_code: "3",
		});
		// A renamed place keeps its old slug as an alias.
		const renamed = buildCyPlaceRows(sources, [
			{ kind: "commune", code: "1012", name: "Στρόβολος", slug: "strovolos", departmentCode: "1" },
			{ kind: "commune", code: "4000", name: "Λάρνακας", slug: "larnakas", departmentCode: "4" },
		]);
		expect(renamed.find((row) => row.code === "1012")).toMatchObject({
			slug: "strovolos",
			previous_slug: null,
		});
		expect(renamed.find((row) => row.code === "4000")).toMatchObject({
			slug: "larnaka",
			previous_slug: "larnakas",
		});
	});

	it("names a place as a page prints it", () => {
		expect(placeName("Λευκωσία - Σύνολο")).toBe("Λευκωσία");
		expect(placeName("Λατσιά ή Λακκιά")).toBe("Λατσιά");
		expect(placeName("'Υψωνας")).toBe("Ύψωνας");
		expect(() => parseCensus(buffer("{}"))).toThrow(/not the census table/);
	});

	it("places a facility by its postcode, an alias, its name, or its point", () => {
		const place = (
			id: number,
			code: string,
			name: string,
			postcodes: string[],
			latitude: number,
			longitude: number,
		): CyPlace => ({
			id,
			code,
			name,
			districtCode: code.slice(0, 1),
			postcodes,
			latitude,
			longitude,
		});
		const index = buildCyPlaceIndex([
			place(1, "1000", "Λευκωσία", ["1010"], 35.18, 33.4),
			place(2, "1012", "Στρόβολος", ["2003"], 35.14, 33.34),
			place(3, "5000", "Λεμεσός", ["3010"], 34.68, 33.03),
			place(4, "5101", "Κάτω Πολεμίδια", [], 34.69, 32.99),
			place(5, "1457", "Κάτω Πύργος", [], 35.18, 32.68),
			place(6, "1300", "Παλαιχώρι Μόρφου", [], 34.92, 33.08),
			place(7, "1310", "Παλαιχώρι Ορεινής", [], 34.92, 33.09),
		]);
		const at = (location: Partial<Parameters<typeof placeFacility>[0]>) =>
			placeFacility(
				{ postcode: null, town: null, district: null, point: null, ...location },
				index,
			);
		// The postcode wins over a district the list gets wrong.
		expect(at({ postcode: "2003", district: "Λεμεσός" })).toMatchObject({
			place: { code: "1012" },
			placedBy: "postcode",
		});
		// The most specific place named, then the one named first.
		expect(at({ town: "Κάτω Πολεμίδια Λεμεσός", district: "Λεμεσός" })?.place.code).toBe("5101");
		expect(at({ town: "Στρόβολος Λευκωσία", district: "Λευκωσία" })?.place.code).toBe("1012");
		expect(at({ town: "Παραδείγματος Στροβόλου", district: "Λευκωσία" })?.place.code).toBe("1012");
		// An alias, whatever the district the number dials.
		expect(at({ town: "Πύργου Τυλληρίας", district: "Πάφος" })?.place.code).toBe("1457");
		expect(at({ town: "Καϊμακλίου", district: "Λευκωσία" })?.place.code).toBe("1000");
		// Two villages named alike: left out rather than guessed.
		expect(at({ town: "Παλαιχωρίου", district: "Λευκωσία" })).toBeNull();
		// A hospital's point, near a place of its district.
		expect(
			at({ town: "Άγνωστη", district: "Λεμεσός", point: { latitude: 34.685, longitude: 33.02 } }),
		).toMatchObject({ place: { code: "5000" }, placedBy: "point" });
		expect(at({ town: "Άγνωστη", district: "Λεμεσός" })).toBeNull();
	});
});
