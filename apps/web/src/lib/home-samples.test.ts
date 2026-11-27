import { describe, expect, it } from "vitest";
import { messagesFor } from "~/i18n/catalogs";
import { LOCALES, marketOf } from "~/i18n/locales";
import { homeSamples, specimenOf } from "./home-samples";
import { isMarketListingSlug } from "./market";

/** A word that says the sample is one, in the market's language. */
const FICTITIOUS =
	/Exemple|Example|Sample|Specimen|Muster|Beispiel|Příklad|Vzor|Ejemplo|Muestra|Esempio|Modello|Näidis|Przykład|Wzorc|Eksempel|Esimerkki|Pavyzd|Primer|Zgled|Παράδειγμα|Παραδείγματος|Υπόδειγμα|Υποδείγματος|Parau|parau|Piemēr|Exempel/;

describe("homeSamples", () => {
	it("gives every locale one sample per state of a page, the specimen unclaimed first", () => {
		for (const locale of LOCALES) {
			const samples = homeSamples(locale);
			expect(samples.map((sample) => sample.status)).toEqual(["unclaimed", "verified", "claimed"]);
			expect(new Set(samples.map((sample) => sample.identifier)).size).toBe(3);
			expect(specimenOf(locale)).toBe(samples[0]);
		}
	});

	it("names and places every sample as plainly fictitious", () => {
		for (const locale of LOCALES) {
			for (const sample of homeSamples(locale)) {
				expect(sample.name, locale).toMatch(FICTITIOUS);
				expect(sample.address, locale).toMatch(FICTITIOUS);
			}
		}
	});

	it("shows only kinds the market's directory lists, labelled in the locale's catalog", () => {
		for (const locale of LOCALES) {
			const taxonomy = messagesFor(locale).taxonomy as unknown as Record<
				"listing" | "profession",
				Record<string, string>
			>;
			for (const sample of homeSamples(locale)) {
				expect(isMarketListingSlug(locale, sample.listing), `${locale} ${sample.listing}`).toBe(
					true,
				);
				expect(
					taxonomy.listing[sample.listing] ?? taxonomy.profession[sample.listing],
					`${locale} ${sample.listing}`,
				).toBeTruthy();
			}
		}
	});

	it("keeps France's samples on France's interface translations and Switzerland's per language", () => {
		for (const locale of ["fr", "en", "de", "es", "it"] as const) {
			expect(homeSamples(locale)).toBe(homeSamples("fr"));
		}
		expect(specimenOf("de-CH").name).toBe("Spital Musterwil");
		expect(specimenOf("fr-CH").name).toBe("Hôpital de l’Exemple");
		expect(specimenOf("it-CH").name).toBe("Ospedale dell’Esempio");
		// Swiss Standard German writes no "ß".
		expect(JSON.stringify(homeSamples("de-CH"))).not.toContain("ß");
		expect(new Set(LOCALES.map((locale) => marketOf(locale))).size).toBe(18);
		// Ireland's samples are in English, without an Eircode.
		expect(specimenOf("en-IE").name).toBe("Example Pharmacy");
		expect(JSON.stringify(homeSamples("en-IE"))).not.toMatch(/[A-Z]\d{2} ?[A-Z0-9]{4}/);
		// Latvia: a GP practice, a hospital and a pharmacy, in Latvian.
		expect(specimenOf("lv-LV").listing).toBe("gimenes-arstu-prakses");
		// Sweden's samples are in Swedish, a pharmacy first.
		expect(specimenOf("sv-SE").name).toBe("Exempelapoteket Storgatan");
		expect(homeSamples("sv-SE").map((sample) => sample.listing)).toEqual([
			"apoteken",
			"vardcentraler",
			"apoteken",
		]);
	});
});
