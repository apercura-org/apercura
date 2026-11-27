import { describe, expect, it } from "vitest";
import { messagesFor } from "~/i18n/catalogs";
import { pickMessages } from "./client-messages";
import { forMarket } from "./market-messages";

type Taxonomy = { listing: Record<string, string>; profession: Record<string, string> };

const taxonomyOf = (messages: Record<string, unknown>) => messages.taxonomy as Taxonomy;

describe("the messages of a market's client islands", () => {
	it("carry only the market's own listing and profession labels", () => {
		const picked = pickMessages(messagesFor("fr"), ["Search", "taxonomy"]);
		const french = taxonomyOf(forMarket(picked, "FR"));
		expect(french.listing.cardiologue).toBeTruthy();
		expect(french.profession.medecin).toBeTruthy();
		expect(french.listing.kardiolog).toBeUndefined();
		expect(french.listing.kardiologie).toBeUndefined();
		expect(french.listing["gp-practices"]).toBeUndefined();

		const czech = taxonomyOf(forMarket(pickMessages(messagesFor("cs-CZ"), ["taxonomy"]), "CZ"));
		expect(czech.listing.kardiolog).toBe("Kardiologové");
		expect(czech.profession.lekarna).toBe("Lékárna");
		expect(czech.listing.cardiologue).toBeUndefined();
	});

	it("never grows a market's payload, and keeps the other namespaces as they are", () => {
		const picked = pickMessages(messagesFor("fr"), ["Search", "taxonomy"]);
		const pruned = forMarket(picked, "FR");
		expect(JSON.stringify(pruned).length).toBeLessThan(JSON.stringify(picked).length);
		expect(pruned.Search).toBe(picked.Search);
		const title = (pruned.taxonomy as Record<string, unknown>).title;
		expect(title).toEqual((picked.taxonomy as Record<string, unknown>).title);
		expect(forMarket({ Search: {} }, "CZ")).toEqual({ Search: {} });
	});

	it("give Switzerland's islands its labels only, and no other market Switzerland's", () => {
		for (const locale of ["de-CH", "fr-CH", "it-CH"] as const) {
			const swiss = taxonomyOf(forMarket(pickMessages(messagesFor(locale), ["taxonomy"]), "CH"));
			expect(swiss.listing.spital, locale).toBeTruthy();
			expect(swiss.profession.pflegeheim, locale).toBeTruthy();
			expect(swiss.listing.farmacie, locale).toBeUndefined();
			expect(swiss.listing.cardiologue, locale).toBeUndefined();
		}
		for (const [locale, market] of [
			["fr", "FR"],
			["de-AT", "AT"],
			["it-IT", "IT"],
		] as const) {
			const other = taxonomyOf(forMarket(pickMessages(messagesFor(locale), ["taxonomy"]), market));
			expect(other.listing.spital, locale).toBeUndefined();
			expect(other.profession.apotheke, locale).toBeUndefined();
		}
	});
});
