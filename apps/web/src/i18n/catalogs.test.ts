import {
	allCzListingSlugs,
	allDeTaxonomySlugs,
	allEsTaxonomySlugs,
	allItListingSlugs,
	DE_DEFAULT_PROFESSIONS,
} from "@apercura/core/taxonomy";
import {
	isPluralElement,
	isSelectElement,
	isTagElement,
	type MessageFormatElement,
	parse,
	TYPE,
} from "@formatjs/icu-messageformat-parser";
import { describe, expect, it } from "vitest";
import at from "../../messages/at.json";
import cz from "../../messages/cz.json";
import de from "../../messages/de.json";
import deDE from "../../messages/de-DE.json";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import esES from "../../messages/es-ES.json";
import fr from "../../messages/fr.json";
import gb from "../../messages/gb.json";
import it_ from "../../messages/it.json";
import itIT from "../../messages/it-IT.json";
import { mergeMessages, messagesFor } from "./catalogs";
import { CATALOG_LANGUAGES, LOCALES, type Locale } from "./locales";

/**
 * Austria's catalog is the German one with the Austrian overrides on top; the UK's the English
 * one with the UK's overrides; Czechia's the English one with the Czech texts on top; Spain's the
 * Spanish one with Spain's overrides; Italy's the Italian one with Italy's overrides; Germany's the
 * German one with Germany's overrides.
 */
const CATALOGS: Record<Locale, unknown> = {
	fr,
	en,
	de,
	es,
	it: it_,
	"de-AT": mergeMessages(de, at as Record<string, unknown>),
	"en-GB": mergeMessages(en, gb as Record<string, unknown>),
	"cs-CZ": mergeMessages(en, cz as Record<string, unknown>),
	"es-ES": mergeMessages(
		mergeMessages(en, es as Record<string, unknown>),
		esES as Record<string, unknown>,
	),
	"it-IT": mergeMessages(
		mergeMessages(en, it_ as Record<string, unknown>),
		itIT as Record<string, unknown>,
	),
	"de-DE": mergeMessages(
		mergeMessages(en, de as Record<string, unknown>),
		deDE as Record<string, unknown>,
	),
};

/** Every message of a catalog by its dotted key (array items are indexed). */
function flatten(tree: unknown, prefix = "", out = new Map<string, string>()) {
	if (typeof tree === "string") {
		out.set(prefix, tree);
	} else if (Array.isArray(tree)) {
		for (const [index, item] of tree.entries()) flatten(item, `${prefix}.${index}`, out);
	} else if (tree && typeof tree === "object") {
		for (const [key, value] of Object.entries(tree)) {
			flatten(value, prefix ? `${prefix}.${key}` : key, out);
		}
	}
	return out;
}

type Shape = {
	args: Set<string>;
	tags: Set<string>;
	plurals: { arg: string; options: string[] }[];
};

/** Arguments, rich-text tags and plural branches of an ICU message (nested ones included). */
function shapeOf(message: string): Shape {
	const shape: Shape = { args: new Set(), tags: new Set(), plurals: [] };
	const walk = (elements: MessageFormatElement[]) => {
		for (const element of elements) {
			if (element.type === TYPE.literal || element.type === TYPE.pound) continue;
			if (isTagElement(element)) {
				shape.tags.add(element.value);
				walk(element.children);
				continue;
			}
			shape.args.add(element.value);
			if (isPluralElement(element)) {
				shape.plurals.push({ arg: element.value, options: Object.keys(element.options) });
			}
			if (isPluralElement(element) || isSelectElement(element)) {
				for (const option of Object.values(element.options)) walk(option.value);
			}
		}
	};
	walk(parse(message, { ignoreTag: false }));
	return shape;
}

/** Gendered labels may take a `gender` argument the English source does not need. */
const GENDERED = /^taxonomy\.(profession|listing|practiceKind)\./;

const source = flatten(en);

describe.each(LOCALES)("the %s catalog", (locale) => {
	const target = flatten(CATALOGS[locale]);

	it("has exactly the keys of the English source catalog", () => {
		expect([...target.keys()].filter((key) => !source.has(key))).toEqual([]);
		expect([...source.keys()].filter((key) => !target.has(key))).toEqual([]);
	});

	it("keeps the arguments and rich-text tags of every message", () => {
		const mismatches: string[] = [];
		for (const [key, message] of target) {
			const reference = shapeOf(source.get(key) ?? "");
			const shape = shapeOf(message);
			const args = [...shape.args].filter((arg) => !(GENDERED.test(key) && arg === "gender"));
			if (
				args.sort().join() !== [...reference.args].sort().join() ||
				[...shape.tags].sort().join() !== [...reference.tags].sort().join()
			) {
				mismatches.push(key);
			}
		}
		expect(mismatches).toEqual([]);
	});

	it("gives every plural the forms its language selects", () => {
		const categories = new Intl.PluralRules(CATALOG_LANGUAGES[locale]).resolvedOptions()
			.pluralCategories;
		const short: string[] = [];
		for (const [key, message] of target) {
			for (const plural of shapeOf(message).plurals) {
				const missing = categories.filter((category) => !plural.options.includes(category));
				if (missing.length > 0) short.push(`${key} (${missing.join(", ")})`);
			}
		}
		expect(short).toEqual([]);
	});

	it("falls back to English for nothing: the merged catalog is the catalog", () => {
		expect(flatten(messagesFor(locale))).toEqual(target);
	});
});

describe("the Austrian overrides", () => {
	it("only override keys of the German catalog", () => {
		const german = flatten(de);
		expect([...flatten(at).keys()].filter((key) => !german.has(key))).toEqual([]);
	});
});

describe("the UK overrides", () => {
	it("only override keys of the English catalog", () => {
		const english = flatten(en);
		expect([...flatten(gb).keys()].filter((key) => !english.has(key))).toEqual([]);
	});
});

describe("the Czech texts", () => {
	it("only override keys of the English catalog", () => {
		const english = flatten(en);
		expect([...flatten(cz).keys()].filter((key) => !english.has(key))).toEqual([]);
	});

	it("name every Czech listing and profession in Czech", () => {
		const czech = flatten(cz);
		for (const slug of allCzListingSlugs()) {
			expect(czech.get(`taxonomy.listing.${slug}`), slug).toBeTruthy();
			expect(czech.get(`taxonomy.profession.${slug}`), slug).toBeTruthy();
		}
	});
});

describe("Spain's overrides", () => {
	it("only override keys of the Spanish catalog", () => {
		const spanish = flatten(es);
		expect([...flatten(esES).keys()].filter((key) => !spanish.has(key))).toEqual([]);
	});

	it("name every Spanish listing and kind of centre in Spanish, in every catalog", () => {
		for (const catalog of [es, en, fr, de, it_]) {
			const labels = flatten(catalog);
			for (const slug of allEsTaxonomySlugs()) {
				expect(labels.get(`taxonomy.profession.${slug}`), slug).toBeTruthy();
			}
		}
		const spanish = flatten(es);
		expect(spanish.get("taxonomy.listing.dentistas")).toBe("Dentistas");
		expect(spanish.get("taxonomy.profession.consultorio-local")).toBe("Consultorio local");
	});
});

describe("Italy's overrides", () => {
	it("only override keys of the Italian catalog", () => {
		const italian = flatten(it_);
		expect([...flatten(itIT).keys()].filter((key) => !italian.has(key))).toEqual([]);
	});

	it("name every Italian listing and kind of place in every catalog, in Italian in Italy's", () => {
		for (const catalog of [it_, en, fr, de, es]) {
			const labels = flatten(catalog);
			for (const slug of allItListingSlugs()) {
				expect(labels.get(`taxonomy.listing.${slug}`), slug).toBeTruthy();
				expect(labels.get(`taxonomy.profession.${slug}`), slug).toBeTruthy();
			}
		}
		const italian = flatten(it_);
		expect(italian.get("taxonomy.listing.farmacie")).toBe("Farmacie");
		expect(italian.get("taxonomy.profession.ospedali")).toBe("Ospedale");
	});
});

describe("Germany's overrides", () => {
	it("only override keys of the German catalog", () => {
		const german = flatten(de);
		expect([...flatten(deDE).keys()].filter((key) => !german.has(key))).toEqual([]);
	});

	it("name every German listing and kind of facility, in every catalog", () => {
		for (const catalog of [de, en, fr, es, it_]) {
			const labels = flatten(catalog);
			for (const slug of allDeTaxonomySlugs()) {
				expect(labels.get(`taxonomy.profession.${slug}`), slug).toBeTruthy();
			}
		}
		const german = flatten(de);
		expect(german.get("taxonomy.listing.krankenhaeuser")).toBe("Krankenhäuser");
		expect(german.get("taxonomy.profession.reha-klinik")).toBe("Reha-Klinik");
	});

	it("write Germany's legal pages in German and list every kind of facility", () => {
		const german = flatten(messagesFor("de-DE"));
		expect(german.get("ImpressumDe.title")).toBe("Impressum");
		expect(german.get("PrivacyDe.title")).toBe("Datenschutzerklärung");
		for (const code of DE_DEFAULT_PROFESSIONS) {
			expect(german.get(`DataDe.coverage.kinds.${code}`), code).toBeTruthy();
		}
		// France in German (`/fr-de`) and Austria (`/at`) keep their own texts.
		expect(flatten(messagesFor("de")).get("HomePage.title")).not.toBe(german.get("HomePage.title"));
		expect(flatten(messagesFor("de-AT")).get("HomePage.title")).toMatch(/Österreich/);
		expect(german.get("HomePage.title")).toMatch(/Deutschland/);
	});
});
