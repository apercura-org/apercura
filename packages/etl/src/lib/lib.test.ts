import { describe, expect, it } from "vitest";
import { acceptGeocode, buildGeocodeCsv, geocodeInput, parseGeocodeCsv } from "../geocode";
import {
	checkBreakers,
	checkFiles,
	checkOrphans,
	checkQuarantine,
	checkStaging,
	verdict,
} from "../guards";
import { coarseTag } from "../outbox";
import { AMELI_COLUMNS, ameliRow } from "../sources/fr/ameli";
import { finessRow } from "../sources/fr/finess";
import { copyEscape, copyLine } from "./copy";
import type { SourceFile } from "./files";
import { mapColumns, parseQuotedRecord } from "./text";

describe("COPY text format", () => {
	it("escapes special characters and nulls", () => {
		expect(copyEscape(null)).toBe("\\N");
		expect(copyEscape(undefined)).toBe("\\N");
		expect(copyEscape("a\tb\nc\\d\re")).toBe("a\\tb\\nc\\\\d\\re");
		expect(copyEscape(42)).toBe("42");
		expect(copyLine(["a", null, 1])).toBe("a\t\\N\t1\n");
	});
});

describe("quoted records (Ameli)", () => {
	it("parses quotes, escaped quotes and delimiters inside quotes", () => {
		expect(parseQuotedRecord('"a";"b;c";"d ""e"""', ";")).toEqual(["a", "b;c", 'd "e"']);
		expect(parseQuotedRecord('"a";;"c"', ";")).toEqual(["a", "", "c"]);
		expect(parseQuotedRecord("x,y", ",")).toEqual(["x", "y"]);
	});

	it("signals an unterminated quoted field", () => {
		expect(parseQuotedRecord('"a";"multi', ";")).toBeNull();
	});

	it("maps Ameli rows, skipping out-of-scope specialties", () => {
		const header = Object.values(AMELI_COLUMNS);
		const index = mapColumns("ameli", header, AMELI_COLUMNS);
		const row = (overrides: Partial<Record<keyof typeof AMELI_COLUMNS, string>>) =>
			(Object.keys(AMELI_COLUMNS) as (keyof typeof AMELI_COLUMNS)[]).map(
				(key) =>
					overrides[key] ??
					{
						lastName: "EXEMPLE",
						firstName: "CAMILLE",
						carteVitale: "true",
						apcv: "false",
						specialtyCode: "01",
						postcode: "75015",
						city: "PARIS",
						optionCode: "3",
						billingSector: "3",
					}[key],
			);
		expect(ameliRow(row({}), index, 2)).toEqual([
			2,
			"EXEMPLE",
			"CAMILLE",
			"01",
			"75015",
			"PARIS",
			"true",
			"false",
			"3",
			"3",
		]);
		expect(ameliRow(row({ specialtyCode: "24" }), index, 3)).toBeNull();
		expect(ameliRow(row({ postcode: "DAX" }), index, 4)).toBe("invalid");
		expect(
			ameliRow(row({ billingSector: "Secteur 2", optionCode: "OPTAM" }), index, 5)?.slice(8),
		).toEqual([null, null]);
	});
});

describe("FINESS+ establishments", () => {
	const open = {
		informationsGeneralesEGE: {
			numFinessEge: "759999001",
			nomEgeLong: "HOPITAL FICTIF   ",
			dateFermeture: null,
		},
		categorieentiteGeographiqueExercice: "355",
		adresse: [
			{
				cogCommune: "75113",
				codePostal: "75013",
				coordonneesGeographique: { directionLatitude: "48.835", directionLongitude: "2.36" },
			},
		],
		contact: [{ telecom: { telephone: "0199000100" } }],
		etatObjet: "A",
	};

	it("keeps open establishments with WGS84 coordinates", () => {
		expect(finessRow(open)).toEqual([
			"759999001",
			"Hopital Fictif",
			"hopital-fictif-759999001",
			"355",
			"75113",
			"75013",
			"48.835",
			"2.36",
			"+33199000100",
		]);
	});

	it("drops closed establishments and invalid coordinates", () => {
		expect(finessRow({ ...open, etatObjet: "I" })).toBeNull();
		expect(
			finessRow({
				...open,
				informationsGeneralesEGE: { ...open.informationsGeneralesEGE, dateFermeture: "2020-01-01" },
			}),
		).toBeNull();
		const noCoords = finessRow({
			...open,
			adresse: [
				{
					...open.adresse[0],
					coordonneesGeographique: { directionLatitude: "x", directionLongitude: "999" },
				},
			],
		});
		expect(noCoords?.slice(6, 8)).toEqual([null, null]);
	});
});

describe("geocoding", () => {
	const inputs = [
		geocodeInput("24 Rue Dauphine", "75006", "75106"),
		geocodeInput('Rue "A, B"', "75015", null),
	];

	it("builds the CSV request body with quoting", () => {
		expect(buildGeocodeCsv(inputs)).toBe(
			'key,adresse,postcode,citycode\n0,24 Rue Dauphine,75006,75106\n1,"Rue ""A, B""",75015,\n',
		);
	});

	it("parses results back by row key", () => {
		const csv = [
			"key,adresse,postcode,citycode,latitude,longitude,result_score,result_type,result_citycode",
			"0,24 Rue Dauphine,75006,75106,48.854906,2.339352,0.97,housenumber,75106",
			'1,"Rue ""A, B""",75015,,,,,,',
		].join("\n");
		const results = parseGeocodeCsv(csv, inputs);
		expect(results[0]).toEqual({
			key: inputs[0]?.key,
			latitude: 48.854906,
			longitude: 2.339352,
			score: 0.97,
			resultType: "housenumber",
			resultCitycode: "75106",
			precision: "address",
		});
		expect(results[1]?.precision).toBeNull();
	});

	it("accepts a result only above 0.6 and in an expected commune", () => {
		const result = { score: 0.7, resultCitycode: "75106", latitude: 48.8, longitude: 2.3 };
		expect(acceptGeocode(result, new Set(["75056", "75106"]))).toBe(true);
		expect(acceptGeocode({ ...result, score: 0.59 }, new Set(["75106"]))).toBe(false);
		expect(acceptGeocode(result, new Set(["75107"]))).toBe(false);
		expect(acceptGeocode(result, new Set())).toBe(false);
	});
});

const file = (overrides: Partial<SourceFile>): SourceFile => ({
	key: "personneActivite",
	url: "x",
	resolvedUrl: "x",
	path: "x",
	bytes: 1000,
	sha256: "0",
	lastModified: null,
	utf8Valid: true,
	endsWithNewline: true,
	...overrides,
});

describe("guards", () => {
	it("blocks a truncated file and invalid UTF-8, without override", () => {
		const checks = checkFiles([file({ endsWithNewline: false, utf8Valid: false })], null);
		const result = verdict(checks, true);
		expect(result.ok).toBe(false);
		expect(result.blocking.map((check) => check.name)).toEqual([
			"personneActivite.final_newline",
			"personneActivite.utf8",
		]);
		expect(result.approvable).toBe(false);
	});

	it("blocks a size change above 10% unless approved", () => {
		const checks = checkFiles([file({ bytes: 850 })], { personneActivite: { bytes: 1000 } });
		expect(verdict(checks, false)).toMatchObject({ ok: false, approvable: true });
		expect(verdict(checks, true)).toMatchObject({ ok: true });
		expect(
			verdict(checkFiles([file({ bytes: 950 })], { personneActivite: { bytes: 1000 } }), false).ok,
		).toBe(true);
	});

	it("fails above 0.1% quarantined lines", () => {
		expect(checkQuarantine({ a: { lines: 10_000, quarantined: 10 } })[0]?.ok).toBe(true);
		expect(checkQuarantine({ a: { lines: 10_000, quarantined: 11 } })[0]?.ok).toBe(false);
		expect(checkQuarantine({ a: { lines: 0, quarantined: 0 } })[0]?.ok).toBe(false);
	});

	it("checks staging volumes against the last success", () => {
		const base = {
			rows: 1000,
			rppsByProfession: { "10": 500, "40": 100 },
			rowsWithStructure: 800,
			rowsWithCommune: 790,
			invalidRpps: 0,
		};
		expect(verdict(checkStaging(base, base), false).ok).toBe(true);
		const shrunk = { ...base, rows: 960, rppsByProfession: { "10": 489, "40": 100 } };
		expect(verdict(checkStaging(shrunk, base), false).blocking.map((check) => check.name)).toEqual([
			"staging.rows",
			"staging.rpps.10",
		]);
		expect(verdict(checkStaging({ ...base, rowsWithCommune: 700 }, null), false).ok).toBe(false);
		expect(verdict(checkStaging({ ...base, invalidRpps: 1 }, null), true).ok).toBe(false);
	});

	it("trips the circuit breakers above 1% unpublished or 10% modified", () => {
		const pages = { previousTotal: 1000, previousIndexable: 800, updated: 50, unpublished: 8 };
		expect(verdict(checkBreakers(pages), false).ok).toBe(true);
		expect(verdict(checkBreakers({ ...pages, unpublished: 9 }), false).ok).toBe(false);
		expect(verdict(checkBreakers({ ...pages, updated: 101 }), false).ok).toBe(false);
		expect(verdict(checkBreakers({ ...pages, updated: 101 }), true).ok).toBe(true);
		expect(checkBreakers({ ...pages, previousTotal: 0 })).toEqual([]);
	});
});

describe("outbox", () => {
	it("derives coarse tags", () => {
		expect(coarseTag("practitioner:12")).toBe("practitioner:*");
		expect(coarseTag("listing:cardiologue:75")).toBe("listing:*");
	});
});

describe("orphan guard", () => {
	it("passes when every indexable page is listed, blocks (approvable) otherwise", () => {
		expect(verdict(checkOrphans({ count: 0, examples: [] }), false).ok).toBe(true);
		const orphan = checkOrphans({ count: 2, examples: ["a-19999990013", "b-19999990021"] });
		expect(verdict(orphan, false).ok).toBe(false);
		expect(verdict(orphan, true).ok).toBe(true);
		expect(orphan[0]?.detail).toContain("a-19999990013");
	});
});
