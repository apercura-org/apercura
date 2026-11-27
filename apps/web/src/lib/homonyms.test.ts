import { europeanCountry } from "@apercura/core/geo";
import { describe, expect, it } from "vitest";
import { CLEARLY_LARGER, type Homonym, standoutPlace } from "./homonyms";

const place = (id: number, code: string, population: number | null = null): Homonym => ({
	id,
	code,
	population,
});

const sites = (entries: Record<number, number>) =>
	new Map(Object.entries(entries).map(([id, count]) => [Number(id), count]));

describe("standoutPlace", () => {
	it("keeps a single place, and finds none among none", () => {
		const only = place(1, "31003");
		expect(standoutPlace([only], "LT", "Vilnius")).toBe(only);
		expect(standoutPlace([], "LT", "Vilnius")).toBeNull();
	});

	it("prefers the city that is a department of its own over a village of the same name", () => {
		const village = place(1, "57123");
		const city = place(2, "31003");
		expect(standoutPlace([village, city], "LT", "Vilnius")).toBe(city);
		// A kreisfreie Stadt, a Polish city with powiat rights, Praha: whatever the name.
		const kreisfrei = place(4, "11000000");
		expect(standoutPlace([place(3, "12060020"), kreisfrei], "DE", "Berlin")).toBe(kreisfrei);
		const powiat = place(6, "1261011");
		expect(standoutPlace([place(5, "1206113"), powiat], "PL", "Kraków")).toBe(powiat);
	});

	it.each([
		// The main cities production asked about (#195), with their real codes.
		["LT", "Vilnius", "31003", ["57123"]],
		["LT", "Šiauliai", "28338", ["88012", "94045"]],
		["LT", "Alytus", "10278", ["33061"]],
		["DE", "Münster", "05515000", ["03358016", "09779186"]],
		["PL", "Olsztyn", "2862011", ["2404092"]],
		["EE", "Maardu", "0446", ["0245"]],
	] as const)("finds %s's %s by its level", (country, name, code, others) => {
		const city = place(1, code);
		const homonyms = others.map((other, index) => place(index + 2, other));
		expect(standoutPlace([...homonyms, city], country, name)).toBe(city);
	});

	it("takes the largest of a main city's homonyms when every one carries its population", () => {
		const large = place(2, "B", 120_000);
		expect(standoutPlace([place(1, "A", 90_000), large], "IE", "Cork")).toBe(large);
	});

	it("takes the clearly largest of any other name, never a near tie", () => {
		const town = place(2, "26362", 64_000);
		const village = place(1, "82186", 5_000);
		expect(standoutPlace([village, town], "FR", "Valence")).toBe(town);
		expect(
			standoutPlace([place(1, "A", 150_000), place(2, "B", 110_000)], "FR", "Saint-Denis"),
		).toBeNull();
		const edge = place(2, "B", CLEARLY_LARGER * 100);
		expect(standoutPlace([place(1, "A", 100), edge], "FR", "Somewhere")).toBe(edge);
		expect(
			standoutPlace([place(1, "A", 101), place(2, "B", CLEARLY_LARGER * 100)], "FR", "Somewhere"),
		).toBeNull();
	});

	it("leaves two places of a size to the visitor", () => {
		expect(standoutPlace([place(1, "90001"), place(2, "90002")], "LT", "Pavyzdžiai")).toBeNull();
		expect(standoutPlace([place(1, "A", 300), place(2, "B", 300)], "FR", "Pavyzdžiai")).toBeNull();
		// The places of care count for a main city only.
		expect(
			standoutPlace([place(1, "90001"), place(2, "90002")], "LT", "Pavyzdžiai", sites({ 2: 9 })),
		).toBeNull();
	});

	it("counts the places of care of a main city whose places carry neither level nor population", () => {
		const capital = place(2, "1");
		const village = place(1, "2");
		expect(standoutPlace([village, capital], "SI", "Ljubljana")).toBeNull();
		expect(standoutPlace([village, capital], "SI", "Ljubljana", sites({ 2: 40 }))).toBe(capital);
		expect(standoutPlace([village, capital], "SI", "Ljubljana", sites({ 1: 3, 2: 3 }))).toBeNull();
		expect(standoutPlace([village, capital], "SI", "Ljubljana", sites({}))).toBeNull();
	});

	it("compares several department cities of one name as the other places", () => {
		const main = place(1, "06412000", 770_000);
		const oder = place(2, "12053000", 57_000);
		expect(standoutPlace([oder, main], "DE", "Frankfurt")).toBe(main);
	});
});

/*
 * The markets still being opened (Latvia, Cyprus, Sweden, Malta): their capitals and main cities
 * are in `@apercura/core/geo`, so the ranking applies to them as soon as their places land,
 * whatever their codes: by population (Cyprus publishes it), else by places of care.
 */
describe.each(["LV", "CY", "SE", "MT"])("the main cities of %s, a market being opened", (code) => {
	const country = europeanCountry(code);
	const cities = country?.cities.slice(0, 2) ?? [];

	it("are listed", () => {
		expect(cities.length).toBe(2);
	});

	it.each(cities.flatMap((names) => names.map((name) => [name])))(
		"%s wins over a village of the same name",
		(name) => {
			const village = place(1, "9001");
			const city = place(2, "1000");
			expect(standoutPlace([village, city], code, name, sites({ 1: 1, 2: 25 }))).toBe(city);
			expect(standoutPlace([place(1, "9001", 300), place(2, "1000", 200_000)], code, name)).toEqual(
				place(2, "1000", 200_000),
			);
			// Two places nothing tells apart are still both shown.
			expect(standoutPlace([village, city], code, name, sites({ 1: 2, 2: 2 }))).toBeNull();
		},
	);
});
