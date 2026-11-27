import { describe, expect, it } from "vitest";
import {
	addressArchive,
	EE_ADDRESSES,
	EE_FACILITIES,
	pharmaciesCsv,
	registerXml,
	settlementsArchive,
} from "../../../fixtures/generate-ee";
import { readAdsIndex } from "./ads";
import { inEstonia, lest97ToWgs84, wgs84ToLest97 } from "./lest97";
import { parseMedre } from "./medre";
import {
	addressKey,
	addressParts,
	cityLabel,
	firstAddress,
	locationKey,
	providerName,
} from "./names";
import { exportForm, parsePharmacies } from "./pharmacies";
import { buildEePlaceIndex, parseEePlaces, placeAddress } from "./places";

describe("L-EST97", () => {
	// Reference points converted with PostGIS (ST_Transform from EPSG:3301 to 4326).
	it("converts the grid to WGS 84 as PostGIS does", () => {
		const keila = lest97ToWgs84(523306.03, 6574787.37);
		expect(keila?.longitude).toBeCloseTo(24.409192211, 8);
		expect(keila?.latitude).toBeCloseTo(59.310613567, 8);
		const tartu = lest97ToWgs84(659000, 6474000);
		expect(tartu?.longitude).toBeCloseTo(26.71841032, 8);
		expect(tartu?.latitude).toBeCloseTo(58.377480241, 8);
		const origin = lest97ToWgs84(500000, 6375000);
		expect(origin?.longitude).toBeCloseTo(24, 10);
		expect(origin?.latitude).toBeCloseTo(57.517553931, 8);
	});

	it("round-trips, and refuses points outside Estonia", () => {
		const point = { longitude: 21.807173049, latitude: 57.902494234 };
		const grid = wgs84ToLest97(point);
		expect(grid.x).toBeCloseTo(370000, 2);
		expect(grid.y).toBeCloseTo(6420000, 2);
		expect(lest97ToWgs84(0, 0)).toBeNull();
		expect(lest97ToWgs84(Number.NaN, 6474000)).toBeNull();
		expect(inEstonia({ longitude: 24.75, latitude: 59.44 })).toBe(true);
		expect(inEstonia({ longitude: 24.94, latitude: 60.17 })).toBe(false);
	});
});

describe("Estonian names and addresses", () => {
	it("drops the legal form and re-cases a name in capitals only", () => {
		expect(providerName("Medicum Perearstikeskus OÜ")).toBe("Medicum Perearstikeskus");
		expect(providerName("Sihtasutus Ida-Viru Keskhaigla")).toBe("Ida-Viru Keskhaigla");
		expect(providerName("Kuressaare Haigla Sihtasutus")).toBe("Kuressaare Haigla");
		expect(providerName("SIHTASUTUS AHTME HAIGLA")).toBe("Ahtme Haigla");
		expect(providerName("Täisühing HAAPSALU PEREARST")).toBe("Haapsalu Perearst");
		expect(providerName("KOHTLA-JÄRVE TERVIS OÜ")).toBe("Kohtla-Järve Tervis");
		expect(providerName("AS Fertilitas Haiglaapteek")).toBe("Fertilitas Haiglaapteek");
		expect(providerName("FIE Näidis Näide")).toBe("Näidis Näide");
		// Mixed case is kept as published; a legal form alone stays.
		expect(providerName("Erapolikliinik PRAXIS")).toBe("Erapolikliinik PRAXIS");
		expect(providerName("Linda HIV Sihtasutus")).toBe("Linda HIV");
		expect(providerName("OÜ")).toBe("OÜ");
	});

	it("reads the first of several addresses, without a postcode", () => {
		expect(firstAddress("Harju maakond, Tallinn, Kesklinna linnaosa, Aia tn 7 // Uus tn 12")).toBe(
			"Harju maakond, Tallinn, Kesklinna linnaosa, Aia tn 7",
		);
		expect(firstAddress("Tartu maakond, Tartu linn, Tartu linn, Ülase tn 16, 50412")).toBe(
			"Tartu maakond, Tartu linn, Tartu linn, Ülase tn 16",
		);
		expect(addressKey("Harju  maakond ,Tallinn")).toBe("harju maakond, tallinn");
		expect(addressParts("Eesti Vabariik (mobiilne nahakabinet)")).toBeNull();
		expect(addressParts("Harju maakond, Lääne-Harju vald")).toEqual({
			county: "Harju maakond",
			municipality: "Lääne-Harju vald",
			rest: [],
		});
		expect(locationKey("Harju maakond, Tallinn")).toBe(locationKey("harju maakond,  Tallinn"));
	});

	it("prints the place a postal address names", () => {
		expect(cityLabel("Tartu linn", "Tartu linn")).toBe("Tartu");
		expect(cityLabel("Kuressaare linn", "Saaremaa vald")).toBe("Kuressaare");
		expect(cityLabel("Kesklinna linnaosa", "Tallinn")).toBe("Tallinn");
		expect(cityLabel("Ahtme linnaosa", "Kohtla-Järve linn")).toBe("Kohtla-Järve");
		expect(cityLabel("Haabneeme alevik", "Viimsi vald")).toBe("Haabneeme alevik");
	});
});

describe("the Health Board's register", () => {
	const result = parseMedre(registerXml(EE_FACILITIES), "2026-11-27");
	const byName = (name: string) => result.rows.find((row) => row.name === name);

	it("reads every provider, its extract date, and what it leaves out", () => {
		expect(result.lines).toBe(164);
		expect(result.edition).toBe(20261127);
		expect(result.rows).toHaveLength(160);
		expect(result.quarantined).toEqual([{ lineNo: 14, reason: "licence number", sample: "X0141" }]);
		expect(result.skipped).toEqual({
			"ambulance only": 1,
			"licence not in force": 1,
			"no licence in force": 1,
			"no place a patient visits": 1,
			"place without an address": 1,
			"school health or ambulance place": 2,
		});
	});

	it("keys a provider by its first licence and keeps its places, licences and services", () => {
		const hospital = byName("Näidise Haigla");
		expect(hospital).toMatchObject({ nationalId: "00011", professionCode: "EE_HOSPITAL" });
		expect(hospital?.locations.map((location) => location.address)).toEqual([
			"Tartu maakond, Tartu linn, Tartu linn, Näidise tn 1",
			"Tartu maakond, Tartu linn, Ilmatsalu küla",
		]);
		expect(hospital?.qualifications).toEqual([
			{ source: "tegevusluba", code: "L00011", label: "Eriarstiabi" },
			{ source: "tegevusluba", code: "L00012", label: "Õendusabi" },
			{ source: "haiglaliik", code: "YLD", label: "Üldhaigla" },
			{ source: "teenus", code: "T0204", label: "koduõendusteenus" },
			{ source: "teenus", code: "T0038", label: "ambulatoorsed üldkirurgiateenused" },
			{ source: "teenus", code: "T0058", label: "intensiivraviteenused" },
		]);
		expect(byName("Näidise Perearstikeskus")).toMatchObject({
			nationalId: "00021",
			professionCode: "EE_FAMILY_PRACTICE",
			locations: [{ address: "Harju maakond, Tallinn, Kesklinna linnaosa, Näite pst 7" }],
		});
		expect(byName("Hambakliinik Näide")?.professionCode).toBe("EE_DENTAL");
		expect(byName("Näidise Silmakeskus")?.professionCode).toBe("EE_SPECIALIST");
		expect(byName("Näidise Õendushaigla")?.professionCode).toBe("EE_NURSING");
		expect(byName("Näidise Logopeed")?.professionCode).toBe("EE_SPEECH_THERAPY");
	});

	it("never reads the health workers, the registry code or the legal address", () => {
		const text = JSON.stringify(result);
		expect(text).not.toMatch(/D99001|Mari|Jaan|19999999|90099901|registriaadress/);
	});

	it("reads a licence in force on the day only", () => {
		const later = parseMedre(registerXml(EE_FACILITIES), "2024-06-01");
		expect(later.rows.find((row) => row.name === "Näidise Lõppenud Kliinik")).toBeTruthy();
	});

	it("fails on a file that is not the register", () => {
		expect(() => parseMedre("<html></html>", "2026-11-27")).toThrow(/no <asutused> root/);
		expect(() =>
			parseMedre('<asutused hetk="2026-11-27T08:00:00"></asutused>', "2026-11-27"),
		).toThrow(/no <asutus> record/);
	});
});

describe("the State Agency of Medicines' pharmacies", () => {
	const result = parsePharmacies(Buffer.from(pharmaciesCsv(EE_FACILITIES.pharmacies)));

	it("lists the general pharmacies, never the pharmacist, e-mail or holder", () => {
		expect(result.lines).toBe(66);
		expect(result.rows).toHaveLength(64);
		expect(result.skipped).toEqual({ haiglaapteek: 1, veterinaarapteek: 1 });
		expect(result.rows[0]).toEqual({
			source: "apteegid",
			lineNo: 2,
			nationalId: "9001",
			professionCode: "EE_PHARMACY",
			name: "Näidise Apteek",
			locations: [
				{
					address: "Tartu maakond, Tartu linn, Tartu linn, Näidise tn 1",
					adrId: "9000001",
					phone: "+3726990001",
				},
			],
			qualifications: [{ source: "apteegi-tegevusluba", code: "901", label: "Üldapteek" }],
		});
		expect(JSON.stringify(result)).not.toMatch(/Pille|example\.test|Näidisapteegid|Proviisor/);
	});

	it("drops a chain's number", () => {
		expect(result.counters.sharedPhones).toBe(4);
		expect(result.rows.filter((row) => row.locations[0]?.phone === "+3726999999")).toEqual([]);
	});

	it("fails on a file that is not the export", () => {
		expect(() => parsePharmacies("a;b\n1;2\n")).toThrow(/missing expected column/);
	});

	it("finds the export button's form and sends what a browser sends", () => {
		const html = `<form id="a" action="/x"><input type="submit" name="a:go" value="Otsi" /></form>
			<form id="j_idt24" name="j_idt24" method="post" action="/rkav/faces/otsing.xhtml;jsessionid=ABC">
			<input type="hidden" name="j_idt24" value="j_idt24" />
			<input type="text" name="j_idt24:nimi" value="" />
			<select name="j_idt24:maakond" size="1"><option value="">Kõik</option><option value="37" selected="selected">Harju</option></select>
			<select name="j_idt24:liik"><option value="1">Üld</option></select>
			<input type="checkbox" name="j_idt24:x" value="on" />
			<input type="submit" name="j_idt24:j_idt84" value="Apteekide koondandmed" />
			<input type="hidden" name="jakarta.faces.ViewState" value="1:2&amp;3" />
			</form>`;
		expect(exportForm(html)).toEqual({
			action: "/rkav/faces/otsing.xhtml;jsessionid=ABC",
			fields: [
				["j_idt24", "j_idt24"],
				["j_idt24:nimi", ""],
				["jakarta.faces.ViewState", "1:2&3"],
				["j_idt24:maakond", "37"],
				["j_idt24:liik", "1"],
				["j_idt24:j_idt84", "Apteekide koondandmed"],
			],
		});
		expect(exportForm("<form action='/x'></form>")).toBeNull();
	});
});

describe("the address data system's file", () => {
	it("keeps only the addresses looked up, by full address and by id", async () => {
		const archive = addressArchive(EE_ADDRESSES);
		const index = await readAdsIndex(
			archive,
			new Set([addressKey("Harju maakond, Tallinn, Kesklinna linnaosa, Näite pst 7")]),
			new Set(["9000001"]),
		);
		expect(index.lines).toBe(EE_ADDRESSES.length);
		expect([...index.byAddress.keys()]).toEqual([
			"harju maakond, tallinn, kesklinna linnaosa, näite pst 7",
		]);
		expect(index.byAddress.values().next().value?.postcode).toBe("10117");
		const tartu = index.byId.get("9000001");
		expect(tartu?.point?.latitude).toBeCloseTo(58.3712, 6);
		expect(tartu?.point?.longitude).toBeCloseTo(26.7301, 6);
		await expect(readAdsIndex(archive, new Set(), new Set(), 1_000)).rejects.toThrow(
			/holds 9 lines/,
		);
	});
});

describe("Estonian places", () => {
	const sources = parseEePlaces(settlementsArchive());

	it("reads counties, municipalities and settlements, their names in Windows-1257", () => {
		expect(sources.asOf).toBe("2026-11-01");
		expect(sources.counties).toContainEqual({ code: "0079", name: "Tartu maakond" });
		expect(sources.municipalities).toContainEqual({
			code: "0321",
			name: "Kohtla-Järve linn",
			county: "0045",
		});
		const ahtme = sources.settlements.find((settlement) => settlement.code === "0120");
		expect(ahtme?.name).toBe("Ahtme linnaosa");
		expect(ahtme?.latitude).toBeCloseTo(59.3229, 3);
		expect(ahtme?.longitude).toBeCloseTo(27.4349, 3);
	});

	it("places an address in its settlement, or in its municipality's own town", () => {
		const index = buildEePlaceIndex(
			sources.settlements.map((settlement, id) => ({
				id,
				code: settlement.code,
				name: settlement.name,
				municipalityCode: settlement.municipality,
			})),
			sources.municipalities,
		);
		expect(
			placeAddress("Harju maakond, Tallinn, Kesklinna linnaosa, Narva mnt 7", index),
		).toMatchObject({
			settlement: { code: "0298" },
			street: "Narva mnt 7",
			city: "Tallinn",
			placedBy: "settlement",
		});
		expect(placeAddress("Harju maakond, Keila linn, Pargi tn 2b", index)).toMatchObject({
			settlement: { code: "0296" },
			street: "Pargi tn 2b",
			city: "Keila",
			placedBy: "town",
		});
		expect(placeAddress("Tartu maakond, Tartu linn, Ilmatsalu küla", index)).toMatchObject({
			settlement: { code: "2049" },
			street: null,
			city: "Ilmatsalu küla",
		});
		expect(placeAddress("Pärnu maakond, Saarde vald", index)).toBeNull();
		expect(placeAddress("Eesti Vabariik", index)).toBeNull();
	});
});
