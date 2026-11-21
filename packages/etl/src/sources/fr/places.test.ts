import { describe, expect, it } from "vitest";
import { buildPlaceRows, type PlaceSources } from "./places";

const sources: PlaceSources = {
	regions: [{ code: "11", nom: "Île-de-France" }],
	departements: [
		{ code: "75", nom: "Paris", codeRegion: "11" },
		{ code: "2A", nom: "Corse-du-Sud", codeRegion: "94" },
	],
	communes: [
		{
			code: "75056",
			nom: "Paris",
			codeDepartement: "75",
			codeRegion: "11",
			codesPostaux: ["75001", "75015"],
		},
		{
			code: "2A004",
			nom: "Ajaccio",
			codeDepartement: "2A",
			codeRegion: "94",
			codesPostaux: ["20000"],
		},
		{
			code: "2A999",
			nom: "Ajaccio",
			codeDepartement: "2A",
			codeRegion: "94",
			codesPostaux: ["20001"],
		},
		{
			code: "97501",
			nom: "Miquelon-Langlade",
			codeDepartement: "975",
			codeRegion: null,
			codesPostaux: ["97500"],
		},
	],
	arrondissements: [
		{
			code: "75115",
			nom: "Paris 15e Arrondissement",
			codeDepartement: "75",
			codeRegion: "11",
			codesPostaux: ["75015"],
			centre: { type: "Point", coordinates: [2.29, 48.84] },
			population: 230_000,
		},
	],
};

const byCode = (rows: ReturnType<typeof buildPlaceRows>, kind: string, code: string) =>
	rows.find((row) => row.kind === kind && row.code === code);

describe("buildPlaceRows", () => {
	const rows = buildPlaceRows(sources, []);

	it("builds department slugs as {code}-{name}", () => {
		expect(byCode(rows, "department", "75")?.slug).toBe("75-paris");
		expect(byCode(rows, "department", "2A")?.slug).toBe("2a-corse-du-sud");
		expect(byCode(rows, "region", "11")?.slug).toBe("ile-de-france");
	});

	it("adds overseas collectivities missing from /departements", () => {
		expect(byCode(rows, "department", "975")?.slug).toBe("975-saint-pierre-et-miquelon");
		expect(byCode(rows, "commune", "97501")?.parent_code).toBe("975");
	});

	it("suffixes the INSEE code on a slug collision within a department", () => {
		expect(byCode(rows, "commune", "2A004")?.slug).toBe("ajaccio");
		expect(byCode(rows, "commune", "2A999")?.slug).toBe("ajaccio-2a999");
	});

	it("links arrondissements to their city and keeps coordinates", () => {
		const arrondissement = byCode(rows, "arrondissement", "75115");
		expect(arrondissement).toMatchObject({
			slug: "paris-15e-arrondissement",
			department_code: "75",
			parent_kind: "commune",
			parent_code: "75056",
			longitude: 2.29,
			latitude: 48.84,
			population: 230_000,
			postcodes: ["75015"],
		});
	});

	it("keeps stored slugs and records an alias on rename", () => {
		const existing = [
			{
				kind: "commune",
				code: "2A004",
				name: "Ajaccio",
				slug: "ajaccio-ancien",
				departmentCode: "2A",
			},
			{
				kind: "commune",
				code: "75056",
				name: "Paris (ancien nom)",
				slug: "paris",
				departmentCode: "75",
			},
		];
		const next = buildPlaceRows(
			{
				...sources,
				communes: sources.communes.map((commune) =>
					commune.code === "75056" ? { ...commune, nom: "Paris Nouveau" } : commune,
				),
			},
			existing,
		);
		expect(byCode(next, "commune", "2A004")).toMatchObject({
			slug: "ajaccio-ancien",
			previous_slug: null,
		});
		expect(byCode(next, "commune", "75056")).toMatchObject({
			slug: "paris-nouveau",
			previous_slug: "paris",
		});
	});
});
