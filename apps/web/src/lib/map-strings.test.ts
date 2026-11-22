import { MAP_STRING_KEYS } from "@apercura/ui";
import { describe, expect, it } from "vitest";
import de from "../../messages/de.json";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import fr from "../../messages/fr.json";
import it_ from "../../messages/it.json";

const CATALOGS = { fr, en, de, es, it: it_ } as const;

describe("MapLibre strings in the catalogs", () => {
	it.each(Object.entries(CATALOGS))("%s translates every MapLibre string", (_locale, catalog) => {
		expect(Object.keys(catalog.Map).sort()).toEqual([...MAP_STRING_KEYS].sort());
		for (const value of Object.values(catalog.Map)) expect(value.trim()).not.toBe("");
	});

	it("does not leave English strings in the other catalogs", () => {
		for (const [locale, catalog] of Object.entries(CATALOGS)) {
			if (locale === "en") continue;
			for (const key of MAP_STRING_KEYS) {
				if (key === "logo") continue;
				expect(catalog.Map[key], `${locale}.Map.${key}`).not.toBe(en.Map[key]);
			}
		}
	});
});
