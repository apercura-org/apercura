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
import de from "../../messages/de.json";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import fr from "../../messages/fr.json";
import gb from "../../messages/gb.json";
import it_ from "../../messages/it.json";
import { mergeMessages, messagesFor } from "./catalogs";
import { CATALOG_LANGUAGES, LOCALES, type Locale } from "./locales";

/**
 * Austria's catalog is the German one with the Austrian overrides on top; the UK's the English
 * one with the UK's overrides.
 */
const CATALOGS: Record<Locale, unknown> = {
	fr,
	en,
	de,
	es,
	it: it_,
	"de-AT": mergeMessages(de, at as Record<string, unknown>),
	"en-GB": mergeMessages(en, gb as Record<string, unknown>),
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
