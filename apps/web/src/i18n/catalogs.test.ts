import {
	allChListingSlugs,
	allCyTaxonomySlugs,
	allCzListingSlugs,
	allDeTaxonomySlugs,
	allEeTaxonomySlugs,
	allEsTaxonomySlugs,
	allFiTaxonomySlugs,
	allIeListingSlugs,
	allItListingSlugs,
	allLtListingSlugs,
	allLvListingSlugs,
	allNoTaxonomySlugs,
	allPlListingSlugs,
	allSiListingSlugs,
	CY_DEFAULT_PROFESSIONS,
	allSeTaxonomySlugs,
	DE_DEFAULT_PROFESSIONS,
	EE_DEFAULT_PROFESSIONS,
	FI_DEFAULT_PROFESSIONS,
	IE_DEFAULT_PROFESSIONS,
	NO_DEFAULT_PROFESSIONS,
	PL_DEFAULT_PROFESSIONS,
	SE_DEFAULT_PROFESSIONS,
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
import cy from "../../messages/cy.json";
import cz from "../../messages/cz.json";
import de from "../../messages/de.json";
import deCH from "../../messages/de-CH.json";
import deDE from "../../messages/de-DE.json";
import ee from "../../messages/ee.json";
import en from "../../messages/en.json";
import enIE from "../../messages/en-IE.json";
import es from "../../messages/es.json";
import esES from "../../messages/es-ES.json";
import fi from "../../messages/fi.json";
import fr from "../../messages/fr.json";
import frCH from "../../messages/fr-CH.json";
import gb from "../../messages/gb.json";
import it_ from "../../messages/it.json";
import itCH from "../../messages/it-CH.json";
import itIT from "../../messages/it-IT.json";
import lt from "../../messages/lt.json";
import lv from "../../messages/lv.json";
import no from "../../messages/no.json";
import pl from "../../messages/pl.json";
import si from "../../messages/si.json";
import se from "../../messages/se.json";
import { mergeMessages, messagesFor, withoutEszett } from "./catalogs";
import { CATALOG_LANGUAGES, LOCALES, type Locale } from "./locales";

/**
 * Austria's catalog is the German one with the Austrian overrides on top; the UK's the English
 * one with the UK's overrides; Czechia's the English one with the Czech texts on top; Spain's the
 * Spanish one with Spain's overrides; Italy's the Italian one with Italy's overrides; Germany's the
 * German one with Germany's overrides;
 * Switzerland's the German, French and Italian ones with the Swiss texts on top, German without
 * "ß"; Estonia's the English one with the Estonian texts on top; Poland's the English one with the Polish texts on top, Norway's with the Norwegian ones; Lithuania's the English one with the Lithuanian texts on top, Cyprus's with the Greek ones; Latvia's the English one with the Latvian texts on top.
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
	"lt-LT": mergeMessages(en, lt as Record<string, unknown>),
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
	"de-CH": withoutEszett(
		mergeMessages(
			mergeMessages(en, de as Record<string, unknown>),
			deCH as Record<string, unknown>,
		),
	),
	"fr-CH": mergeMessages(
		mergeMessages(en, fr as Record<string, unknown>),
		frCH as Record<string, unknown>,
	),
	"it-CH": mergeMessages(
		mergeMessages(en, it_ as Record<string, unknown>),
		itCH as Record<string, unknown>,
	),
	"et-EE": mergeMessages(en, ee as Record<string, unknown>),
	"pl-PL": mergeMessages(en, pl as Record<string, unknown>),
	"nb-NO": mergeMessages(en, no as Record<string, unknown>),
	"en-IE": mergeMessages(en, enIE as Record<string, unknown>),
	"fi-FI": mergeMessages(en, fi as Record<string, unknown>),
	"sl-SI": mergeMessages(en, si as Record<string, unknown>),
	"el-CY": mergeMessages(en, cy as Record<string, unknown>),
	"lv-LV": mergeMessages(en, lv as Record<string, unknown>),
	"sv-SE": mergeMessages(en, se as Record<string, unknown>),
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

describe("the Polish texts", () => {
	it("only override keys of the English catalog", () => {
		const english = flatten(en);
		expect([...flatten(pl).keys()].filter((key) => !english.has(key))).toEqual([]);
	});

	it("name every Polish listing and kind of establishment, in Polish and in every catalog", () => {
		for (const catalog of [pl, en, fr, de, es, it_]) {
			const labels = flatten(catalog);
			for (const slug of allPlListingSlugs()) {
				expect(labels.get(`taxonomy.listing.${slug}`), slug).toBeTruthy();
				expect(labels.get(`taxonomy.profession.${slug}`), slug).toBeTruthy();
			}
		}
		const polish = flatten(pl);
		expect(polish.get("taxonomy.listing.szpitale")).toBe("Szpitale");
		expect(polish.get("taxonomy.profession.poradnie-kardiologiczne")).toBe(
			"Poradnia kardiologiczna",
		);
	});

	it("write Poland's legal pages in Polish and list every kind of establishment", () => {
		const polish = flatten(messagesFor("pl-PL"));
		expect(polish.get("LegalNoticePl.title")).toBe("Nota prawna");
		expect(polish.get("PrivacyPl.title")).toBe("Polityka prywatności");
		expect(polish.get("TermsPl.title")).toBe("Regulamin");
		expect(polish.get("AccessibilityPl.title")).toBe("Deklaracja dostępności");
		expect(polish.get("DataPl.title")).toBe("Dane i źródła");
		for (const code of PL_DEFAULT_PROFESSIONS) {
			expect(polish.get(`DataPl.coverage.kinds.${code}`), code).toBeTruthy();
		}
		// The supervisory authority's current address, not its former one.
		expect(polish.get("PrivacyPl.sections.rights.body.1")).toContain("Moniuszki 1A");
	});
});

describe("the Finnish texts", () => {
	it("only override keys of the English catalog", () => {
		const english = flatten(en);
		expect([...flatten(fi).keys()].filter((key) => !english.has(key))).toEqual([]);
	});

	it("name every Finnish listing and kind of location, in Finnish and in every catalog", () => {
		for (const catalog of [fi, en, fr, de, es, it_]) {
			const labels = flatten(catalog);
			for (const slug of allFiTaxonomySlugs()) {
				expect(labels.get(`taxonomy.profession.${slug}`), slug).toBeTruthy();
			}
		}
		const finnish = flatten(fi);
		expect(finnish.get("taxonomy.listing.terveysasemat")).toBe("Terveysasemat");
		expect(finnish.get("taxonomy.profession.terveysasema")).toBe("Terveysasema");
	});

	it("write Finland's legal pages in Finnish and list every kind of location", () => {
		const finnish = flatten(messagesFor("fi-FI"));
		const english = flatten(en);
		for (const key of [
			"LegalNoticeFi.title",
			"PrivacyFi.title",
			"TermsFi.title",
			"AccessibilityFi.title",
			"DataFi.title",
		]) {
			expect(finnish.get(key), key).toBeTruthy();
			expect(finnish.get(key), key).not.toBe(english.get(key));
		}
		for (const code of FI_DEFAULT_PROFESSIONS) {
			expect(finnish.get(`DataFi.coverage.kinds.${code}`), code).toBeTruthy();
		}
		expect(finnish.get("HomePage.title")).not.toBe(english.get("HomePage.title"));
	});
});

describe("the Lithuanian texts", () => {
	it("only override keys of the English catalog", () => {
		const english = flatten(en);
		expect([...flatten(lt).keys()].filter((key) => !english.has(key))).toEqual([]);
	});

	it("name every Lithuanian listing and kind of institution, in Lithuanian and in every catalog", () => {
		const lithuanian = flatten(lt);
		for (const slug of allLtListingSlugs()) {
			expect(lithuanian.get(`taxonomy.listing.${slug}`), slug).toBeTruthy();
			expect(lithuanian.get(`taxonomy.profession.${slug}`), slug).toBeTruthy();
			for (const catalog of [en, fr, de, es, it_]) {
				expect(flatten(catalog).get(`taxonomy.listing.${slug}`), slug).toBeTruthy();
			}
		}
		expect(lithuanian.get("taxonomy.listing.ligonines")).toBe("Ligoninės");
		expect(lithuanian.get("taxonomy.profession.odontologijos-klinikos")).toBe(
			"Odontologijos klinika",
		);
	});

	it("write Lithuania's legal pages in Lithuanian", () => {
		const lithuanian = flatten(messagesFor("lt-LT"));
		for (const namespace of [
			"LegalNoticeLt",
			"PrivacyLt",
			"TermsLt",
			"AccessibilityLt",
			"DataLt",
		]) {
			const title = lithuanian.get(`${namespace}.title`);
			expect(title, namespace).toBeTruthy();
			expect(title, namespace).not.toBe(flatten(en).get(`${namespace}.title`));
		}
		expect([...lithuanian.values()].join(" ")).toContain("Valstybinė duomenų apsaugos inspekcija");
	});
});

describe("the Latvian texts", () => {
	it("only override keys of the English catalog", () => {
		const english = flatten(en);
		expect([...flatten(lv).keys()].filter((key) => !english.has(key))).toEqual([]);
	});

	it("name every Latvian listing and kind of place in Latvian, and in every catalog", () => {
		const latvian = flatten(lv);
		for (const slug of allLvListingSlugs()) {
			expect(latvian.get(`taxonomy.listing.${slug}`), slug).toBeTruthy();
			expect(latvian.get(`taxonomy.profession.${slug}`), slug).toBeTruthy();
			for (const catalog of [en, fr, de, es, it_]) {
				expect(flatten(catalog).get(`taxonomy.listing.${slug}`), slug).toBeTruthy();
			}
		}
	});

	it("write Latvia's legal pages, and what a Latvian page prints, in Latvian", () => {
		const latvian = flatten(lv);
		for (const namespace of [
			"LegalNoticeLv",
			"PrivacyLv",
			"TermsLv",
			"AccessibilityLv",
			"DataLv",
		]) {
			const english = [...source.keys()].filter((key) => key.startsWith(`${namespace}.`));
			expect(english.length, namespace).toBeGreaterThan(0);
			expect(english.filter((key) => !latvian.has(key))).toEqual([]);
		}
		for (const key of [
			"PractitionerPage.latvianFacts.gps",
			"PractitionerPage.latvianFacts.pharmacyType",
			"PractitionerPage.professionHeading",
			"PractitionerPage.action.callNotYetOpen",
			"Listing.gpCoverage",
			"Listing.title",
			"HomePage.title",
			"SearchPage.notCoveredTitle",
			"Search.markets.LV",
			"Gdpr.removal.title",
		]) {
			if (source.has(key)) expect(latvian.get(key), key).toBeTruthy();
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
describe("Switzerland's texts", () => {
	it("only override keys of the German, French and Italian catalogs", () => {
		for (const [overrides, base] of [
			[deCH, de],
			[frCH, fr],
			[itCH, it_],
		] as const) {
			const keys = flatten(base);
			expect([...flatten(overrides).keys()].filter((key) => !keys.has(key))).toEqual([]);
		}
	});

	it("write Swiss Standard German: never an ß, in the German texts or the Swiss ones", () => {
		expect([...flatten(deCH).values()].filter((message) => message.includes("ß"))).toEqual([]);
		const swiss = flatten(messagesFor("de-CH"));
		expect([...swiss.values()].filter((message) => message.includes("ß"))).toEqual([]);
		// The German catalog keeps its ß for Austria and France in German.
		expect([...flatten(messagesFor("de-AT")).values()].some((m) => m.includes("ß"))).toBe(true);
		expect(
			withoutEszett({ street: "Hauptstraße", list: ["groß", 1], nested: { foot: "Fuß" } }),
		).toEqual({ street: "Hauptstrasse", list: ["gross", 1], nested: { foot: "Fuss" } });
	});

	it("name every Swiss listing and kind of facility in every catalog", () => {
		for (const catalog of [de, en, fr, it_, es]) {
			const labels = flatten(catalog);
			for (const slug of allChListingSlugs()) {
				expect(labels.get(`taxonomy.listing.${slug}`), slug).toBeTruthy();
				expect(labels.get(`taxonomy.profession.${slug}`), slug).toBeTruthy();
			}
		}
		expect(messagesFor("de-CH").taxonomy.profession.spital).toBe("Spital");
		expect(messagesFor("fr-CH").taxonomy.profession.spital).toBe("Hôpital");
		expect(messagesFor("it-CH").taxonomy.profession.spital).toBe("Ospedale");
	});

	it("give Italian-speaking Switzerland its own texts, not Italy's", () => {
		expect(messagesFor("it-CH").Metadata.homeTitle).not.toBe(
			messagesFor("it-IT").Metadata.homeTitle,
		);
		expect(JSON.stringify(itCH)).not.toMatch(/Ministero della Salute|Istat|provinc/i);
	});
});

describe("the Estonian texts", () => {
	it("only override keys of the English catalog", () => {
		const english = flatten(en);
		expect([...flatten(ee).keys()].filter((key) => !english.has(key))).toEqual([]);
	});

	it("name every Estonian listing and kind of provider, in every catalog and in Estonian", () => {
		for (const catalog of [en, fr, de, es, it_, ee]) {
			const labels = flatten(catalog);
			for (const slug of allEeTaxonomySlugs()) {
				expect(labels.get(`taxonomy.profession.${slug}`), slug).toBeTruthy();
			}
		}
		const estonian = flatten(ee);
		expect(estonian.get("taxonomy.listing.apteegid")).toBe("Apteegid");
		expect(estonian.get("taxonomy.profession.perearstikeskus")).toBe("Perearstikeskus");
	});

	it("write Estonia's legal pages in Estonian and list every kind of provider", () => {
		const estonian = flatten(messagesFor("et-EE"));
		const english = flatten(en);
		for (const key of ["LegalNoticeEe.title", "PrivacyEe.title", "DataEe.title"]) {
			expect(estonian.get(key), key).toBeTruthy();
			expect(estonian.get(key), key).not.toBe(english.get(key));
		}
		for (const code of EE_DEFAULT_PROFESSIONS) {
			expect(estonian.get(`DataEe.coverage.kinds.${code}`), code).toBeTruthy();
		}
		expect(estonian.get("HomePage.title")).not.toBe(english.get("HomePage.title"));
	});
});

describe("the Norwegian texts", () => {
	it("only override keys of the English catalog", () => {
		const english = flatten(en);
		expect([...flatten(no).keys()].filter((key) => !english.has(key))).toEqual([]);
	});

	it("name every Norwegian listing and kind of establishment, in every catalog and in Norwegian", () => {
		for (const catalog of [en, fr, de, es, it_, no]) {
			const labels = flatten(catalog);
			for (const slug of allNoTaxonomySlugs()) {
				expect(labels.get(`taxonomy.profession.${slug}`), slug).toBeTruthy();
			}
		}
		const norwegian = flatten(no);
		expect(norwegian.get("taxonomy.listing.legekontorer")).toBe("Legekontorer");
		expect(norwegian.get("taxonomy.profession.legekontor")).toBe("Legekontor");
		expect(norwegian.get("taxonomy.listing.apotek")).toBe("Apotek");
	});

	it("write Norway's legal pages in Norwegian and list every kind of establishment", () => {
		const norwegian = flatten(messagesFor("nb-NO"));
		const english = flatten(en);
		for (const key of ["LegalNoticeNo.title", "PrivacyNo.title", "DataNo.title", "TermsNo.title"]) {
			expect(norwegian.get(key), key).toBeTruthy();
			expect(norwegian.get(key), key).not.toBe(english.get(key));
		}
		for (const code of NO_DEFAULT_PROFESSIONS) {
			expect(norwegian.get(`DataNo.coverage.kinds.${code}`), code).toBeTruthy();
		}
		expect(norwegian.get("HomePage.title")).not.toBe(english.get("HomePage.title"));
		// The register's credit names the licence, as NLOD 2.0 asks.
		expect(norwegian.get("DataNo.licence.licenceLink")).toMatch(/NLOD 2\.0/);
	});
});

describe("Ireland's overrides", () => {
	it("only override keys of the English catalog", () => {
		const english = flatten(en);
		expect([...flatten(enIE).keys()].filter((key) => !english.has(key))).toEqual([]);
	});

	it("name every Irish listing and kind of facility in every catalog", () => {
		for (const catalog of [de, en, fr, it_, es]) {
			const labels = flatten(catalog);
			for (const slug of allIeListingSlugs()) {
				expect(labels.get(`taxonomy.listing.${slug}`), slug).toBeTruthy();
				expect(labels.get(`taxonomy.profession.${slug}`), slug).toBeTruthy();
			}
		}
		expect(messagesFor("en-IE").taxonomy.listing.pharmacy).toBe("Pharmacies");
		expect(messagesFor("fr").taxonomy.listing.pharmacy).toBe("Pharmacies");
	});

	it("write Ireland's pages in Irish English, not the UK's, with every kind on the data page", () => {
		const irish = flatten(messagesFor("en-IE"));
		expect(irish.get("HomePage.title")).toMatch(/Ireland/);
		expect(irish.get("HomePage.title")).not.toBe(
			flatten(messagesFor("en-GB")).get("HomePage.title"),
		);
		expect(JSON.stringify(enIE)).not.toMatch(/\bNHS\b|United Kingdom|\bODS\b/);
		expect(irish.get("LegalNoticeIe.title")).toBe("Legal notice");
		for (const code of IE_DEFAULT_PROFESSIONS) {
			expect(irish.get(`DataIe.coverage.kinds.${code}`), code).toBeTruthy();
		}
		// The PSI's condition on advertising, word for word.
		expect(irish.get("DataIe.sources.conditions.0")).toContain(
			"“Not use the information for the principal purpose of advertising or promoting a particular product or service”",
		);
		// The privacy notice never names a host, and keeps the data in the EEA.
		expect(irish.get("PrivacyIe.sections.transfers.body.0")).toContain("European Economic Area");
	});
});

describe("the Slovenian texts", () => {
	it("only override keys of the English catalog", () => {
		const english = flatten(en);
		expect([...flatten(si).keys()].filter((key) => !english.has(key))).toEqual([]);
	});

	it("name every Slovenian listing and kind of doctor in Slovenian, and in every catalog", () => {
		const slovenian = flatten(si);
		for (const slug of allSiListingSlugs()) {
			expect(slovenian.get(`taxonomy.listing.${slug}`), slug).toBeTruthy();
			expect(slovenian.get(`taxonomy.profession.${slug}`), slug).toBeTruthy();
			for (const catalog of [en, fr, de, es, it_]) {
				expect(flatten(catalog).get(`taxonomy.listing.${slug}`), slug).toBeTruthy();
			}
		}
		expect(messagesFor("sl-SI").taxonomy.listing.zobozdravnik).toBe("Zobozdravniki");
	});

	it("say in Slovenian whether a doctor takes new patients, as the insurer's list does", () => {
		const page = messagesFor("sl-SI").PractitionerPage.slovenia;
		expect(page.accepts).not.toBe(messagesFor("en").PractitionerPage.slovenia.accepts);
		expect(page.asOf).toContain("{date}");
		expect(JSON.stringify(si)).not.toMatch(/ÚZIS|ČÚZK|Ministerstvo zdravotnictví|Národní registr/);
	});
});

describe("the Greek texts", () => {
	it("only override keys of the English catalog", () => {
		const english = flatten(en);
		expect([...flatten(cy).keys()].filter((key) => !english.has(key))).toEqual([]);
	});

	it("name every Cypriot listing and kind of facility, in every catalog and in Greek", () => {
		for (const catalog of [en, fr, de, es, it_, cy]) {
			const labels = flatten(catalog);
			for (const slug of allCyTaxonomySlugs()) {
				expect(labels.get(`taxonomy.profession.${slug}`), slug).toBeTruthy();
			}
		}
		const greek = flatten(cy);
		expect(greek.get("taxonomy.listing.farmakeia")).toBe("Φαρμακεία");
		expect(greek.get("taxonomy.listing.kentra-ygeias")).toBe("Κέντρα Υγείας");
		expect(greek.get("taxonomy.profession.nosokomeio")).toBe("Νοσοκομείο");
		expect(greek.get("ErrorPages.notFound.title")).toBe("Η σελίδα δεν υπάρχει");
		expect(greek.get("Search.submit")).toBe("Αναζήτηση");
	});

	it("write Cyprus's legal pages in Greek and list every kind of facility", () => {
		const greek = flatten(messagesFor("el-CY"));
		const english = flatten(en);
		for (const key of [
			"LegalNoticeCy.title",
			"PrivacyCy.title",
			"DataCy.title",
			"TermsCy.title",
			"AccessibilityCy.title",
		]) {
			expect(greek.get(key), key).toBeTruthy();
			expect(greek.get(key), key).not.toBe(english.get(key));
		}
		for (const code of CY_DEFAULT_PROFESSIONS) {
			expect(greek.get(`DataCy.coverage.kinds.${code}`), code).toBeTruthy();
			expect(english.get(`DataCy.coverage.kinds.${code}`), code).toBeTruthy();
		}
		expect(greek.get("HomePage.title")).not.toBe(english.get("HomePage.title"));
		// The lists' credit names their licence, as CC BY 4.0 asks.
		expect(greek.get("DataCy.licence.licenceLink")).toMatch(/CC BY 4\.0/);
		// The privacy notice names the Cypriot supervisory authority and law.
		expect(greek.get("PrivacyCy.authorityAddress")).toMatch(/Ιάσονος 1, 1082 Λευκωσία/);
		expect(english.get("PrivacyCy.lead")).toMatch(/125\(I\)\/2018/);
	});

	it("say the north is not covered and claim no hosting certification", () => {
		const greek = flatten(messagesFor("el-CY"));
		expect(greek.get("DataCy.coverage.body.1")).toMatch(/δεν ασκεί πραγματικό έλεγχο/);
		expect(flatten(en).get("DataCy.coverage.body.1")).toMatch(
			/does not exercise effective control/,
		);
		// No hosting certification claimed, no hosting place named.
		for (const [key, value] of flatten(cy)) {
			if (key.startsWith("HomePage.pillars")) expect(value, key).not.toMatch(/HDS/);
		}
	});
});

describe("Sweden's texts", () => {
	it("only override keys of the English catalog", () => {
		const english = flatten(en);
		expect([...flatten(se).keys()].filter((key) => !english.has(key))).toEqual([]);
	});

	it("name every Swedish listing and kind of facility, in every catalog and in Swedish", () => {
		for (const catalog of [en, fr, de, es, it_, se]) {
			const labels = flatten(catalog);
			for (const slug of allSeTaxonomySlugs()) {
				expect(labels.get(`taxonomy.profession.${slug}`), slug).toBeTruthy();
			}
			expect(labels.get("taxonomy.listing.apoteken")).toBeTruthy();
			expect(labels.get("taxonomy.listing.vardcentraler")).toBeTruthy();
		}
		const swedish = flatten(se);
		expect(swedish.get("taxonomy.listing.apoteken")).toBe("Apotek");
		expect(swedish.get("taxonomy.listing.vardcentraler")).toBe("Vårdcentraler");
		expect(swedish.get("taxonomy.profession.oppenvardsapotek")).toBe("Öppenvårdsapotek");
	});

	it("write Sweden's legal pages in Swedish, list every kind and say where health centres are listed", () => {
		const swedish = flatten(messagesFor("sv-SE"));
		const english = flatten(en);
		for (const key of [
			"LegalNoticeSe.title",
			"PrivacySe.title",
			"TermsSe.title",
			"AccessibilitySe.title",
			"DataSe.title",
		]) {
			expect(swedish.get(key), key).toBeTruthy();
			expect(swedish.get(key), key).not.toBe(english.get(key));
		}
		for (const code of SE_DEFAULT_PROFESSIONS) {
			expect(swedish.get(`DataSe.coverage.kinds.${code}`), code).toBeTruthy();
			expect(english.get(`DataSe.coverage.kinds.${code}`), code).toBeTruthy();
		}
		expect(swedish.get("HomePage.title")).not.toBe(english.get("HomePage.title"));
		// Pharmacies everywhere, health centres in Västra Götaland only: said on the home and the data page.
		expect(swedish.get("HomePage.registry.intro")).toMatch(/Västra Götaland/);
		expect(swedish.get("DataSe.coverage.body.0")).toMatch(/Västra Götaland/);
		// The pharmacies' credit names the licence, as CC BY 4.0 asks; IMY is the authority.
		expect(swedish.get("DataSe.licence.licenceLink")).toMatch(/CC BY 4\.0/);
		expect(swedish.get("PrivacySe.authorityLink")).toMatch(/IMY/);
		// The privacy notice never names a host, and keeps the data in the EEA.
		expect(swedish.get("PrivacySe.sections.recipients.body.0")).toContain(
			"Europeiska ekonomiska samarbetsområdet",
		);
	});
});
