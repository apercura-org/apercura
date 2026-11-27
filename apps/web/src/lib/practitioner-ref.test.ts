import { describe, expect, it } from "vitest";
import { isRppsRef, marketRef, parsePractitionerRef, practitionerRefOf } from "./practitioner-ref";

describe("practitioner references", () => {
	it("reads an RPPS, alone or at the end of a French page address", () => {
		const rpps = { country: "FR", idScheme: "RPPS", nationalId: "19999990013" };
		expect(parsePractitionerRef("19999990013")).toEqual(rpps);
		expect(parsePractitionerRef(" 1999 9990 013 ")).toEqual(rpps);
		expect(parsePractitionerRef("https://apercura.org/fr/praticien/camille-19999990013")).toEqual(
			rpps,
		);
		expect(parsePractitionerRef("19999990014")).toBeNull();
	});

	it("reads an Austrian key, alone, as a slug or as a page address", () => {
		const key = { country: "AT", idScheme: "AT-WIEN", nationalId: "7983" };
		expect(parsePractitionerRef("w7983")).toEqual(key);
		expect(parsePractitionerRef("W7983")).toEqual(key);
		expect(parsePractitionerRef("anna-muster-w7983")).toEqual(key);
		expect(parsePractitionerRef("https://apercura.org/at/arzt/anna-muster-w7983/")).toEqual(key);
		expect(parsePractitionerRef("st45")?.idScheme).toBe("AT-STMK");
		expect(parsePractitionerRef("x45")).toBeNull();
		expect(parsePractitionerRef("")).toBeNull();
		expect(parsePractitionerRef(null)).toBeNull();
	});

	it("writes the reference back", () => {
		expect(practitionerRefOf({ idScheme: "RPPS", nationalId: "19999990013" })).toBe("19999990013");
		expect(practitionerRefOf({ idScheme: "AT-STMK", nationalId: "45" })).toBe("st45");
		expect(isRppsRef({ country: "FR", idScheme: "RPPS", nationalId: "19999990013" })).toBe(true);
		expect(isRppsRef({ country: "AT", idScheme: "AT-WIEN", nationalId: "1" })).toBe(false);
	});
});

describe("UK practice references", () => {
	const gp = { country: "GB", idScheme: "GB-ODS-GP", nationalId: "A99001" };

	it("read the `gb:` reference, a UK page address, and a bare key typed on a UK page", () => {
		expect(parsePractitionerRef("gb:a99001")).toEqual(gp);
		expect(parsePractitionerRef(" GB:A99001 ")).toEqual(gp);
		expect(
			parsePractitionerRef("https://apercura.org/gb/practice/the-example-surgery-a99001"),
		).toEqual(gp);
		expect(parsePractitionerRef("/gb/practice/the-example-surgery-a99001/")).toEqual(gp);
		expect(parsePractitionerRef("A99001")).toEqual(gp);
		expect(parsePractitionerRef("gb:sg89001")).toEqual({
			country: "GB",
			idScheme: "GB-PHS-GP",
			nationalId: "89001",
		});
		expect(parsePractitionerRef("gb:zz1")).toBeNull();
	});

	it("never read a Welsh ODS code as an Austrian key where the market is known", () => {
		const welsh = { country: "GB", idScheme: "GB-ODS-GP", nationalId: "W91234" };
		expect(parsePractitionerRef("gb:w91234")).toEqual(welsh);
		expect(parsePractitionerRef("https://apercura.org/gb/practice/meddygfa-w91234")).toEqual(welsh);
		expect(parsePractitionerRef("W91234", "GB")).toEqual(welsh);
		expect(parsePractitionerRef("w91234")?.country).toBe("AT");
		expect(parsePractitionerRef("https://apercura.org/at/arzt/anna-muster-w7983")?.country).toBe(
			"AT",
		);
	});

	it("write the reference back with its market", () => {
		expect(practitionerRefOf(gp)).toBe("gb:a99001");
		expect(practitionerRefOf({ idScheme: "GB-BSO-DENT", nationalId: "0a1b2c3d4e" })).toBe(
			"gb:nd0a1b2c3d4e",
		);
		expect(parsePractitionerRef(practitionerRefOf(gp))).toEqual(gp);
	});
});

describe("Czech facility references", () => {
	const facility = { country: "CZ", idScheme: "CZ-NRPZS", nationalId: "900001" };

	it("read the `cz:` reference, a Czech page address, and a number typed on a Czech page", () => {
		expect(parsePractitionerRef("cz:900001")).toEqual(facility);
		expect(parsePractitionerRef(" CZ: 900001 ")).toEqual(facility);
		expect(
			parsePractitionerRef("https://apercura.org/cz/zarizeni/mudr-jana-ukazkova-900001"),
		).toEqual(facility);
		expect(parsePractitionerRef("/cz/zarizeni/mudr-jana-ukazkova-900001/")).toEqual(facility);
		expect(parsePractitionerRef("900001", "CZ")).toEqual(facility);
		expect(parsePractitionerRef("mudr-jana-ukazkova-900001", "CZ")).toEqual(facility);
		expect(parsePractitionerRef("cz:0123")).toBeNull();
		expect(parsePractitionerRef("cz:")).toBeNull();
	});

	it("never read a bare number as Czech outside Czechia, nor a French RPPS as Czech", () => {
		expect(parsePractitionerRef("900001")).toBeNull();
		expect(parsePractitionerRef("19999990013", "CZ")).toEqual({
			country: "FR",
			idScheme: "RPPS",
			nationalId: "19999990013",
		});
		expect(
			parsePractitionerRef("https://apercura.org/fr/praticien/camille-19999990013")?.country,
		).toBe("FR");
	});

	it("write the reference back with its market", () => {
		expect(practitionerRefOf(facility)).toBe("cz:900001");
		expect(marketRef("900001", "CZ")).toBe("cz:900001");
		expect(parsePractitionerRef(practitionerRefOf(facility))).toEqual(facility);
	});
});

describe("Lithuanian institution references", () => {
	const address = { country: "LT", idScheme: "LT-VASPVT", nationalId: "9000-90000009" };

	it("read the `lt:` reference, a Lithuanian page address, and a key typed on a Lithuanian page", () => {
		expect(parsePractitionerRef("lt:9000-90000009")).toEqual(address);
		expect(parsePractitionerRef(" LT: 9000-90000009 ")).toEqual(address);
		expect(
			parsePractitionerRef("https://apercura.org/lt/istaiga/uab-pavyzdine-klinika-9000-90000009"),
		).toEqual(address);
		expect(parsePractitionerRef("/lt/istaiga/uab-pavyzdine-klinika-9000-90000009/")).toEqual(
			address,
		);
		expect(parsePractitionerRef("9000-90000009", "LT")).toEqual(address);
		expect(parsePractitionerRef("lt:9000-v0014102")).toBeNull();
		expect(parsePractitionerRef("lt:")).toBeNull();
	});

	it("write the reference back with its market", () => {
		expect(practitionerRefOf(address)).toBe("lt:9000-90000009");
		expect(marketRef("9000-90000009", "LT")).toBe("lt:9000-90000009");
		expect(parsePractitionerRef(practitionerRefOf(address))).toEqual(address);
		expect(parsePractitionerRef("19999990013", "LT")?.country).toBe("FR");
	});
});

describe("Spanish centre references", () => {
	const centre = { country: "ES", idScheme: "ES-REGCESS", nationalId: "1328000001" };

	it("read the `es:` reference, a Spanish page address, and a code typed on a Spanish page", () => {
		expect(parsePractitionerRef("es:1328000001")).toEqual(centre);
		expect(parsePractitionerRef(" ES: 1328000001 ")).toEqual(centre);
		expect(
			parsePractitionerRef(
				"https://apercura.org/es/centro/clinica-dental-ejemplo-centro-1328000001",
			),
		).toEqual(centre);
		expect(parsePractitionerRef("/es/centro/clinica-dental-ejemplo-centro-1328000001/")).toEqual(
			centre,
		);
		expect(parsePractitionerRef("1328000001", "ES")).toEqual(centre);
		expect(parsePractitionerRef("1328000001")).toEqual(centre);
		expect(parsePractitionerRef("clinica-dental-ejemplo-centro-1328000001", "ES")).toEqual(centre);
		expect(parsePractitionerRef("es:328000001")).toBeNull();
		expect(parsePractitionerRef("es:")).toBeNull();
	});

	it("still read France's former Spanish addresses and RPPS numbers as French", () => {
		expect(
			parsePractitionerRef("https://apercura.fr/es/profesional/camille-19999990013")?.country,
		).toBe("FR");
		expect(parsePractitionerRef("19999990013", "ES")?.country).toBe("FR");
		expect(parsePractitionerRef("900001", "ES")).toBeNull();
	});

	it("write the reference back with its market", () => {
		expect(practitionerRefOf(centre)).toBe("es:1328000001");
		expect(marketRef("1328000001", "ES")).toBe("es:1328000001");
		expect(parsePractitionerRef(practitionerRefOf(centre))).toEqual(centre);
	});
});

describe("Italian place references", () => {
	const pharmacy = { country: "IT", idScheme: "IT-FARM", nationalId: "9000001" };

	it("read the `it:` reference, an Italian page address, and a key typed on an Italian page", () => {
		expect(parsePractitionerRef("it:f9000001")).toEqual(pharmacy);
		expect(parsePractitionerRef(" IT: F9000001 ")).toEqual(pharmacy);
		expect(
			parsePractitionerRef("https://apercura.org/it/struttura/farmacia-esempio-f9000001"),
		).toEqual(pharmacy);
		expect(parsePractitionerRef("/it/struttura/farmacia-esempio-f9000001/")).toEqual(pharmacy);
		expect(parsePractitionerRef("f9000001", "IT")).toEqual(pharmacy);
		expect(parsePractitionerRef("farmacia-esempio-f9000001", "IT")).toEqual(pharmacy);
		expect(parsePractitionerRef("it:s990001")).toEqual({
			country: "IT",
			idScheme: "IT-HSP",
			nationalId: "990001",
		});
		expect(parsePractitionerRef("it:9000001")).toBeNull();
		expect(parsePractitionerRef("it:")).toBeNull();
	});

	it("still read France's former Italian addresses and RPPS numbers as French", () => {
		expect(
			parsePractitionerRef("https://apercura.fr/it/professionista/camille-19999990013")?.country,
		).toBe("FR");
		expect(parsePractitionerRef("19999990013", "IT")?.country).toBe("FR");
	});

	it("write the reference back with its market", () => {
		expect(practitionerRefOf(pharmacy)).toBe("it:f9000001");
		expect(marketRef("F9000001", "IT")).toBe("it:f9000001");
		expect(parsePractitionerRef(practitionerRefOf(pharmacy))).toEqual(pharmacy);
	});
});

describe("German facility references", () => {
	const hospital = { country: "DE", idScheme: "DE-KHV", nationalId: "0a1b2c3d4e" };
	const pharmacy = { country: "DE", idScheme: "DE-APO-TH", nationalId: "9001" };

	it("read the `de:` reference, a German page address, and a key typed on a German page", () => {
		expect(parsePractitionerRef("de:k0a1b2c3d4e")).toEqual(hospital);
		expect(parsePractitionerRef(" DE: K0A1B2C3D4E ")).toEqual(hospital);
		expect(
			parsePractitionerRef("https://apercura.org/de/einrichtung/klinikum-beispiel-k0a1b2c3d4e"),
		).toEqual(hospital);
		expect(parsePractitionerRef("/de/einrichtung/beispiel-apotheke-th9001/")).toEqual(pharmacy);
		expect(parsePractitionerRef("th9001", "DE")).toEqual(pharmacy);
		expect(parsePractitionerRef("klinikum-beispiel-k0a1b2c3d4e", "DE")).toEqual(hospital);
		expect(parsePractitionerRef("de:k0a1b2c3d4")).toBeNull();
		expect(parsePractitionerRef("de:")).toBeNull();
	});

	it("still read France's former German addresses, RPPS numbers and Austrian keys as theirs", () => {
		expect(
			parsePractitionerRef("https://apercura.fr/de/behandler/camille-19999990013")?.country,
		).toBe("FR");
		expect(parsePractitionerRef("19999990013", "DE")?.country).toBe("FR");
		expect(parsePractitionerRef("w7983")?.country).toBe("AT");
	});

	it("write the reference back with its market", () => {
		expect(practitionerRefOf(hospital)).toBe("de:k0a1b2c3d4e");
		expect(practitionerRefOf(pharmacy)).toBe("de:th9001");
		expect(marketRef("th9001", "DE")).toBe("de:th9001");
		expect(parsePractitionerRef(practitionerRefOf(pharmacy))).toEqual(pharmacy);
	});
});
describe("Swiss facility references", () => {
	const hospital = { country: "CH", idScheme: "CH-BAG", nationalId: "123456789" };

	it("read the `ch:` reference, a Swiss page address in any language, and a key typed on a Swiss page", () => {
		expect(parsePractitionerRef("ch:h123456789")).toEqual(hospital);
		expect(parsePractitionerRef(" CH: H123456789 ")).toEqual(hospital);
		for (const path of [
			"https://apercura.org/ch/einrichtung/kantonsspital-beispiel-h123456789",
			"https://apercura.org/ch-fr/etablissement/hopital-exemple-h123456789",
			"/ch-it/struttura/ospedale-esempio-h123456789/",
		]) {
			expect(parsePractitionerRef(path), path).toEqual(hospital);
		}
		expect(parsePractitionerRef("h123456789", "CH")).toEqual(hospital);
		expect(parsePractitionerRef("kantonsspital-beispiel-h123456789", "CH")).toEqual(hospital);
		expect(parsePractitionerRef("ch:ju123456789")).toEqual({
			country: "CH",
			idScheme: "CH-JU",
			nationalId: "123456789",
		});
		expect(parsePractitionerRef("ch:123456789")).toBeNull();
		expect(parsePractitionerRef("ch:")).toBeNull();
		expect(parsePractitionerRef("ch:f9000001")).toBeNull();
	});

	it("still read other markets' references on a Swiss page", () => {
		expect(parsePractitionerRef("19999990013", "CH")?.country).toBe("FR");
		expect(parsePractitionerRef("it:f9000001", "CH")?.country).toBe("IT");
	});

	it("write the reference back with its market", () => {
		expect(practitionerRefOf(hospital)).toBe("ch:h123456789");
		expect(marketRef("H123456789", "CH")).toBe("ch:h123456789");
		expect(parsePractitionerRef(practitionerRefOf(hospital))).toEqual(hospital);
		expect(practitionerRefOf({ idScheme: "CH-BL-PHARM", nationalId: "7601001796874" })).toBe(
			"ch:blp7601001796874",
		);
	});
});

describe("Estonian provider and pharmacy references", () => {
	const provider = { country: "EE", idScheme: "EE-TTL", nationalId: "01909" };
	const pharmacy = { country: "EE", idScheme: "EE-APT", nationalId: "457" };

	it("read the `ee:` reference, an Estonian page address, and a key typed on an Estonian page", () => {
		expect(parsePractitionerRef("ee:l01909")).toEqual(provider);
		expect(parsePractitionerRef(" EE: L01909 ")).toEqual(provider);
		expect(
			parsePractitionerRef("https://apercura.org/ee/asutus/perearstikeskus-naide-l01909"),
		).toEqual(provider);
		expect(parsePractitionerRef("/ee/asutus/naidisapteek-ap457/")).toEqual(pharmacy);
		// The licence number as a provider's page prints it.
		expect(parsePractitionerRef("L01909", "EE")).toEqual(provider);
		expect(parsePractitionerRef("ap457", "EE")).toEqual(pharmacy);
		expect(parsePractitionerRef("ee:l1909")).toBeNull();
		expect(parsePractitionerRef("ee:")).toBeNull();
	});

	it("still read RPPS numbers as French", () => {
		expect(parsePractitionerRef("19999990013", "EE")?.country).toBe("FR");
		expect(parsePractitionerRef("ap457")).toBeNull();
	});

	it("write the reference back with its market", () => {
		expect(practitionerRefOf(provider)).toBe("ee:l01909");
		expect(practitionerRefOf(pharmacy)).toBe("ee:ap457");
		expect(marketRef("L01909", "EE")).toBe("ee:l01909");
		expect(parsePractitionerRef(practitionerRefOf(pharmacy))).toEqual(pharmacy);
	});
});

describe("Norwegian establishment references", () => {
	const establishment = { country: "NO", idScheme: "NO-ORGNR", nationalId: "910000039" };

	it("read the `no:` reference, a Norwegian page address, and a number typed on a Norwegian page", () => {
		expect(parsePractitionerRef("no:910000039")).toEqual(establishment);
		expect(parsePractitionerRef(" NO: 910 000 039 ")).toEqual(establishment);
		expect(
			parsePractitionerRef("https://apercura.org/no/virksomhet/eksempel-legesenter-910000039"),
		).toEqual(establishment);
		expect(parsePractitionerRef("/no/virksomhet/eksempel-legesenter-910000039/")).toEqual(
			establishment,
		);
		// The number as a Norwegian page prints it.
		expect(parsePractitionerRef("910 000 039", "NO")).toEqual(establishment);
		expect(parsePractitionerRef("no:910000038")).toBeNull();
		expect(parsePractitionerRef("no:")).toBeNull();
	});

	it("still read RPPS numbers as French", () => {
		expect(parsePractitionerRef("19999990013", "NO")?.country).toBe("FR");
	});

	it("write the reference back with its market", () => {
		expect(practitionerRefOf(establishment)).toBe("no:910000039");
		expect(marketRef("910 000 039", "NO")).toBe("no:910000039");
		expect(parsePractitionerRef(practitionerRefOf(establishment))).toEqual(establishment);
	});
});

describe("Irish facility references", () => {
	const pharmacy = { country: "IE", idScheme: "IE-PSI", nationalId: "1234" };
	const nursingHome = { country: "IE", idScheme: "IE-HIQA", nationalId: "738" };
	const hospital = { country: "IE", idScheme: "IE-HSE-HOSP", nationalId: "123456789" };
	const healthCentre = { country: "IE", idScheme: "IE-HSE-HC", nationalId: "223456789" };

	it("read the `ie:` reference, an Irish page address, and a key typed on an Irish page", () => {
		expect(parsePractitionerRef("ie:p1234")).toEqual(pharmacy);
		expect(parsePractitionerRef(" IE: N738 ")).toEqual(nursingHome);
		expect(parsePractitionerRef("ie:h123456789")).toEqual(hospital);
		expect(parsePractitionerRef("ie:c223456789")).toEqual(healthCentre);
		for (const path of [
			"https://apercura.org/ie/facility/example-pharmacy-p1234",
			"/ie/facility/example-pharmacy-p1234/",
		]) {
			expect(parsePractitionerRef(path), path).toEqual(pharmacy);
		}
		expect(parsePractitionerRef("p1234", "IE")).toEqual(pharmacy);
		expect(parsePractitionerRef("example-nursing-home-n738", "IE")).toEqual(nursingHome);
		// A hospital key reads as Ireland's on an Irish page, as Switzerland's on a Swiss one.
		expect(parsePractitionerRef("h123456789", "IE")).toEqual(hospital);
		expect(parsePractitionerRef("h123456789", "CH")?.country).toBe("CH");
		expect(
			parsePractitionerRef("https://apercura.org/ie/facility/example-hospital-h123456789"),
		).toEqual(hospital);
		expect(parsePractitionerRef("ie:123456789")).toBeNull();
		expect(parsePractitionerRef("ie:")).toBeNull();
		expect(parsePractitionerRef("ie:f9000001")).toBeNull();
		expect(parsePractitionerRef("ie:h12345")).toBeNull();
	});

	it("still read other markets' references on an Irish page", () => {
		expect(parsePractitionerRef("19999990013", "IE")?.country).toBe("FR");
		expect(parsePractitionerRef("ch:h123456789", "IE")?.country).toBe("CH");
		expect(parsePractitionerRef("gb:a81001", "IE")?.country).toBe("GB");
	});

	it("write the reference back with its market", () => {
		expect(practitionerRefOf(pharmacy)).toBe("ie:p1234");
		expect(practitionerRefOf(hospital)).toBe("ie:h123456789");
		expect(practitionerRefOf(healthCentre)).toBe("ie:c223456789");
		expect(marketRef("P1234", "IE")).toBe("ie:p1234");
		expect(marketRef("H123456789", "IE")).toBe("ie:h123456789");
		for (const ref of [pharmacy, nursingHome, hospital, healthCentre]) {
			expect(parsePractitionerRef(practitionerRefOf(ref))).toEqual(ref);
		}
	});
});

describe("Finnish service location references", () => {
	const key = "b18aa7f87eca4b97a8e8b438d2e29427";
	const location = { country: "FI", idScheme: "FI-PTV", nationalId: key };

	it("read the `fi:` reference, a Finnish page address, the catalogue's id and a key", () => {
		expect(parsePractitionerRef(`fi:${key}`)).toEqual(location);
		expect(parsePractitionerRef(` FI: ${key.toUpperCase()} `)).toEqual(location);
		expect(
			parsePractitionerRef(`https://apercura.org/fi/toimipiste/lapuan-terveyskeskus-${key}`),
		).toEqual(location);
		// The id as a page prints it, typed on a Finnish page.
		expect(parsePractitionerRef("b18aa7f8-7eca-4b97-a8e8-b438d2e29427", "FI")).toEqual(location);
		expect(parsePractitionerRef(key, "FI")).toEqual(location);
		expect(parsePractitionerRef(`fi:${key.slice(1)}`)).toBeNull();
		expect(parsePractitionerRef("fi:")).toBeNull();
	});

	it("write the reference back with its market", () => {
		expect(practitionerRefOf(location)).toBe(`fi:${key}`);
		expect(parsePractitionerRef(practitionerRefOf(location))).toEqual(location);
	});
});

describe("Cypriot facility references", () => {
	const pharmacy = { country: "CY", idScheme: "CY-FARM", nationalId: "101" };
	const hospital = { country: "CY", idScheme: "CY-MOH", nationalId: "00000000b2" };

	it("read the `cy:` reference, a Cypriot page address, and a key typed on a Cypriot page", () => {
		expect(parsePractitionerRef("cy:f101")).toEqual(pharmacy);
		expect(parsePractitionerRef(" CY: F101 ")).toEqual(pharmacy);
		expect(parsePractitionerRef("cy:m00000000b2")).toEqual(hospital);
		expect(
			parsePractitionerRef(
				"https://apercura.org/cy/monada/farmakeio-odos-paradeigmatos-12-lefkosia-f101",
			),
		).toEqual(pharmacy);
		expect(parsePractitionerRef("/cy/monada/geniko-nosokomeio-paradeigmatos-m00000000b2/")).toEqual(
			hospital,
		);
		expect(parsePractitionerRef("F101", "CY")).toEqual(pharmacy);
		expect(parsePractitionerRef("cy:101")).toBeNull();
		expect(parsePractitionerRef("cy:")).toBeNull();
	});

	it("still read RPPS numbers as French", () => {
		expect(parsePractitionerRef("19999990013", "CY")?.country).toBe("FR");
	});

	it("write the reference back with its market", () => {
		expect(practitionerRefOf(pharmacy)).toBe("cy:f101");
		expect(practitionerRefOf(hospital)).toBe("cy:m00000000b2");
		expect(marketRef("F101", "CY")).toBe("cy:f101");
		expect(parsePractitionerRef(practitionerRefOf(hospital))).toEqual(hospital);
	});
});

describe("Latvian place references", () => {
	const practice = { country: "LV", idScheme: "LV-GP", nationalId: "010000006" };
	const pharmacy = { country: "LV", idScheme: "LV-APT", nationalId: "324" };

	it("read the `lv:` reference, a Latvian page address, and a key typed on a Latvian page", () => {
		expect(parsePractitionerRef("lv:g010000006")).toEqual(practice);
		expect(parsePractitionerRef(" LV: A324 ")).toEqual(pharmacy);
		expect(
			parsePractitionerRef(
				"https://apercura.org/lv/iestade/ilzes-paraugas-gimenes-arsta-prakse-g010000006",
			),
		).toEqual(practice);
		expect(parsePractitionerRef("/lv/iestade/paraugu-aptieka-a324/")).toEqual(pharmacy);
		expect(parsePractitionerRef("a324", "LV")).toEqual(pharmacy);
		expect(parsePractitionerRef("lv:g10000006")).toBeNull();
		expect(parsePractitionerRef("lv:")).toBeNull();
	});

	it("write the reference back with its market", () => {
		expect(practitionerRefOf(practice)).toBe("lv:g010000006");
		expect(practitionerRefOf(pharmacy)).toBe("lv:a324");
		expect(marketRef("A324", "LV")).toBe("lv:a324");
		expect(parsePractitionerRef(practitionerRefOf(practice))).toEqual(practice);
		// An RPPS typed on a Latvian page is still France's.
		expect(parsePractitionerRef("19999990013", "LV")?.country).toBe("FR");
	});
});
