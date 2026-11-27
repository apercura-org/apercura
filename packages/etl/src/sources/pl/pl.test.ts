import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PL_FACILITIES, prgArchive, rpwdlArchive, tercCsv } from "../../../fixtures/generate-pl";
import { buildPlBatch } from "../../merge-pl";
import {
	isNaturalPersonForm,
	isPublicForm,
	NameVocabulary,
	personNameWords,
	withoutPersonName,
} from "./names";
import {
	buildPlPlaceRows,
	combinePlPlaces,
	gminaNames,
	gminaPoint,
	parsePrgGminas,
	parseTerc,
	powiatName,
	tercCsv as tercOf,
} from "./places";
import { extractRpwdl, gminaOfTeryt, parseRpwdl, producedAtOf, rpwdlStreet } from "./rpwdl";

const vocabulary = () => {
	const words = new NameVocabulary();
	for (const name of ["Centrum Przykład Sp. z o.o.", "Szpital Wzorcowy", "Szpital Próbny"]) {
		words.add(name);
	}
	for (let index = 0; index < 12; index++) words.add(`Anna Przykładowa${index}`, true);
	return words;
};

const parsed = async (set = PL_FACILITIES, asOf = "2026-11-27") => {
	const dir = mkdtempSync(join(tmpdir(), "apercura-pl-test-"));
	writeFileSync(join(dir, "rpwdl.zip"), rpwdlArchive(set));
	return parseRpwdl(await extractRpwdl(join(dir, "rpwdl.zip"), join(dir, "csv")), asOf);
};

describe("names of natural persons in RPWDL", () => {
	it("tells natural persons' and public forms", () => {
		expect(isNaturalPersonForm("0700")).toBe(true);
		expect(isNaturalPersonForm("0800")).toBe(true);
		expect(isNaturalPersonForm("1300")).toBe(false);
		expect(isNaturalPersonForm(null)).toBe(false);
		expect(isPublicForm("0100")).toBe(true);
		expect(isPublicForm("0202")).toBe(true);
		expect(isPublicForm("1310")).toBe(true);
		expect(isPublicForm("1320")).toBe(false);
		expect(isPublicForm("1300")).toBe(false);
	});

	it("reads a person's name around a first name, and a name alone", () => {
		const words = vocabulary();
		expect(words.isFirstName("anna")).toBe(true);
		expect(words.isBusinessWord("stomatologia")).toBe(true);
		expect(words.isBusinessWord("szpital")).toBe(true);
		expect(personNameWords("Gabinet Stomatologiczny Anna Nowak", words)).toEqual(["anna", "nowak"]);
		expect(personNameWords("NOWAK ANNA", words)).toEqual(["anna", "nowak"]);
		expect(personNameWords("Przykładent „Ortosfera” Anna Nowak", words)).toEqual(["anna", "nowak"]);
		expect(personNameWords("Simon Example", words)).toEqual(["simon", "example"]);
		expect(personNameWords("S.C. M. Nowak, J. Kowalski", words)).toEqual(["nowak", "kowalski"]);
		expect(personNameWords("Anna Nowak - Kowalska", words)).toEqual(["anna", "nowak-kowalska"]);
		expect(personNameWords("CENTRUM PRZYKŁAD SPÓŁKA Z O.O.", words)).toEqual([]);
	});

	it("takes a person's name out of an establishment's name, with its titles", () => {
		expect(
			withoutPersonName("Gabinet Stomatologiczny lek. stom. Anna Nowak", ["anna", "nowak"]),
		).toBe("Gabinet Stomatologiczny");
		expect(withoutPersonName("NZOZ „PRZYKŁAD” dr n. med. ANNA NOWAK", ["anna", "nowak"])).toBe(
			"NZOZ „PRZYKŁAD”",
		);
		expect(withoutPersonName("Przychodnia A. Nowak i Partnerzy", ["nowak"])).toBe(
			"Przychodnia i Partnerzy",
		);
		expect(withoutPersonName("Nowak-Med Przychodnia", ["nowak"])).toBe("Nowak-Med Przychodnia");
		expect(withoutPersonName("Przychodnia Nowak - Kowalska", ["nowak-kowalska"])).toBe(
			"Przychodnia",
		);
		expect(withoutPersonName("Przychodnia Wzorzec", ["anna"])).toBe("Przychodnia Wzorzec");
	});
});

describe("the RPWDL export", () => {
	it("reads codes, streets and the report's date", () => {
		expect(gminaOfTeryt("1261011")).toBe("1261011");
		expect(gminaOfTeryt("1206114")).toBe("1206113");
		expect(gminaOfTeryt("1206115")).toBe("1206113");
		expect(gminaOfTeryt("1465028")).toBe("1465011");
		expect(gminaOfTeryt("1261029")).toBe("1261011");
		expect(gminaOfTeryt("1261")).toBeNull();
		expect(gminaOfTeryt("126101L")).toBeNull();
		expect(gminaOfTeryt(null)).toBeNull();
		expect(rpwdlStreet("Zdrojowa", "39", "1", "Polanica-Zdrój")).toBe("Zdrojowa 39/1");
		expect(rpwdlStreet(null, "12", null, "Osiek")).toBe("Osiek 12");
		expect(rpwdlStreet(null, null, null, "Osiek")).toBeNull();
		expect(
			producedAtOf(
				"Raport wygenerowany na podstawie danych w systemie RPWDL z dnia 2026-11-27 00:00:00",
			),
		).toBe("2026-11-27");
		expect(producedAtOf("")).toBeNull();
	});

	it("keeps active establishments of active entities, classified, minimised", async () => {
		const result = await parsed();
		expect(result.producedAt).toBe("2026-11-27");
		expect(result.quarantined).toEqual([]);
		expect(result.skipped).toEqual({
			"establishment closed": 1,
			"entity struck off or closed": 1,
			"school nurses only": 1,
		});
		const row = (id: number) => result.rows.find((item) => item.nationalId === String(id));
		expect(row(900001)).toMatchObject({
			professionCode: "PL_HOSPITAL",
			activityKind: "1",
			beds: 50,
			ownership: "public",
			operator: "SZPITAL PRZYKŁADOWY SAMODZIELNY PUBLICZNY ZAKŁAD OPIEKI ZDROWOTNEJ",
		});
		expect(row(900001)?.sites[0]).toMatchObject({ gminaCode: "1465011", phone: "+48221234567" });
		expect(row(900001)?.cells.map((cell) => cell.code)).toEqual(["4000", "4500", "4902"]);
		// A sole trader: no operator, her name taken out, the place's own number kept.
		expect(row(900002)).toMatchObject({
			professionCode: "PL_DENTAL",
			name: "Gabinet Stomatologiczny",
			operator: null,
			ownership: "private",
			naturalPerson: true,
		});
		expect(row(900003)).toMatchObject({
			professionCode: "PL_SPECIALIST",
			specialtyCode: "kardiologia",
		});
		expect(row(900003)?.sites[0]?.gminaCode).toBe("1206113");
		expect(row(900004)?.sites.map((site) => [site.gminaCode, site.name])).toEqual([
			["0201022", null],
			["0201011", "Punkt Wzorzec w Bolesławcu"],
		]);
		expect(row(900008)).toMatchObject({ professionCode: "PL_SPECIALIST", specialtyCode: null });
		// A name that was the person's only: the address names the page.
		expect(row(900009)?.name).toBe("Próbkowa 4, Czernichów");
		expect(row(900010)?.professionCode).toBe("PL_HOSPICE");
		// A laboratory's shared number is no collection point's own.
		expect(row(900011)?.sites[0]?.phone).toBeNull();
		expect(result.counters).toMatchObject({ namesStripped: 2, namedByAddress: 1, sharedPhones: 4 });
		// Nothing of the entities' numbers, seats, e-mails or websites is in a row.
		const text = JSON.stringify(result.rows);
		expect(text).not.toMatch(/example\.invalid|Siedzibowa|Anna Przykładowa|Jan Próbkowy|"99\d{6}/);
		const batch = buildPlBatch(result);
		expect(batch.people).toHaveLength(result.rows.length);
		expect(batch.people.find((person) => person.national_id === "900003")).toMatchObject({
			listing_slug: "poradnie-kardiologiczne",
			slug: "poradnia-kardiologiczna-wzorzec-900003",
		});
		expect(
			batch.qualifications
				.filter((fact) => fact.national_id === "900001")
				.map((fact) => fact.source),
		).toEqual(["komorka", "komorka", "komorka", "rodzaj", "lozka", "forma", "podmiot"]);
	});

	it("reads an establishment as closed from the day its end date says", async () => {
		const result = await parsed(PL_FACILITIES, "2026-01-30");
		expect(result.rows.some((row) => row.nationalId === "900006")).toBe(true);
	});

	it("refuses a file that is not the register's", async () => {
		const dir = mkdtempSync(join(tmpdir(), "apercura-pl-test-"));
		writeFileSync(join(dir, "zaklady.csv"), '"a";"b"\n"1";"2"\n');
		for (const name of ["podmioty.csv", "jednostki.csv", "komorki.csv"]) {
			writeFileSync(join(dir, name), '"a"\n');
		}
		await expect(parseRpwdl(dir, "2026-11-27")).rejects.toThrow(/missing expected column/);
	});
});

describe("Polish places", () => {
	it("reads TERC and the gminas' interior points", () => {
		const terc = parseTerc(tercOf(Buffer.from(tercCsv())));
		expect(terc.asOf).toBe("2026-01-01");
		expect(terc.voivodeships.map((item) => item.name)).toEqual([
			"dolnośląskie",
			"małopolskie",
			"mazowieckie",
		]);
		expect(terc.powiats.find((item) => item.code === "0201")).toMatchObject({
			name: "powiat bolesławiecki",
			urban: false,
		});
		expect(terc.powiats.find((item) => item.code === "1465")).toMatchObject({
			name: "Warszawa",
			urban: true,
		});
		expect(terc.gminas.map((item) => item.code)).toEqual([
			"0201011",
			"0201022",
			"0201032",
			"0262011",
			"1206022",
			"1206113",
			"1261011",
			"1465011",
		]);
		expect(powiatName("krakowski", "powiat")).toBe("powiat krakowski");
		const points = parsePrgGminas(prgArchive());
		expect(points.size).toBe(8);
		// The rural gmina surrounding the town: its point is outside the town's square.
		const rural = points.get("0201022");
		expect(rural).toBeDefined();
		expect(
			Math.abs((rural?.longitude ?? 0) - 15.56) > 0.03 ||
				Math.abs((rural?.latitude ?? 0) - 51.26) > 0.03,
		).toBe(true);
		const sources = combinePlPlaces(terc, points);
		expect(gminaNames(sources.gminas).get("0201022")).toBe("Bolesławiec (gmina wiejska)");
		expect(gminaNames(sources.gminas).get("0201011")).toBe("Bolesławiec");
		const rows = buildPlPlaceRows(sources, []);
		const slug = (kind: string, code: string) =>
			rows.find((item) => item.kind === kind && item.code === code)?.slug;
		expect(slug("region", "12")).toBe("malopolskie");
		expect(rows.find((item) => item.kind === "region" && item.code === "12")?.name).toBe(
			"województwo małopolskie",
		);
		expect(slug("department", "1261")).toBe("krakow");
		expect(slug("department", "0201")).toBe("powiat-boleslawiecki");
		expect(slug("commune", "0201022")).toBe("boleslawiec-gmina-wiejska");
		expect(slug("commune", "1465011")).toBe("warszawa");
	});

	it("finds a point inside a polygon with a hole", () => {
		const outer = [
			{ x: 0, y: 0 },
			{ x: 0, y: 10 },
			{ x: 10, y: 10 },
			{ x: 10, y: 0 },
			{ x: 0, y: 0 },
		];
		const hole = [
			{ x: 3, y: 3 },
			{ x: 7, y: 3 },
			{ x: 7, y: 7 },
			{ x: 3, y: 7 },
			{ x: 3, y: 3 },
		];
		const point = gminaPoint([outer, hole]);
		expect(point).not.toBeNull();
		const inHole = point && point.x > 3 && point.x < 7 && point.y > 3 && point.y < 7;
		expect(inHole).toBe(false);
		expect(gminaPoint([outer])).toEqual({ x: 5, y: 5 });
	});
});
