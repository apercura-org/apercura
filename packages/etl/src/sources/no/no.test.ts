import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NO_KEYS, writeNoFixtures } from "../../../fixtures/generate-no";
import { buildNoOptions, parseNoSources } from "../../config";
import { checkNoPlaces, checkNoSource } from "../../guards";
import { readAddressIndex } from "./addresses";
import { parseBrreg } from "./brreg";
import { displayName, displayTown, exclusionOf, namedAfterPerson, streetOf } from "./filters";
import { buildNoPlaceRows, parseNoPlaces } from "./places";
import { addressKey, streetKey } from "./text";

const fixtures = () => {
	const dir = mkdtempSync(join(tmpdir(), "apercura-etl-no-unit-"));
	writeNoFixtures(dir);
	return dir;
};

const candidate = (name: string, kind: string, ownerForm: string | null = "AS") => ({
	name,
	kind,
	ownerForm,
	closed: false,
	ownerWindingUp: false,
	hasAddress: true,
});

describe("what the Norwegian import keeps", () => {
	it("keeps places of care and public bodies' units", () => {
		expect(exclusionOf(candidate("EKSEMPEL LEGESENTER AS", "NO_GP"))).toBeNull();
		expect(exclusionOf(candidate("EKSEMPEL TANNLEGESENTER", "NO_DENTAL", "DA"))).toBeNull();
		expect(exclusionOf(candidate("EKSEMPEL ØYEKLINIKK AS", "NO_SPECIALIST"))).toBeNull();
		expect(exclusionOf(candidate("APOTEK 1 EKSEMPEL", "NO_PHARMACY"))).toBeNull();
		// A municipality's or a county's unit needs no care word in its name.
		expect(exclusionOf(candidate("EKSEMPEL KOMMUNE FASTLEGER", "NO_GP", "KOMM"))).toBeNull();
		expect(exclusionOf(candidate("TANNHELSETJENESTEN EKSEMPEL", "NO_DENTAL", "FYLK"))).toBeNull();
		expect(exclusionOf(candidate("EKSEMPEL HF AVD NORD", "NO_HOSPITAL", "SÆR"))).toBeNull();
		expect(exclusionOf(candidate("EKSEMPELHEIMEN", "NO_NURSING_HOME", "ORGL"))).toBeNull();
	});

	it("leaves out people, failing owners, non-care units and unnamed practices", () => {
		expect(exclusionOf(candidate("OLA EKSEMPEL", "NO_GP", "ENK"))).toBe("sole-proprietorship");
		expect(exclusionOf(candidate("EKSEMPEL LEGESENTER", "NO_GP", null))).toBe("owner-unknown");
		expect(
			exclusionOf({ ...candidate("EKSEMPEL SYKEHJEM", "NO_NURSING_HOME"), closed: true }),
		).toBe("closed");
		expect(
			exclusionOf({ ...candidate("EKSEMPEL SYKEHUS", "NO_HOSPITAL"), ownerWindingUp: true }),
		).toBe("winding-up");
		expect(
			exclusionOf({ ...candidate("EKSEMPEL SYKEHUS", "NO_HOSPITAL"), hasAddress: false }),
		).toBe("no-address");
		for (const name of [
			"EKSEMPEL HOLDING AS",
			"EKSEMPEL INVEST AS",
			"EKSEMPEL CONSULTING AS",
			"EKSEMPEL VIKARTJENESTER AS",
			"SYKEHUSINNKJØP HF",
			"EKSEMPEL HF ADMINISTRASJON",
			"EKSEMPEL HF ADM - KONTORTJENESTER",
			"EKSEMPEL AS KONKURSBO",
		]) {
			expect(exclusionOf(candidate(name, "NO_HOSPITAL", "SÆR")), name).toBe("not-a-place-of-care");
		}
		for (const name of [
			"LEGE KARI EKSEMPEL AS",
			"DR. EKSEMPEL AS",
			"ØYELEGE KARI EKSEMPEL AS",
			"KJEVEORTOPED EKSEMPEL AS",
			"EKSEMPEL LEGE AS",
			"TANNLEGENE EKSEMPELSEN OG PRØVE",
			"LEGENE EKSEMPEL",
		]) {
			expect(exclusionOf(candidate(name, "NO_GP")), name).toBe("named-after-a-person");
		}
		expect(exclusionOf(candidate("EKSEMPEL MEDICAL AS", "NO_SPECIALIST"))).toBe(
			"no-place-of-care-in-name",
		);
		expect(exclusionOf(candidate("EKSEMPEL HELSEKOST AS", "NO_PHARMACY"))).toBe("not-a-pharmacy");
	});

	it("tells a person's practice from a place of care", () => {
		expect(namedAfterPerson("Eksempel legesenter")).toBe(false);
		expect(namedAfterPerson("Eksempel øyelegekontor")).toBe(false);
		expect(namedAfterPerson("Tannlegene i Eksempelgata")).toBe(false);
		expect(namedAfterPerson("Odontia Tannlegene Eksempel")).toBe(false);
		expect(namedAfterPerson("Tannlegene Eksempelsen")).toBe(true);
		expect(namedAfterPerson("Dr Eksempel")).toBe(true);
	});

	it("prints names and post towns re-cased, the company form dropped", () => {
		expect(displayName("EKSEMPEL LEGESENTER AS")).toBe("Eksempel Legesenter");
		expect(displayName("HELSE EKSEMPEL HF AVD VOSS")).toBe("Helse Eksempel HF avd. Voss");
		expect(displayName("SYKEHUSET I EKSEMPEL HF, DPS NORD")).toBe(
			"Sykehuset i Eksempel HF, DPS Nord",
		);
		expect(displayName("EKSEMPEL MEDISINSKE SENTER AS AVD. SØR")).toBe(
			"Eksempel Medisinske Senter AS avd. Sør",
		);
		expect(displayName("EKSEMPEL ØRE-NESE-HALS DA")).toBe("Eksempel Øre-nese-hals");
		expect(displayName("Eksempel klinikk")).toBe("Eksempel klinikk");
		expect(displayTown("MO I RANA")).toBe("Mo i Rana");
		expect(displayTown("")).toBeNull();
	});

	it("keeps the street line of an address, never a care-of line", () => {
		expect(streetOf(["c/o Kari Eksempel", "Eksempelveien 11"])).toEqual({
			street: "Eksempelveien 11",
			careOf: 1,
		});
		expect(streetOf(["2. etasje", "Eksempelgata 1"]).street).toBe("Eksempelgata 1");
		expect(streetOf(["Inngang C, 3 etasje", "Eksempelvegen 5G"]).street).toBe("Eksempelvegen 5G");
		expect(streetOf(["Eksempel helsehus"]).street).toBe("Eksempel helsehus");
		expect(streetOf(["C/O EKSEMPEL AS"])).toEqual({ street: null, careOf: 1 });
		expect(streetKey("Eksempelveien 5 - 7")).toBe("eksempelveien 5");
		expect(streetKey("Eksempelvegen 266-268")).toBe("eksempelvegen 266");
		expect(streetKey("Eksempel gt. 12 D")).toBe("eksempel gt 12d");
		expect(addressKey("3209", "Ragnar Strøms veg 10")).toBe("3209|ragnar strøms veg 10");
	});
});

describe("the Norwegian files", () => {
	it("read the register's establishments and their owners from the fixtures", async () => {
		const dir = fixtures();
		const result = await parseBrreg(join(dir, "underenheter.csv.gz"), join(dir, "enheter.csv.gz"));
		expect(result.lines).toBe(160);
		expect(result.entityLines).toBe(155);
		expect(result.candidates).toBe(159);
		expect(result.rows).toHaveLength(151);
		expect(result.quarantined).toEqual([]);
		expect(result.counters).toEqual({ sharedPhones: 4, invalidPhones: 0, careOfLines: 1 });
		const hospital = result.rows.find((row) => row.nationalId === NO_KEYS.hospital);
		expect(hospital).toMatchObject({
			professionCode: "NO_HOSPITAL",
			name: "Eksempel Universitetssykehus HF avd. Ullevål",
			address: {
				street: "Eksempelveien 1",
				postcode: "0450",
				postTown: "Oslo",
				municipality: "0301",
			},
			phone: null,
		});
		expect(hospital?.qualifications.map((row) => row.source)).toEqual(["naeringskode", "eier"]);
		expect(result.rows.find((row) => row.nationalId === NO_KEYS.pharmacy)?.phone).toBe(
			"+4722123456",
		);
		// The mobile number and the e-mail of the GP practice are never read.
		expect(JSON.stringify(result.rows)).not.toMatch(/912 34 567|\+4791234567|example/);
		for (const key of [
			NO_KEYS.soleProprietorship,
			NO_KEYS.namedAfterDoctor,
			NO_KEYS.physiotherapy,
		]) {
			expect(result.rows.some((row) => row.nationalId === key)).toBe(false);
		}
	});

	it("read the address points and postcode centres the run looks up", async () => {
		const dir = fixtures();
		const archive = readFileSync(join(dir, "adresser.zip"));
		const index = await readAddressIndex(
			archive,
			new Set([addressKey("0301", "Eksempelveien 1"), addressKey("5501", "Eksempelgata 99")]),
			new Set(["9008"]),
		);
		expect(index.byAddress.get(addressKey("0301", "Eksempelveien 1"))?.latitude).toBeCloseTo(
			59.97,
			1,
		);
		expect(index.byAddress.has(addressKey("5501", "Eksempelgata 99"))).toBe(false);
		expect(index.byPostcode.get("9008")?.latitude).toBeCloseTo(69.73, 1);
		expect(index.extractedOn).toBe("2026-11-21");
		await expect(readAddressIndex(archive, new Set(), new Set(), 10_000_000)).rejects.toThrow(
			/at least/,
		);
	});

	it("read Kartverket's counties and municipalities, Oslo both", () => {
		const dir = fixtures();
		const sources = parseNoPlaces(readFileSync(join(dir, "fylkerkommuner.json"), "utf8"));
		expect(sources.counties.map((county) => county.code)).toEqual(["03", "32", "46", "50", "55"]);
		const rows = buildNoPlaceRows(sources, []);
		expect(rows.filter((row) => row.kind === "department").map((row) => row.slug)).toEqual([
			"oslo",
			"akershus",
			"vestland",
			"trondelag",
			"troms",
		]);
		expect(rows.find((row) => row.code === "3201")).toMatchObject({
			kind: "commune",
			slug: "baerum",
			department_code: "32",
			parent_kind: "department",
			parent_code: "32",
		});
		expect(rows.find((row) => row.code === "0301")?.slug).toBe("oslo");
		// A renamed place keeps its old slug as an alias.
		const renamed = buildNoPlaceRows(sources, [
			{
				kind: "commune",
				code: "5501",
				name: "Tromsø kommune",
				slug: "tromso-kommune",
				departmentCode: "55",
			},
		]);
		expect(renamed.find((row) => row.code === "5501")).toMatchObject({
			slug: "tromso",
			previous_slug: "tromso-kommune",
		});
		expect(() => parseNoPlaces('[{"fylkesnummer":"12","fylkesnavn":"Hordaland"}]')).toThrow(
			/not one of NO_COUNTIES/,
		);
		expect(() => parseNoPlaces("{}")).toThrow(/not an array/);
	});
});

describe("the Norwegian guards and options", () => {
	const stats = {
		lines: 873_697,
		candidates: 25_832,
		rows: 5_823,
		people: 5_823,
		quarantined: 0,
		bytes: 1,
	};

	it("checks the source against floors and the last run", () => {
		expect(checkNoSource("brreg", stats, null).every((check) => check.ok)).toBe(true);
		const shrunk = checkNoSource("brreg", { ...stats, rows: 4_000, people: 4_000 }, stats);
		expect(shrunk.find((check) => check.name === "brreg.establishments")).toMatchObject({
			ok: false,
			approvable: true,
		});
		const broken = checkNoSource("brreg", { ...stats, quarantined: 1_000 }, null);
		expect(broken.find((check) => check.name === "brreg.quarantine")).toMatchObject({
			ok: false,
			approvable: false,
		});
	});

	it("checks the placing", () => {
		expect(
			checkNoPlaces({ address: 90, postcode: 9, municipality: 1, unplaced: 0 }).every((c) => c.ok),
		).toBe(true);
		const off = checkNoPlaces({ address: 10, postcode: 80, municipality: 0, unplaced: 10 });
		expect(off.map((check) => check.ok)).toEqual([false, false]);
	});

	it("reads its flags and environment", () => {
		expect(parseNoSources(undefined)).toEqual(["brreg"]);
		expect(() => parseNoSources("dmp")).toThrow(/Unknown Norwegian source/);
		const options = buildNoOptions(
			new Map<string, string | true>([
				["dry-run", true],
				["offline", true],
			]),
			{ DATABASE_URL: "postgres://x/y", ETL_NO_ADRESSER_URL: "https://example.test/a.zip" },
		);
		expect(options).toMatchObject({
			dryRun: true,
			offline: true,
			sources: ["brreg"],
			appUrl: null,
		});
		expect(options.urls.adresser).toBe("https://example.test/a.zip");
		expect(options.urls.underenheter).toMatch(
			/^https:\/\/data\.brreg\.no\/.*underenheter\/lastned\/csv$/,
		);
	});
});
