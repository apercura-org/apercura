import { describe, expect, it } from "vitest";
import {
	brandenburgCollection,
	DE_FACILITIES,
	directoryWorkbook,
	municipalitiesWorkbook,
	thuringiaArchive,
} from "../../../fixtures/generate-de";
import { buildDeOptions, deDirectoryUrls, destatisEditionUrl, parseDeSources } from "../../config";
import { checkDeSource } from "../../guards";
import { utmToLonLat } from "../../lib/utm";
import { writeXlsxSheets } from "../../lib/xlsx";
import { buildDeBatch } from "../../merge-de";
import { filesOf } from "../../run-de";
import {
	destatisEdition,
	latestDirectoryLink,
	parseDestatis,
	rowMunicipalityCode,
} from "./destatis";
import {
	clean,
	deSiteKey,
	hospitalSiteName,
	municipalityName,
	siteLabel,
	streetLine,
	withoutLegalForm,
} from "./names";
import { accessibilityOf, parseBrandenburg, parseThuringia, pharmacyName } from "./pharmacies";
import {
	buildDePlaceIndex,
	buildDePlaceRows,
	type DeCommune,
	districtName,
	parseDePlaces,
	placeFacility,
	townNames,
} from "./places";

describe("German names", () => {
	it("drops legal forms and the directory's site labels, nothing else", () => {
		expect(withoutLegalForm("DIAKO Krankenhaus gGmbH")).toBe("DIAKO Krankenhaus");
		expect(withoutLegalForm("Schön Klinik Neustadt SE & Co. KG")).toBe("Schön Klinik Neustadt");
		expect(withoutLegalForm("AMEOS Krankenhausgesellschaft Ostholstein mbH")).toBe(
			"AMEOS Krankenhausgesellschaft Ostholstein",
		);
		expect(withoutLegalForm("Verein für Gesundheit e. V.")).toBe("Verein für Gesundheit");
		expect(withoutLegalForm("GmbH")).toBe("GmbH");
		expect(withoutLegalForm("Klinikum gGmbH Nord")).toBe("Klinikum gGmbH Nord");
		expect(siteLabel("Campus Nord – Stationäre Behandlung")).toBe("Campus Nord");
		expect(siteLabel("Hauptstandort - Stationäre Behandlung")).toBe("");
		expect(siteLabel("Asklepios Klinik Wandsbek  Stationäre Behandlung")).toBe(
			"Asklepios Klinik Wandsbek",
		);
		expect(siteLabel("Tagesklinik – Teilstationäre Behandlung")).toBe("Tagesklinik");
	});

	it("names a hospital's site only when it has several and the site adds something", () => {
		expect(
			hospitalSiteName(
				"DIAKO Krankenhaus gGmbH",
				"DIAKO Krankenhaus gGmbH - Stationäre Behandlung",
				1,
			),
		).toBe("DIAKO Krankenhaus");
		expect(
			hospitalSiteName(
				"Universitätsklinikum Beispielstadt",
				"Campus Nord – Stationäre Behandlung",
				2,
			),
		).toBe("Universitätsklinikum Beispielstadt – Campus Nord");
		expect(hospitalSiteName("Klinik am See", "Hauptstandort", 3)).toBe("Klinik am See");
		expect(
			hospitalSiteName(
				"Asklepios Klinik Nord",
				"Asklepios Klinik Nord – Heidberg – Stationäre Behandlung",
				4,
			),
		).toBe("Asklepios Klinik Nord – Heidberg");
		expect(hospitalSiteName("Klinik am See", "Klinik am See Privatstation", 1)).toBe(
			"Klinik am See Privatstation",
		);
		expect(hospitalSiteName("Klinik am See", "Standort Süd", 1)).toBe("Klinik am See");
	});

	it("writes municipalities, streets and keys", () => {
		expect(municipalityName("Flensburg, Stadt")).toBe("Flensburg");
		expect(municipalityName("Garching b.München, St")).toBe("Garching b.München");
		expect(municipalityName("Lauenburg/ Elbe, Stadt")).toBe("Lauenburg/Elbe");
		expect(streetLine("Knuthstraße", "1")).toBe("Knuthstraße 1");
		expect(streetLine("Am Kurpark", "")).toBe("Am Kurpark");
		expect(streetLine("", "1")).toBeNull();
		expect(clean("  a \\n b ".replace("\\n", "\n"))).toBe("a b");
		const key = deSiteKey(["khv", "01001000", "Knuthstraße", "1", "DIAKO Krankenhaus", "Haus A"]);
		expect(key).toMatch(/^[0-9a-f]{10}$/);
		// Case, dashes, spaces and an abbreviated street do not change a key; a renaming does.
		expect(deSiteKey(["khv", "01001000", "Knuthstr.", "1", "DIAKO-Krankenhaus", "Haus  A"])).toBe(
			key,
		);
		expect(deSiteKey(["khv", "01001000", "Knuthstraße", "1", "DIAKO Klinikum", "Haus A"])).not.toBe(
			key,
		);
	});
});

describe("the directory of hospitals", () => {
	const workbook = directoryWorkbook(DE_FACILITIES);

	it("finds its edition by the names of its worksheets", () => {
		expect(destatisEdition(workbook)).toMatchObject({
			year: 2024,
			sheets: { khv: " KHV_2024", rhv: "RHV_2024", khvDescription: "DSB_KHV_2024" },
		});
		expect(() => destatisEdition(writeXlsxSheets([{ name: "Hoja1", rows: [["x"]] }]))).toThrow(
			/no KHV_ or RHV_ worksheet/,
		);
	});

	it("reads Berlin's and Hamburg's districts as their city", () => {
		expect(rowMunicipalityCode("11", "006", "006")).toBe("11000000");
		expect(rowMunicipalityCode("02", "402", "403")).toBe("02000000");
		expect(rowMunicipalityCode("9", "162", "000")).toBe("09162000");
		expect(rowMunicipalityCode("17", "001", "000")).toBeNull();
		expect(rowMunicipalityCode("09", "16", "000")).toBeNull();
	});

	it("reads hospital sites, their kind, departments and emergency care", async () => {
		const result = await parseDestatis("khv", workbook);
		expect(result).toMatchObject({ source: "khv", edition: 2024, lines: 222 });
		expect(result.quarantined.map((line) => line.reason).sort()).toEqual([
			"invalid Land",
			"no name",
		]);
		// Quarantined samples never carry a name.
		expect(result.quarantined.every((line) => !/Klinik/.test(line.sample))).toBe(true);
		const north = result.rows.find((row) => row.name.endsWith("Campus Nord"));
		expect(north).toMatchObject({
			professionCode: "DE_HOSPITAL",
			municipalityCode: "11000000",
			stateCode: "11",
			street: "Musterallee 1",
			postcode: "10117",
			city: "Berlin",
			phone: "+4930999900",
			point: null,
		});
		expect(
			north?.qualifications.filter((q) => q.source === "fachabteilung").map((q) => q.code),
		).toEqual(["0100", "1000", "1500", "2400", "2800", "3600"]);
		expect(north?.qualifications).toContainEqual({
			source: "notfallmodul",
			code: "HERZ",
			label: "Durchblutungsstörungen am Herzen",
		});
		const psychiatric = result.rows.filter(
			(row) => row.professionCode === "DE_PSYCHIATRIC_HOSPITAL",
		);
		expect(psychiatric.length).toBe(43);
		expect(result.rows.some((row) => /example|Trägergesellschaft/.test(JSON.stringify(row)))).toBe(
			false,
		);
	});

	it("reads clinics and drops a number four of them share", async () => {
		const result = await parseDestatis("rhv", workbook);
		expect(result.rows).toHaveLength(105);
		expect(result.counters.sharedPhones).toBe(4);
		const fiktivia = result.rows.find((row) => row.name === "Rehaklinik Fiktivia");
		expect(fiktivia?.qualifications).toEqual([
			{ source: "fachabteilung", code: "0300", label: "Kardiologie" },
			{ source: "fachabteilung", code: "2300", label: "Orthopädie" },
			{ source: "traeger", code: "PRIVATE", label: "Privater Träger" },
			{
				source: "einrichtungstyp",
				code: "6",
				label: "Vorsorge- oder Rehabilitationseinrichtung nach § 111 SGB V/§ 111a SGB V",
			},
		]);
	});

	it("refuses a workbook without a sheet or its department names", async () => {
		const bare = writeXlsxSheets([{ name: "KHV_2025", rows: [["KH_Name"]] }]);
		await expect(parseDestatis("rhv", bare)).rejects.toThrow(/no RHV worksheet/);
		await expect(parseDestatis("khv", bare)).rejects.toThrow(/department names/);
	});

	it("finds the newest edition a page links", () => {
		const page = `<a href="/sites/default/files/2025-06/krankenhausverzeichnis_23.xlsx">2023</a>
			<a href="/sites/default/files/2026-06/krankenhausverzeichnis_24.xlsx">2024</a>
			<a href="https://www.destatis.de/x/krankenhausverzeichnis-3500100227005.xlsx?__blob=publicationFile&amp;v=2">2022</a>`;
		expect(
			latestDirectoryLink(
				page,
				"https://www.statistikportal.de/de/veroeffentlichungen/krankenhausverzeichnis",
			),
		).toBe(
			"https://www.statistikportal.de/sites/default/files/2026-06/krankenhausverzeichnis_24.xlsx",
		);
		expect(latestDirectoryLink("<p>nothing</p>", "https://example.test/")).toBeNull();
	});
});

describe("the pharmacy lists", () => {
	it("reads Thuringia's shapefile, its points from UTM 32N", () => {
		const result = parseThuringia(thuringiaArchive(DE_FACILITIES.thuringia));
		expect(result.rows).toHaveLength(63);
		const erfurt = result.rows.find((row) => row.nationalId === "9001");
		expect(erfurt).toMatchObject({
			name: "Beispiel-Apotheke",
			municipalityCode: "16051000",
			stateCode: "16",
			phone: null,
		});
		expect(erfurt?.point?.longitude).toBeCloseTo(11.0301, 5);
		expect(erfurt?.point?.latitude).toBeCloseTo(50.9781, 5);
		expect(result.rows.find((row) => row.nationalId === "9002")?.name).toBe(
			"Muster-Apotheke am Markt",
		);
		expect(() => parseThuringia(Buffer.from("not a zip"))).toThrow();
	});

	it("reads Brandenburg's GeoJSON and leaves the hospitals' pharmacies out", () => {
		const data = Buffer.from(JSON.stringify(brandenburgCollection(DE_FACILITIES.brandenburg)));
		const result = parseBrandenburg(data);
		expect(result.rows).toHaveLength(62);
		expect(result.skipped).toEqual({ "hospital pharmacy": 1 });
		expect(result.rows[0]).toMatchObject({
			name: "Fiktiv-Apotheke am Park",
			stateCode: "16".replace("16", "12"),
			phone: "+493319999901",
			municipalityCode: null,
		});
		expect(result.rows[0]?.nationalId).toMatch(/^[0-9a-f]{10}$/);
		expect(() => parseBrandenburg(Buffer.from("{}"))).toThrow(/feature collection/);
	});

	it("completes a name with a note of place, and reads step-free access", () => {
		expect(pharmacyName("Rosen-Apotheke", "am Markt")).toBe("Rosen-Apotheke am Markt");
		expect(pharmacyName("Rosen-Apotheke am Markt", "am Markt")).toBe("Rosen-Apotheke am Markt");
		expect(pharmacyName("Rosen-Apotheke", "Center-Apotheke (OHG)")).toBe("Rosen-Apotheke");
		expect(accessibilityOf("barrierefrei")).toEqual({
			source: "barrierefreiheit",
			code: "YES",
			label: "Barrierefrei",
		});
		expect(accessibilityOf("barrierefrei mit Einschränkung*Klingel und *Rampe")?.label).toBe(
			"Barrierefrei mit Einschränkung (Klingel, Rampe)",
		);
		expect(accessibilityOf("")).toBeNull();
	});

	it("converts UTM to longitude and latitude", () => {
		const { longitude, latitude } = utmToLonLat(500_000, 0, 32);
		expect(longitude).toBeCloseTo(9, 9);
		expect(latitude).toBeCloseTo(0, 9);
		const zone33 = utmToLonLat(500_000, 5_800_000, 33);
		expect(zone33.longitude).toBeCloseTo(15, 9);
		expect(zone33.latitude).toBeGreaterThan(52.3);
		expect(zone33.latitude).toBeLessThan(52.4);
	});
});

describe("the German places", () => {
	it("reads Länder, Kreise and Gemeinden, without the uninhabited areas", async () => {
		const sources = await parseDePlaces(municipalitiesWorkbook());
		expect(sources.asOf).toBe("31.12.2025");
		expect(sources.states).toHaveLength(9);
		expect(sources.districts.find((d) => d.code === "09184")?.name).toBe("Landkreis München");
		expect(sources.districts.find((d) => d.code === "09162")).toMatchObject({
			name: "München",
			urban: true,
		});
		expect(sources.municipalities).toHaveLength(13);
		expect(sources.municipalities.find((m) => m.code === "11000000")).toMatchObject({
			name: "Berlin",
			district: "11000",
			state: "11",
			longitude: 13.405538,
			latitude: 52.51767,
			postcode: "10178",
		});
		await expect(
			parseDePlaces(writeXlsxSheets([{ name: "Gemeinden", rows: [["x"]] }])),
		).rejects.toThrow(/municipalities' directory/);
	});

	it("names Kreise the way people say them", () => {
		expect(districtName("München, Landeshauptstadt", "41")).toBe("München");
		expect(districtName("München", "44")).toBe("Landkreis München");
		expect(districtName("Dithmarschen", "43")).toBe("Kreis Dithmarschen");
		expect(districtName("Rhein-Sieg-Kreis", "43")).toBe("Rhein-Sieg-Kreis");
		expect(districtName("Region Hannover", "44")).toBe("Region Hannover");
		expect(districtName("Regionalverband Saarbrücken", "45")).toBe("Regionalverband Saarbrücken");
		expect(districtName("Stuttgart, Stadtkreis", "42")).toBe("Stuttgart");
	});

	it("gives Kreise and Länder one slug space and keeps slugs once given", async () => {
		const sources = await parseDePlaces(municipalitiesWorkbook());
		const rows = buildDePlaceRows(sources, []);
		const slug = (kind: string, code: string) =>
			rows.find((r) => r.kind === kind && r.code === code)?.slug;
		expect(slug("department", "11000")).toBe("berlin");
		expect(slug("region", "11")).toBe("berlin-11");
		expect(slug("region", "09")).toBe("bayern");
		expect(slug("department", "09184")).toBe("landkreis-muenchen");
		expect(slug("commune", "09184119")).toBe("garching-b-muenchen");
		const again = buildDePlaceRows(
			sources,
			rows.map((row) => ({
				kind: row.kind,
				code: row.code,
				name: row.name,
				slug: row.slug,
				departmentCode: row.department_code,
			})),
		);
		expect(again.map((row) => row.slug)).toEqual(rows.map((row) => row.slug));
		expect(again.every((row) => row.previous_slug === null)).toBe(true);
	});

	it("places a facility by key, town, point, then Kreis", () => {
		const commune = (
			id: number,
			code: string,
			name: string,
			lon: number,
			lat: number,
		): DeCommune => ({
			id,
			code,
			name,
			districtCode: code.slice(0, 5),
			stateCode: code.slice(0, 2),
			longitude: lon,
			latitude: lat,
		});
		const index = buildDePlaceIndex(
			[
				commune(1, "06414000", "Wiesbaden", 8.24, 50.08),
				commune(2, "12063036", "Brieselang", 13.0, 52.58),
				commune(3, "12069999", "Neuendorf", 13.5, 52.2),
				commune(4, "12070999", "Neuendorf", 12.2, 53.0),
				commune(5, "12052000", "Cottbus/Chóśebuz", 14.33, 51.76),
			],
			[["12064", 100]],
		);
		const place = (
			municipalityCode: string | null,
			city: string,
			stateCode: string,
			point: [number, number] | null = null,
		) =>
			placeFacility(
				{
					municipalityCode,
					city,
					stateCode,
					point: point ? { longitude: point[0], latitude: point[1] } : null,
				},
				index,
			);
		expect(place("06414000", "x", "06")).toEqual({ placeId: 1, placedBy: "code" });
		expect(place("07414000", "Wiesbaden", "07")).toEqual({ placeId: 1, placedBy: "name" });
		expect(place(null, "Brieselang (OT Zeestow)", "12")).toEqual({ placeId: 2, placedBy: "name" });
		expect(place(null, "Cottbus", "12")).toEqual({ placeId: 5, placedBy: "name" });
		expect(place(null, "Neuendorf", "12", [12.21, 53.01])).toEqual({
			placeId: 4,
			placedBy: "name",
		});
		expect(place(null, "Neuendorf", "12")).toEqual({ placeId: null, placedBy: null });
		expect(place(null, "Zeestow", "12", [13.01, 52.59])).toEqual({
			placeId: 2,
			placedBy: "nearest",
		});
		expect(place(null, "Irgendwo", "12", [10, 50])).toEqual({ placeId: null, placedBy: null });
		expect(place("12064123", "Irgendwo", "12")).toEqual({ placeId: 100, placedBy: "district" });
		expect(townNames("Oberhausen, Rheinland")).toContain("oberhausen");
	});
});

describe("the German import's configuration and guards", () => {
	it("tries the newest editions of the directory, then the mirror", () => {
		const now = new Date("2026-11-26T00:00:00Z");
		expect(deDirectoryUrls({}, now)).toEqual([
			destatisEditionUrl(2025),
			destatisEditionUrl(2024),
			"https://www.statistikportal.de/sites/default/files/2026-06/krankenhausverzeichnis_24.xlsx",
		]);
		expect(destatisEditionUrl(2024)).toMatch(/krankenhausverzeichnis-3500100247005\.xlsx/);
		expect(deDirectoryUrls({ ETL_DE_KHV_URL: "https://example.test/khv.xlsx" }, now)).toEqual([
			"https://example.test/khv.xlsx",
		]);
		const options = buildDeOptions(
			new Map([["offline", true]]),
			{ DATABASE_URL: "postgres://x" },
			now,
		);
		expect(options.sources).toEqual(["khv", "rhv", "apo-th", "apo-bb"]);
		expect(options.appUrl).toBeNull();
		expect(options.khvIndexUrl).toMatch(/statistikportal/);
		expect(parseDeSources("khv, apo-th")).toEqual(["khv", "apo-th"]);
		expect(() => parseDeSources("apo-sl")).toThrow(/Unknown German source/);
		expect(filesOf(["khv", "rhv", "apo-bb"])).toEqual(["destatis", "apo-bb"]);
	});

	it("never lets an older edition replace a newer one, and floors catch an empty file", () => {
		const stats = {
			lines: 300,
			rows: 300,
			people: 300,
			quarantined: 0,
			bytes: 1_000,
			edition: 2023,
		};
		const checks = checkDeSource("khv", stats, { ...stats, edition: 2024 });
		expect(checks.find((check) => check.name === "khv.edition")).toMatchObject({
			ok: false,
			approvable: false,
		});
		const empty = checkDeSource(
			"apo-th",
			{ ...stats, lines: 3, rows: 3, people: 3, edition: null },
			null,
		);
		expect(empty.find((check) => check.name === "apo-th.lines")?.ok).toBe(false);
		expect(
			checkDeSource("khv", { ...stats, edition: 2025 }, { ...stats, edition: 2024 }).every(
				(c) => c.ok,
			),
		).toBe(true);
	});

	it("groups rows into facilities, sites, activities and qualifications", async () => {
		const result = await parseDestatis("khv", directoryWorkbook(DE_FACILITIES));
		const batch = buildDeBatch([result]);
		expect(batch.people).toHaveLength(220);
		expect(batch.people[0]).toMatchObject({
			id_scheme: "DE-KHV",
			listing_slug: expect.any(String),
		});
		expect(batch.people.every((person) => person.slug.endsWith(`-k${person.national_id}`))).toBe(
			true,
		);
		expect(batch.sites.every((site) => site.source === "de-destatis-khv")).toBe(true);
	});
});
