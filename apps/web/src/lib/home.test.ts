import { austria, ireland, switzerland, unitedKingdom } from "@apercura/core/country";
import { describe, expect, it } from "vitest";
import type { PlaceRef } from "~/server/queries/types";
import { HOME_PLACES_LIMIT, homePlaces, listingRows, sourceLine } from "./home";

const department = (id: number, name: string, count: number, code = String(id)) => ({
	id,
	kind: "department" as PlaceRef["kind"],
	code,
	name,
	slug: name.toLowerCase(),
	departmentCode: code,
	practitionerCount: count,
});

describe("homePlaces", () => {
	it("lists the regions with pages of their own, with their departments' counts", () => {
		const places = homePlaces("GB", [
			{
				code: "E12000001",
				name: "North East",
				slug: "north-east",
				departments: [department(1, "Durham", 3), department(2, "Gateshead", 4)],
			},
			{ code: "", name: "", slug: "", departments: [department(3, "Nowhere", 1)] },
		]);
		expect(places).toEqual([
			{ key: "E12000001", label: "North East", slug: "north-east", count: 7 },
		]);
	});

	it("lists every department elsewhere, in the directory's order", () => {
		const places = homePlaces("AT", [
			{
				code: "",
				name: "",
				slug: "",
				departments: [department(9, "Wien", 5), department(6, "Steiermark", 2)],
			},
		]);
		expect(places.map((place) => place.label)).toEqual(["Wien", "Steiermark"]);
	});

	it("lists France's and Germany's largest places only, the largest first", () => {
		const many = Array.from({ length: HOME_PLACES_LIMIT + 5 }, (_, index) =>
			department(index + 1, `Place ${index + 1}`, index + 1, String(index + 10)),
		);
		const places = homePlaces("FR", [{ code: "84", name: "Region", slug: "", departments: many }]);
		expect(places).toHaveLength(HOME_PLACES_LIMIT);
		expect(places[0]).toMatchObject({
			label: `Place ${HOME_PLACES_LIMIT + 5} (${HOME_PLACES_LIMIT + 14})`,
			count: HOME_PLACES_LIMIT + 5,
		});
		expect(places.at(-1)?.count).toBe(6);
		expect(homePlaces("DE", [{ code: "", name: "", slug: "", departments: many }])).toHaveLength(
			HOME_PLACES_LIMIT,
		);
	});

	it("leaves out places without anyone listed, and lists nothing before the first import", () => {
		expect(
			homePlaces("ES", [
				{ code: "", name: "", slug: "", departments: [department(1, "Madrid", 0)] },
			]),
		).toEqual([]);
		expect(homePlaces("FR", [])).toEqual([]);
	});
});

describe("listingRows", () => {
	it("gives kinds that share a listing one row, in the codes' order", () => {
		const listings: Record<string, string> = { A: "centres", B: "centres", C: "dentists" };
		const rows = listingRows(
			["A", "C", "B"],
			(code) => listings[code] ?? null,
			// A listing without a label reads as its code.
			(slug) => (slug === "centres" ? "Health centres" : null),
		);
		expect(rows).toEqual([
			{ key: "A", label: "Health centres", codes: ["A", "B"] },
			{ key: "C", label: "C", codes: ["C"] },
		]);
	});
});

describe("sourceLine", () => {
	it("names a market's lists, or their publishers where several share one", () => {
		expect(sourceLine("AT", austria.registries)).toContain(", ");
		const uk = sourceLine("GB", unitedKingdom.registries);
		expect(uk.split("; ")).toHaveLength(new Set(uk.split("; ")).size);
		expect(uk).toContain("Public Health Scotland");
	});

	it("credits only the lists Switzerland actually imported", () => {
		const [first] = switzerland.registries.filter((registry) =>
			registry.provides.includes("practitioners"),
		);
		expect(sourceLine("CH", switzerland.registries, [first?.id ?? ""])).toBe(first?.publisher);
		expect(sourceLine("CH", switzerland.registries, [])).toBe("");
	});

	it("credits Ireland's lists by publisher, the HSE's two layers once, never the places", () => {
		expect(sourceLine("IE", ireland.registries)).toBe(
			"Pharmaceutical Society of Ireland (PSI); Health Information and Quality Authority (HIQA); Health Service Executive (HSE), published on GeoHive",
		);
	});
});
