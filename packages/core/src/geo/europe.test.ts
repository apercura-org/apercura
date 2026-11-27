import { describe, expect, it } from "vitest";
import {
	EUROPEAN_COUNTRIES,
	type EuropeanPlace,
	europeanCountry,
	europeanPlaceOf,
	type GeoLanguage,
	placeKeysOf,
} from "./europe";

const LANGUAGES: readonly GeoLanguage[] = ["en", "fr", "de", "es", "it", "cs", "et"];

/** Countries of 5 million people or more, which list at least 10 cities. */
const LARGE_COUNTRIES = [
	"RU",
	"TR",
	"DE",
	"GB",
	"FR",
	"IT",
	"ES",
	"UA",
	"PL",
	"RO",
	"NL",
	"BE",
	"CZ",
	"SE",
	"PT",
	"GR",
	"HU",
	"BY",
	"AT",
	"CH",
	"RS",
	"BG",
	"DK",
	"FI",
	"NO",
	"SK",
	"IE",
];

/**
 * Keys knowingly shared by two countries, with the one a bare name means
 * (the country listed first in EUROPEAN_COUNTRIES).
 */
const SHARED_KEYS: Readonly<Record<string, string>> = {
	// Brest in Brittany and Brest in Belarus.
	brest: "FR",
};

const describePlace = (place: EuropeanPlace | null) =>
	place === null
		? null
		: place.kind === "country"
			? { kind: "country", code: place.country.code }
			: { kind: "city", code: place.country.code, city: place.city };

describe("EUROPEAN_COUNTRIES", () => {
	it("has unique two-letter uppercase codes", () => {
		const codes = EUROPEAN_COUNTRIES.map((country) => country.code);
		for (const code of codes) expect(code).toMatch(/^[A-Z]{2}$/);
		expect(new Set(codes).size).toBe(codes.length);
	});

	it("covers the EU, the rest of Europe and the open markets", () => {
		const codes = new Set(EUROPEAN_COUNTRIES.map((country) => country.code));
		for (const code of [
			...["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE"],
			...["IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"],
			...["GB", "CH", "NO", "IS", "LI", "AD", "MC", "SM", "VA", "AL", "BA", "ME", "MK", "RS"],
			...["XK", "MD", "UA", "BY", "RU", "TR"],
		]) {
			expect(codes.has(code), code).toBe(true);
		}
		expect(codes.size).toBe(47);
	});

	it("names every country in every language", () => {
		for (const country of EUROPEAN_COUNTRIES) {
			for (const language of LANGUAGES) {
				expect(country.names[language].trim(), `${country.code} ${language}`).not.toBe("");
				expect(country.covered[language].trim(), `${country.code} ${language}`).not.toBe("");
			}
			expect(country.cities.length, country.code).toBeGreaterThan(0);
			for (const names of country.cities) {
				expect(names.length, country.code).toBeGreaterThan(0);
				for (const name of names) expect(name.trim(), country.code).not.toBe("");
			}
		}
	});

	it("uses no country code as an alias", () => {
		const codes = new Set(EUROPEAN_COUNTRIES.map((country) => country.code));
		for (const country of EUROPEAN_COUNTRIES) {
			for (const alias of country.aliases) expect(codes.has(alias), alias).toBe(false);
		}
	});

	it("lists at least 10 cities for every country of 5 million people or more", () => {
		for (const code of LARGE_COUNTRIES) {
			expect(europeanCountry(code)?.cities.length ?? 0, code).toBeGreaterThanOrEqual(10);
		}
	});

	it("shares no key between two countries but the known ones", () => {
		const owners = new Map<string, Set<string>>();
		for (const country of EUROPEAN_COUNTRIES) {
			const names = [
				...Object.values(country.names),
				...Object.values(country.covered),
				...country.aliases,
				...country.cities.flat(),
			];
			for (const name of names) {
				for (const key of placeKeysOf(name)) {
					const codes = owners.get(key) ?? new Set<string>();
					codes.add(country.code);
					owners.set(key, codes);
				}
			}
		}
		const shared = [...owners]
			.filter(([, codes]) => codes.size > 1)
			.map(([key, codes]) => `${key}: ${[...codes].join(", ")}`);
		const allowed = Object.keys(SHARED_KEYS).map(
			(key) => `${key}: ${[...(owners.get(key) ?? [])].join(", ")}`,
		);
		expect(shared.sort()).toEqual(allowed.sort());
		for (const [key, code] of Object.entries(SHARED_KEYS)) {
			expect(europeanPlaceOf(key)?.country.code, key).toBe(code);
		}
	});

	it("words the covered phrase with the article each language needs", () => {
		expect(europeanCountry("DE")?.covered.fr).toBe("l’Allemagne");
		expect(europeanCountry("NL")?.covered.fr).toBe("les Pays-Bas");
		expect(europeanCountry("NL")?.covered.en).toBe("the Netherlands");
		expect(europeanCountry("PT")?.covered.fr).toBe("le Portugal");
		expect(europeanCountry("MT")?.covered.fr).toBe("Malte");
		expect(europeanCountry("CY")?.covered.fr).toBe("Chypre");
		expect(europeanCountry("CH")?.covered.de).toBe("die Schweiz");
		expect(europeanCountry("TR")?.covered.de).toBe("die Türkei");
		expect(europeanCountry("GB")?.covered.es).toBe("el Reino Unido");
		expect(europeanCountry("GB")?.covered.it).toBe("il Regno Unito");
		expect(europeanCountry("DE")?.covered.cs).toBe("Německo");
		expect(europeanCountry("FR")?.covered.cs).toBe("Francii");
		expect(europeanCountry("UA")?.covered.cs).toBe("Ukrajinu");
	});
});

describe("europeanCountry", () => {
	it("finds a country by its code, in any case", () => {
		expect(europeanCountry("DE")?.names.en).toBe("Germany");
		expect(europeanCountry("gb")?.names.fr).toBe("Royaume-Uni");
		expect(europeanCountry("XK")?.names.en).toBe("Kosovo");
		expect(europeanCountry("US")).toBeUndefined();
	});
});

describe("europeanPlaceOf", () => {
	const city = (code: string, name: string) => ({ kind: "city", code, city: name });
	const country = (code: string) => ({ kind: "country", code });

	it.each([
		["Berlin", city("DE", "Berlin")],
		["berlin", city("DE", "Berlin")],
		["BERLIN", city("DE", "Berlin")],
		["  Berlin  ", city("DE", "Berlin")],
		["München", city("DE", "München")],
		["Munchen", city("DE", "München")],
		["Muenchen", city("DE", "München")],
		["Munich", city("DE", "München")],
		["Hamburg", city("DE", "Hamburg")],
		["Hambourg", city("DE", "Hamburg")],
		["Köln", city("DE", "Köln")],
		["Koeln", city("DE", "Köln")],
		["Cologne", city("DE", "Köln")],
		["Frankfurt am Main", city("DE", "Frankfurt am Main")],
		["Madrid", city("ES", "Madrid")],
		["Roma", city("IT", "Roma")],
		["Rome", city("IT", "Roma")],
		["Warszawa", city("PL", "Warszawa")],
		["Varsovie", city("PL", "Warszawa")],
		["Lodz", city("PL", "Łódź")],
		["Bruxelles", city("BE", "Bruxelles")],
		["Brussel", city("BE", "Bruxelles")],
		["Wien", city("AT", "Wien")],
		["Vienne", city("AT", "Wien")],
		["Praha", city("CZ", "Praha")],
		["Den Haag", city("NL", "Den Haag")],
		["La Haye", city("NL", "Den Haag")],
		["’s-Hertogenbosch", city("NL", "’s-Hertogenbosch")],
		["s Hertogenbosch", city("NL", "’s-Hertogenbosch")],
		["Zuerich", city("CH", "Zürich")],
		["Tromso", city("NO", "Tromsø")],
		["Istanbul", city("TR", "İstanbul")],
		["Kyiv", city("UA", "Київ")],
		["Київ", city("UA", "Київ")],
		["Athènes", city("GR", "Αθήνα")],
		["Biel/Bienne", city("CH", "Biel/Bienne")],
		["Brest", city("FR", "Brest")],
	])("reads %j as a city", (text, expected) => {
		expect(describePlace(europeanPlaceOf(text))).toEqual(expected);
	});

	it.each([
		["10115 Berlin", city("DE", "Berlin")],
		["Berlin 10115", city("DE", "Berlin")],
		["D-10115 Berlin", city("DE", "Berlin")],
		["00-950 Warszawa", city("PL", "Warszawa")],
		["1012 AB Amsterdam", city("NL", "Amsterdam")],
		["101 Reykjavík", city("IS", "Reykjavík")],
		["Berlin, Allemagne", city("DE", "Berlin")],
		["Berlin Germany", city("DE", "Berlin")],
		["München (Deutschland)", city("DE", "München")],
		["10115 Berlin, Deutschland", city("DE", "Berlin")],
		["Brest, Biélorussie", city("BY", "Брэст")],
	])("reads %j as a city despite its postcode or country", (text, expected) => {
		expect(describePlace(europeanPlaceOf(text))).toEqual(expected);
	});

	it.each([
		["Allemagne", "DE"],
		["Germany", "DE"],
		["Deutschland", "DE"],
		["Espagne", "ES"],
		["España", "ES"],
		["Autriche", "AT"],
		["UK", "GB"],
		["U.K.", "GB"],
		["Royaume-Uni", "GB"],
		["Écosse", "GB"],
		["Tchéquie", "CZ"],
		["Czech Republic", "CZ"],
		["Česko", "CZ"],
		["Pays-Bas", "NL"],
		["les Pays-Bas", "NL"],
		["Holland", "NL"],
		["Suisse", "CH"],
		["Svizra", "CH"],
		["Oesterreich", "AT"],
		["Россия", "RU"],
		["Kosovo", "XK"],
		// Names of both a country and its city: the country wins.
		["Luxembourg", "LU"],
		["Monaco", "MC"],
		["San Marino", "SM"],
		["Andorra", "AD"],
		["Vaticano", "VA"],
		["Città del Vaticano", "VA"],
	])("reads %j as a country", (text, code) => {
		expect(describePlace(europeanPlaceOf(text))).toEqual(country(code));
	});

	it.each([
		"",
		"   ",
		"Paris 15",
		"Lyon 3e",
		"Berlinerstrasse",
		"Berlin Mitte",
		"Saint-Denis",
		"Saint-Paul",
		"75001",
		"dentiste",
		"Berlin, Espagne",
		"DE",
	])("finds nothing in %j", (text) => {
		expect(europeanPlaceOf(text)).toBeNull();
	});
});
