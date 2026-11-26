import { describe, expect, it } from "vitest";
import {
	farmacieCsv,
	IT_HOSPITALS,
	IT_PLACES,
	istatZip,
	openShops,
	parafarmacieCsv,
	postiLettoCsv,
} from "../../../fixtures/generate-it";
import { buildItOptions, parseArgs, parseItSources, todayInRome } from "../../config";
import { buildItBatch } from "../../merge-it";
import {
	decodeEntities,
	decodeLines,
	isoDateIt,
	italianPoint,
	parseFarmacie,
	parseItSource,
	parseParafarmacie,
	parsePostiLetto,
	repairMojibake,
} from "./ministry";
import {
	hospitalNameIt,
	parapharmacyNameIt,
	pharmacyNameIt,
	placeNameIt,
	streetIt,
	titleCaseIt,
} from "./names";
import { buildItPlaceRows, interiorPoint, italianName, parseIstatBoundaries } from "./places";
import { csvUrlOfPage, datasetSlugs, licenceOfPage } from "./portal";

const OPTIONS = { asOf: "2026-11-26", registerCoordinates: false };

describe("Italian names", () => {
	it("are cased the Italian way, accents restored", () => {
		expect(titleCaseIt("OSPEDALE DI CHIAVENNA")).toBe("Ospedale di Chiavenna");
		expect(titleCaseIt("FARMACIA SANT'ANDREA")).toBe("Farmacia Sant'Andrea");
		expect(titleCaseIt("UNIVERSITA' GIORDA")).toBe("Università Giorda");
		expect(titleCaseIt("OSP.SACRO CUORE DI GESU`FATEBENEFRATELLI")).toBe(
			"Osp.Sacro Cuore di Gesù Fatebenefratelli",
		);
		expect(titleCaseIt("CASA DI CURA SANT`ANNA")).toBe("Casa di Cura Sant'Anna");
		expect(titleCaseIt("PO AVEZZANO 'S. FILIPPO E NICOLA'")).toBe(
			"PO Avezzano “S. Filippo e Nicola”",
		);
		expect(titleCaseIt("PRESIDIO OSPEDALIERO AST3")).toBe("Presidio Ospedaliero AST3");
		expect(titleCaseIt("IRCCS ISTITUTO DELL'ANNUNZIATA")).toBe("IRCCS Istituto dell'Annunziata");
		expect(titleCaseIt("parafarmacia corso cavour")).toBe("Parafarmacia Corso Cavour");
		expect(titleCaseIt("Parafarmacia IL SORRISO")).toBe("Parafarmacia Il Sorriso");
		expect(titleCaseIt("Farmacia del mare")).toBe("Farmacia del mare");
		expect(titleCaseIt("  ")).toBe("");
	});

	it("leave out a pharmacy's owners: titles, company forms and what follows them", () => {
		const cases: [string, string][] = [
			["FARMACIA ESEMPIO S.N.C. DEI DOTT.RI FITTIZIO MARIO E PROVA ANNA", "Farmacia Esempio"],
			["CAMPIONE DR.SSA MODELLO GIULIA", "Farmacia Campione"],
			["REDAMANTE DR. SIMONE", "Farmacia Redamante"],
			["ALGOSTINO DEMICHELIS DI GALLO DOTT. MARIO", "Farmacia Algostino Demichelis"],
			["FARMACIA OPERTI del Dott. RIVA Sergio", "Farmacia Operti"],
			["PERISSINOTTI DI GIOVANNI PERSINOTTI & C SNC", "Farmacia Perissinotti"],
			["ANTICA FARMACIA BOSIO DI GPHARMA1 S.R.L.", "Antica Farmacia Bosio"],
			[
				"FARMACIA TEZZE DI PIAVE S.A.S. DELLA DOTT.SSA IUDICI ANGELA & C.",
				"Farmacia Tezze di Piave",
			],
			["FARMACIA PEDROCCHIS.R.L", "Farmacia Pedrocchi"],
			["FARMACIA DEL ROSARIO S.R.L.", "Farmacia del Rosario"],
			["DEL MONUMENTO", "Farmacia del Monumento"],
			["INTERNAZIONALE", "Farmacia Internazionale"],
			["Collova'", "Farmacia Collovà"],
			["STADTAPOTHEKE STERZING O.H.G. DES DR. MAIR WALTER & C.", "Stadtapotheke Sterzing"],
			["Farmacia dottor Palmeri e dottoressa Repetti", "Farmacia"],
			["DR. ESEMPIO", "Farmacia Esempio"],
			["FARMAGORA' CORNIGLIANO SRL", "Farmagorà Cornigliano"],
		];
		for (const [raw, name] of cases) expect(pharmacyNameIt(raw).name, raw).toBe(name);
		expect(pharmacyNameIt("FARMACIA SAN CARLO").stripped).toBe(false);
		expect(pharmacyNameIt("FARMACIA SAN CARLO SNC").stripped).toBe(true);
	});

	it("keep a hospital's name, without its company form only", () => {
		expect(hospitalNameIt("CASA DI CURA VILLA BIANCA S.R.L.").name).toBe(
			"Casa di Cura Villa Bianca",
		);
		expect(hospitalNameIt("CASA DI CURA VILLA DEI GERANI SrL").name).toBe(
			"Casa di Cura Villa dei Gerani",
		);
		expect(hospitalNameIt("CASA DI CURA 'PROF. PETRUCCIANI' S.r.l.").name).toBe(
			"Casa di Cura “Prof. Petrucciani”",
		);
		expect(hospitalNameIt("ICS MAUGERI SPA SOCIETA' BENEFIT").name).toBe("ICS Maugeri");
		expect(placeNameIt("OSPEDALE DOTT. ESEMPIO", false).name).toBe("OSPEDALE DOTT. ESEMPIO");
	});

	it("name a parapharmacy as one", () => {
		expect(parapharmacyNameIt("PARAFARMACIA ESEMPIO DOTT.SSA PROVA LUCIA").name).toBe(
			"Parafarmacia Esempio",
		);
		expect(parapharmacyNameIt("Corner Salute Campione srl").name).toBe(
			"Parafarmacia Corner Salute Campione",
		);
		expect(parapharmacyNameIt("Parafarmacia Nadila srls").name).toBe("Parafarmacia Nadila");
		expect(parapharmacyNameIt("Parafarmacia Dott.ssa Silvana Esempio").name).toBe("Parafarmacia");
	});

	it("case streets and drop the list's placeholders", () => {
		expect(streetIt("VIA BRIGATA CAGLIARI 39 ")).toBe("Via Brigata Cagliari 39");
		expect(streetIt("Via Buggianese, 108")).toBe("Via Buggianese, 108");
		expect(streetIt("-")).toBeNull();
		expect(streetIt("")).toBeNull();
	});
});

describe("the ministry's text", () => {
	it("decodes entities, mixed encodings and text read twice", () => {
		expect(decodeEntities("PROVA &amp;amp; C.")).toBe("PROVA & C.");
		expect(decodeEntities("D&#39;ESEMPIO &quot;X&quot;")).toBe(`D'ESEMPIO "X"`);
		// One pass: an encoded entity is never decoded twice.
		expect(decodeEntities("A &amp;quot;B&amp;quot;")).toBe("A &quot;B&quot;");
		expect(repairMojibake("Piazza della LibertÃ , 5")).toBe("Piazza della Libertà, 5");
		expect(repairMojibake("Viale CarrÃ¹, 20")).toBe("Viale Carrù, 20");
		expect(repairMojibake("Farmacia Santâ€™Antonio")).toBe("Farmacia Sant’Antonio");
		expect(repairMojibake("Farmacia Santâ¿Antonio")).toBe("Farmacia Sant'Antonio");
		expect(repairMojibake("Â¿Farmacia Valgrigna")).toBe("Farmacia Valgrigna");
		expect(repairMojibake("Via San Prospero Â¿ Ing. Broletto")).toBe(
			"Via San Prospero – Ing. Broletto",
		);
		expect(repairMojibake("Farmacia Città")).toBe("Farmacia Città");
		const mixed = Buffer.concat([
			Buffer.from("a;TORTOLÌ\n", "utf8"),
			Buffer.from("b;CITTÀ\r\n", "latin1"),
		]);
		expect(decodeLines(mixed)).toBe("a;TORTOLÌ\nb;CITTÀ\r\n");
	});

	it("reads dates and points", () => {
		expect(isoDateIt("01/07/2023")).toBe("2023-07-01");
		expect(isoDateIt("-")).toBeNull();
		expect(italianPoint("45,0652154357378", "7,68671719343681")).toEqual({
			latitude: 45.0652154357378,
			longitude: 7.68671719343681,
		});
		expect(italianPoint("-", "-")).toBeNull();
		expect(italianPoint("48,85", "2,35")).toBeNull();
	});
});

describe("the pharmacies' list", () => {
	const result = parseFarmacie(farmacieCsv(), OPTIONS);
	const row = (id: string) => result.rows.find((place) => place.nationalId === id);

	it("keeps the pharmacies open on the day, one line each", () => {
		expect(result.rows).toHaveLength(openShops(IT_PLACES.pharmacies).length);
		expect(result.quarantined).toEqual([]);
		expect(result.skipped).toMatchObject({ closed: expect.any(Number), future: 1 });
		expect(row("9000008")).toBeUndefined();
		expect(row("9000009")).toBeUndefined();
		expect(new Set(result.rows.map((place) => place.nationalId)).size).toBe(result.rows.length);
	});

	it("reads the current line, never the VAT number or the coordinates by default", () => {
		expect(row("9000001")).toMatchObject({
			idScheme: "IT-FARM",
			professionCode: "IT_PHARMACY",
			name: "Farmacia Esempio",
			street: "Via dell'Esempio, 1",
			postcode: "00184",
			city: "Roma",
			municipalityCode: "058091",
			provinceAbbreviation: "RM",
			regionCode: "12",
			latitude: null,
			longitude: null,
			qualifications: [],
		});
		expect(JSON.stringify(result.rows)).not.toMatch(/999\d{8}|PRECEDENTE|FITTIZIO MARIO/);
		expect(row("9000003")).toMatchObject({
			hamlet: "Fregene",
			qualifications: [{ source: "tipologia", code: "3", label: "Dispensario farmaceutico" }],
		});
		expect(row("9000004")?.name).toBe("Farmacia Prova");
		expect(row("9000004")?.street).toBe("Via Immaginaria; scala B, 4");
		expect(row("9000005")).toMatchObject({
			name: "Farmacia della Libertà",
			street: "Piazza della Libertà, 5",
		});
		expect(row("9000010")?.name).toBe("Farmacia Città di Prova");
		expect(row("9000012")).toMatchObject({ name: "Stadtapotheke Beispiel", regionCode: "04" });
		expect(result.counters.namesShortened).toBeGreaterThan(30);
	});

	it("keeps the list's coordinates only when asked", () => {
		const withPoints = parseFarmacie(farmacieCsv(), { ...OPTIONS, registerCoordinates: true });
		const first = withPoints.rows.find((place) => place.nationalId === "9000001");
		expect(first?.latitude).toBeCloseTo(41.8986, 4);
		expect(first?.longitude).toBeCloseTo(12.4964, 4);
		expect(withPoints.rows.find((place) => place.nationalId === "9000003")?.latitude).toBeNull();
		expect(result.counters.withPoint).toBe(withPoints.counters.withPoint);
	});

	it("refuses a file that is not the ministry's", () => {
		expect(() => parseItSource("farmacie", "a;b;c\n1;2;3\n", OPTIONS)).toThrow(/no column/);
		expect(() => parseItSource("farmacie", "", OPTIONS)).toThrow();
	});
});

describe("the parapharmacies' list", () => {
	it("keeps the open shops under their names", () => {
		const result = parseParafarmacie(parafarmacieCsv(), OPTIONS);
		expect(result.rows).toHaveLength(openShops(IT_PLACES.parapharmacies).length);
		expect(result.rows.find((place) => place.nationalId === "900001")).toMatchObject({
			idScheme: "IT-PFARM",
			professionCode: "IT_PARAPHARMACY",
			name: "Parafarmacia Esempio",
		});
		expect(result.rows.find((place) => place.nationalId === "900003")).toBeUndefined();
		expect(JSON.stringify(result.rows)).not.toMatch(/999\d{8}/);
	});
});

describe("the hospital bed counts", () => {
	const result = parsePostiLetto(postiLettoCsv(), OPTIONS);
	const row = (id: string) => result.rows.find((place) => place.nationalId === id);

	it("reads one place per facility, with its type and its areas of care", () => {
		expect(result.year).toBe(2023);
		expect(result.rows).toHaveLength(IT_HOSPITALS.length);
		expect(row("990001")).toMatchObject({
			idScheme: "IT-HSP",
			professionCode: "IT_HOSPITAL",
			name: "Ospedale Esempio",
			street: "Via dell'Ospedale Esempio 1",
			city: "Roma",
			postcode: null,
			qualifications: [
				{ source: "tipo-struttura", code: "1", label: "Ospedale a gestione diretta" },
				{ source: "disciplina", code: "ACUTI", label: "Acuti (250 posti letto)" },
				{ source: "disciplina", code: "RIABILITAZIONE", label: "Riabilitazione (20 posti letto)" },
			],
		});
		expect(row("990003")).toMatchObject({
			professionCode: "IT_CLINIC",
			name: "Casa di Cura Villa Campione",
		});
		expect(row("990003")?.qualifications.at(-1)?.label).toBe("Lungodegenza (1 posto letto)");
		expect(row("990004")?.name).toBe("Casa di Cura “Modello”");
		expect(row("990005")?.name).toBe("Università di Esempio Policlinico");
		expect(row("990006")?.name).toBe("Casa di Cura Sant'Esempio");
	});
});

describe("ISTAT's boundaries", () => {
	const sources = parseIstatBoundaries(istatZip());

	it("read the regions, provinces and municipalities, named in Italian", () => {
		expect(sources.regions).toHaveLength(20);
		expect(sources.regions.find((region) => region.code === "04")?.name).toBe(
			"Trentino-Alto Adige",
		);
		expect(sources.provinces.map((province) => province.code)).toContain("258");
		const bolzano = sources.municipalities.find((m) => m.code === "021008");
		expect(bolzano).toMatchObject({ name: "Bolzano", provinceCode: "021", regionCode: "04" });
		expect(bolzano?.point?.x).toBeCloseTo(680259, 0);
		expect(italianName("Doberdò del Lago/Doberdob")).toBe("Doberdò del Lago");
	});

	it("give a province named like its region its capital's name, and keep slugs", () => {
		const points = new Map(
			sources.municipalities.map((m) => [m.code, { longitude: 12, latitude: 42 }]),
		);
		const rows = buildItPlaceRows(sources, points, []);
		const aosta = rows.find((row) => row.kind === "department" && row.code === "007");
		expect(aosta).toMatchObject({ name: "Aosta", slug: "aosta", region_code: "02" });
		expect(rows.find((row) => row.kind === "region" && row.code === "02")?.slug).toBe(
			"valle-d-aosta",
		);
		expect(rows.find((row) => row.kind === "commune" && row.code === "058091")).toMatchObject({
			slug: "roma",
			department_code: "258",
			region_code: "12",
			parent_kind: "department",
			parent_code: "258",
		});
		const again = buildItPlaceRows(
			sources,
			points,
			rows.map((row) => ({
				kind: row.kind,
				code: row.code,
				name: row.code === "058091" ? "Roma Capitale" : row.name,
				slug: row.slug,
				departmentCode: row.department_code,
			})),
		);
		// A renamed place gets a new slug and keeps the old one as an alias.
		expect(again.find((row) => row.code === "058091")?.previous_slug).toBe("roma");
		expect(again.find((row) => row.code === "015146")?.slug).toBe("milano");
	});

	it("find a point inside a municipality whose centroid is outside it", () => {
		// A "C" open to the east: its centroid falls in the gap.
		const ring = [
			{ x: 0, y: 0 },
			{ x: 0, y: 30 },
			{ x: 30, y: 30 },
			{ x: 30, y: 20 },
			{ x: 10, y: 20 },
			{ x: 10, y: 10 },
			{ x: 30, y: 10 },
			{ x: 30, y: 0 },
			{ x: 0, y: 0 },
		];
		const point = interiorPoint([ring]);
		expect(point?.x).toBeLessThan(10);
		expect(interiorPoint([])).toBeNull();
	});

	it("refuse an archive without the layers", () => {
		expect(() => parseIstatBoundaries(Buffer.from("not a zip"))).toThrow();
	});
});

describe("the portal", () => {
	const page = {
		result: {
			data: {
				allNodeDataset: {
					nodes: [
						{
							field_licenza: "Italian Open Data Licence v2.0",
							relationships: {
								field_listafile: [
									{
										filename: "FRM_FARMA_5_20261126.csv",
										url: "/sites/default/files/opendata/FRM_FARMA_5_20261126.csv",
									},
								],
							},
						},
					],
				},
			},
		},
	};

	it("names today's file of a dataset page and its licence", () => {
		expect(csvUrlOfPage(page, "https://www.dati.salute.gov.it")).toBe(
			"https://www.dati.salute.gov.it/sites/default/files/opendata/FRM_FARMA_5_20261126.csv",
		);
		expect(licenceOfPage(page)).toBe("Italian Open Data Licence v2.0");
		expect(csvUrlOfPage({}, "https://www.dati.salute.gov.it")).toBeNull();
	});

	it("looks for a newer year of the hospital bed counts first", () => {
		expect(datasetSlugs("farmacie")).toEqual(["farmacie"]);
		expect(datasetSlugs("posti-letto", new Date("2026-11-26T00:00:00Z"))).toEqual([
			"posti-letto-struttura-ospedaliera-2025",
			"posti-letto-struttura-ospedaliera-2024",
			"posti-letto-struttura-ospedaliera-2023",
		]);
	});
});

describe("etl:it options", () => {
	it("read the lists, the coordinates switch and the day", () => {
		const { flags } = parseArgs(["etl:it", "--sources=farmacie,posti-letto", "--as-of=2026-11-26"]);
		const options = buildItOptions(flags, { DATABASE_URL: "postgres://localhost/test" });
		expect(options.sources).toEqual(["farmacie", "posti-letto"]);
		expect(options.asOf).toBe("2026-11-26");
		expect(options.registerCoordinates).toBe(false);
		expect(options.urls.farmacie).toBeNull();
		expect(
			buildItOptions(parseArgs(["etl:it", "--register-coordinates"]).flags, {
				DATABASE_URL: "postgres://localhost/test",
			}).registerCoordinates,
		).toBe(true);
		expect(parseItSources(undefined)).toEqual(["farmacie", "parafarmacie", "posti-letto"]);
		expect(() => parseItSources("farmacie,ospedali")).toThrow(/Unknown Italian source/);
		expect(todayInRome(new Date("2026-11-26T23:30:00Z"))).toBe("2026-11-27");
	});
});

describe("the Italian batch", () => {
	it("gives each place one site and one activity, keyed by its list", () => {
		const results = [
			parseFarmacie(farmacieCsv(), OPTIONS),
			parseParafarmacie(parafarmacieCsv(), OPTIONS),
			parsePostiLetto(postiLettoCsv(), OPTIONS),
		];
		const batch = buildItBatch(results);
		const rows = results.reduce((sum, result) => sum + result.rows.length, 0);
		expect(batch.people).toHaveLength(rows);
		expect(batch.sites).toHaveLength(rows);
		expect(batch.activities).toHaveLength(rows);
		expect(batch.people.find((person) => person.national_id === "9000001")).toMatchObject({
			id_scheme: "IT-FARM",
			listing_slug: "farmacie",
			slug: "farmacia-esempio-f9000001",
		});
		expect(batch.sites.find((site) => site.source_key === "9000003")?.address_line).toBe(
			"Via del Campione, 3, Fregene",
		);
		expect(batch.people.find((person) => person.national_id === "990003")?.slug).toBe(
			"casa-di-cura-villa-campione-s990003",
		);
	});
});
