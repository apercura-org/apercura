import { describe, expect, it } from "vitest";
import {
	ES_ANCHORS,
	ES_CENTRES,
	esSheetRows,
	ignCentres,
	ignUnits,
} from "../../../fixtures/generate-es";
import { writeXlsx } from "../../lib/xlsx";
import { buildEsBatch } from "../../merge-es";
import { esStreet, titleCaseEs } from "./names";
import { buildEsPlaceRows, esPlaceSlug, esPlacesUrl, parseEsPlaces } from "./places";
import { centreCode, esDependencyOf, MAX_PHONE_ROWS, parseRegcess } from "./regcess";

const extract = (listing: "C1" | "C2" | "E") => writeXlsx(esSheetRows(listing), { deflate: true });

describe("the REGCESS extracts", async () => {
	const c1 = await parseRegcess("regcess-c1", extract("C1"));
	const c2 = await parseRegcess("regcess-c2", extract("C2"));
	const e = await parseRegcess("regcess-e", extract("E"));
	const all = [...c1.rows, ...c2.rows, ...e.rows];
	const byId = (id: string) => all.find((row) => row.nationalId === id);
	const inList = (listing: string) => ES_CENTRES.cases.filter((c) => c.listing === listing).length;

	it("imports the centre types patients visit and counts the others", () => {
		expect(c1.lines).toBe(inList("C1") + ES_CENTRES.outOfScope.C1);
		expect(c2.lines).toBe(inList("C2") + ES_CENTRES.outOfScope.C2 + 1);
		expect(e.lines).toBe(inList("E") + ES_CENTRES.outOfScope.E);
		expect(all).toHaveLength(ES_CENTRES.cases.length);
		expect(e.skipped["type E3 (E3 - Opticas)"]).toBe(75);
		expect(Object.values(c2.skipped).reduce((sum, n) => sum + n, 0)).toBe(900);
		expect(c2.quarantined).toEqual([
			{ lineNo: c2.lines + 1, reason: "invalid centre code", sample: "X1" },
		]);
	});

	it("reads a centre as the register publishes it, and nothing else", () => {
		expect(byId(ES_ANCHORS.dental)).toEqual({
			source: "regcess-c2",
			lineNo: 2,
			nationalId: ES_ANCHORS.dental,
			professionCode: "ES_DENTAL",
			typeCode: "C251",
			name: "Clinica Dental Ejemplo Centro",
			units: [{ code: "U.44", label: "Odontología/Estomatología" }],
			specialtyCode: null,
			street: "Calle Alcala, 10",
			postcode: "28014",
			city: "Madrid",
			municipalityCode: "28079",
			provinceCode: "28",
			communityCode: "13",
			phone: "+34910000001",
			dependency: { code: "PRIVATE", label: "Privado" },
		});
		const serialized = JSON.stringify(all);
		// E-mail, fax, web address, regional code, health area, dates: never read.
		for (const leak of ["example.invalid", "919990000", "R-", "AREA FICTICIA", "01/02/2003"]) {
			expect(serialized).not.toContain(leak);
		}
	});

	it("lists practices under their care unit", () => {
		expect(byId(ES_ANCHORS.cardiology)).toMatchObject({
			professionCode: "ES_MEDICAL_PRACTICE",
			specialtyCode: "U.7",
		});
		expect(byId(ES_ANCHORS.psychology)).toMatchObject({
			professionCode: "ES_OTHER_PRACTICE",
			specialtyCode: "U.70",
		});
		expect(byId(ES_ANCHORS.otherProfessional)?.specialtyCode).toBeNull();
		expect(byId(ES_ANCHORS.plainPractice)?.specialtyCode).toBeNull();
		expect(byId(ES_ANCHORS.namedDoctor)).toMatchObject({
			name: "Dra. Ana Ejemplar Ficticia",
			specialtyCode: "U.8",
			street: "Calle Supuesto Muestra, Nº 5",
			// `000000000` stands for no number.
			phone: null,
		});
		expect(byId(ES_ANCHORS.hospital)).toMatchObject({
			professionCode: "ES_HOSPITAL",
			street: "Avenida de la Prueba, s/n",
			phone: "+34910000004",
			dependency: { code: "PUBLIC", label: "Público" },
		});
		expect(byId(ES_ANCHORS.localClinic)?.professionCode).toBe("ES_LOCAL_CLINIC");
		expect(c2.counters.psychologistsByName).toBeGreaterThan(10);
	});

	it("drops a number more than three centres share", () => {
		expect(MAX_PHONE_ROWS).toBe(3);
		expect(c2.counters.sharedPhones).toBe(5);
		expect(all.some((row) => row.phone === "+34902999000")).toBe(false);
	});

	it("refuses a workbook that is not an extract", async () => {
		await expect(
			parseRegcess(
				"regcess-c1",
				writeXlsx([
					["Nombre", "Otro"],
					["A", "B"],
				]),
			),
		).rejects.toThrow(/not a REGCESS extract/);
		await expect(parseRegcess("regcess-c1", Buffer.from("not a zip"))).rejects.toThrow();
	});

	it("reads centre codes and dependencies", () => {
		expect(centreCode("802000515")).toBe("0802000515");
		expect(centreCode(" 1003000254 ")).toBe("1003000254");
		expect(esDependencyOf("Publicos")).toEqual({ code: "PUBLIC", label: "Público" });
		expect(esDependencyOf("Privados")).toEqual({ code: "PRIVATE", label: "Privado" });
		expect(esDependencyOf("")).toBeNull();
	});

	it("groups the rows into centres, sites, activities and qualifications", () => {
		const batch = buildEsBatch([c1, c2, e]);
		expect(batch.people).toHaveLength(ES_CENTRES.cases.length);
		expect(batch.sites).toHaveLength(ES_CENTRES.cases.length);
		const hospital = batch.people.find((person) => person.national_id === ES_ANCHORS.hospital);
		expect(hospital).toMatchObject({
			listing_slug: "hospitales",
			slug: `hospital-general-ejemplo-${ES_ANCHORS.hospital}`,
		});
		expect(batch.sites.find((site) => site.source_key === ES_ANCHORS.pharmacy)?.source).toBe(
			"es-regcess-e",
		);
		const quals = batch.qualifications.filter((q) => q.national_id === ES_ANCHORS.cardiology);
		expect(quals).toEqual([
			{
				national_id: ES_ANCHORS.cardiology,
				source: "oferta",
				code: "U.13",
				label: "Medicina interna",
			},
			{ national_id: ES_ANCHORS.cardiology, source: "oferta", code: "U.7", label: "Cardiología" },
			{
				national_id: ES_ANCHORS.cardiology,
				source: "oferta",
				code: "U.84",
				label: "Depósito de medicamentos",
			},
			{
				national_id: ES_ANCHORS.cardiology,
				source: "dependencia",
				code: "PRIVATE",
				label: "Privado",
			},
		]);
	});
});

describe("Spanish names and streets", () => {
	it("cases the register's capitals the Spanish way, without adding accents", () => {
		expect(titleCaseEs("CENTRO DE SALUD DE ALBATERA")).toBe("Centro de Salud de Albatera");
		expect(titleCaseEs("HOSPITAL UNIVERSITARIO SAN JUAN DE ALICANTE")).toBe(
			"Hospital Universitario San Juan de Alicante",
		);
		expect(titleCaseEs("CENTRO BRANEMARK DE OSEOINTEGRACION, S.L.")).toBe(
			"Centro Branemark de Oseointegracion, S.L.",
		);
		expect(titleCaseEs("A.O.R.E.  CUALTIS S.L.U. ALBACETE")).toBe(
			"A.O.R.E. Cualtis S.L.U. Albacete",
		);
		expect(titleCaseEs("DRA. ANA DE LEON")).toBe("Dra. Ana de Leon");
		expect(titleCaseEs("CONSULTA PROFESIONAL DE GUERRERO RICA, CARLOS")).toBe(
			"Consulta Profesional de Guerrero Rica, Carlos",
		);
		expect(titleCaseEs("CENTRE DE SALUT L'HOSPITALET")).toBe("Centre de Salut l'Hospitalet");
		expect(titleCaseEs("L'ALFAS DEL PI")).toBe("L'Alfas del Pi");
		expect(titleCaseEs("PAMPLONA/IRUÑA SALUD-NORTE")).toBe("Pamplona/Iruña Salud-Norte");
		expect(titleCaseEs("UNIDAD II DEL SERMAS")).toBe("Unidad II del SERMAS");
		expect(titleCaseEs("Clínica Universidad de Navarra")).toBe("Clínica Universidad de Navarra");
		expect(titleCaseEs("  ")).toBe("");
	});

	it("writes a street with its type and number", () => {
		expect(esStreet("CALLE", "ALCALA", "10")).toBe("Calle Alcala, 10");
		expect(esStreet("AVDA", "DE LA PRUEBA", "S/N")).toBe("Avenida de la Prueba, s/n");
		expect(esStreet("CTRA", "C.NAL. 332, ALICANTE-VALENCIA", "S/N")).toBe(
			"Carretera C.nal. 332, Alicante-Valencia, s/n",
		);
		expect(esStreet("CALLE", "CALLE MAYOR", "3 BAJO")).toBe("Calle Mayor, 3 Bajo");
		expect(esStreet("XYZ", "MAYOR", "")).toBe("Mayor");
		expect(esStreet("PLAZA", "MAYOR", "NÃ?Âº 5")).toBe("Plaza Mayor, Nº 5");
		expect(esStreet("CALLE", "", "1")).toBeNull();
	});
});

describe("the IGN's places", () => {
	const sources = parseEsPlaces(ignUnits(), ignCentres());

	it("reads communities, provinces and municipalities by INE code", () => {
		expect(sources.communities.map((c) => c.code)).toEqual(["01", "05", "09", "10", "13"]);
		expect(sources.provinces.find((p) => p.code === "46")).toEqual({
			code: "46",
			name: "València/Valencia",
			community: "10",
		});
		expect(sources.municipalities).toHaveLength(11);
		expect(sources.municipalities.find((m) => m.code === "28079")).toMatchObject({
			name: "Madrid",
			province: "28",
			community: "13",
			longitude: -3.691978,
			latitude: 40.419026,
			pointFrom: "capital",
		});
		// No population centre flagged as the capital: the most populous one.
		expect(sources.municipalities.find((m) => m.code === "28065")?.pointFrom).toBe("largest");
		expect(sources.municipalities.find((m) => m.code === "08026")).toMatchObject({
			longitude: null,
			pointFrom: null,
			population: null,
		});
		expect(() => parseEsPlaces({ features: [] }, ignCentres())).toThrow(/not the IGN/);
	});

	it("slugs places, provinces before communities", () => {
		expect(esPlaceSlug("València/Valencia")).toBe("valencia");
		expect(esPlaceSlug("Alacant/Alicante")).toBe("alacant-alicante");
		expect(esPlaceSlug("L'Hospitalet de Llobregat")).toBe("l-hospitalet-de-llobregat");
		const rows = buildEsPlaceRows(
			{
				communities: [{ code: "06", name: "Cantabria" }],
				provinces: [{ code: "39", name: "Cantabria", community: "06" }],
				municipalities: [],
			},
			[],
		);
		expect(rows.map((row) => [row.kind, row.slug])).toEqual([
			["department", "cantabria"],
			["region", "cantabria-06"],
		]);
		const all = buildEsPlaceRows(sources, []);
		expect(all.find((row) => row.kind === "commune" && row.code === "46250")).toMatchObject({
			slug: "valencia",
			department_code: "46",
			region_code: "10",
			parent_kind: "department",
			parent_code: "46",
		});
	});

	it("reads the API's collections without geometry", () => {
		expect(esPlacesUrl("https://api-features.ign.es/", "nuc")).toBe(
			"https://api-features.ign.es/collections/nuc/items?f=json&limit=10000&skipGeometry=true",
		);
	});
});
