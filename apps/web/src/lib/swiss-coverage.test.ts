import { CH_CANTONS, CH_LIST_CANTONS } from "@apercura/core/country";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { messagesFor } from "~/i18n/catalogs";
import {
	NO_SWISS_COVERAGE,
	type SwissCoverage,
	type SwissCoverageRow,
	shapeSwissCoverage,
	swissCoverageTexts,
} from "./swiss-coverage";

/** The registries of the synthetic fixtures' published facilities, as the query returns them. */
const FIXTURES: SwissCoverageRow[] = [
	{ registry: "ch-bag-kzp", professionCode: "CH_HOSPITAL" },
	{ registry: "ch-bag-kzp", professionCode: "CH_PSYCHIATRIC_CLINIC" },
	// Hospital lists: credited on a FOPH site (`quelle`) or with pages of their own.
	{ registry: "ch-be-spitaeler", professionCode: "CH_HOSPITAL" },
	{ registry: "ch-ge-hopitaux", professionCode: "CH_HOSPITAL" },
	{ registry: "ch-ge-hopitaux", professionCode: "CH_SPECIALTY_CLINIC" },
	{ registry: "ch-bs-spitaeler", professionCode: "CH_HOSPITAL" },
	{ registry: "ch-ju-institutions", professionCode: "CH_HOSPITAL" },
	{ registry: "ch-zh-heime", professionCode: "CH_NURSING_HOME" },
	{ registry: "ch-be-heime", professionCode: "CH_NURSING_HOME" },
	{ registry: "ch-ge-ems", professionCode: "CH_NURSING_HOME" },
	{ registry: "ch-bs-heime", professionCode: "CH_NURSING_HOME" },
	{ registry: "ch-bl-heime", professionCode: "CH_NURSING_HOME" },
	{ registry: "ch-ju-institutions", professionCode: "CH_NURSING_HOME" },
	{ registry: "ch-ge-pharmacies", professionCode: "CH_PHARMACY" },
	{ registry: "ch-bl-apotheken", professionCode: "CH_PHARMACY" },
];

/** The same directory after runs that could not read Geneva's lists (or turned them off). */
const WITHOUT_GENEVA = FIXTURES.filter((row) => !row.registry.startsWith("ch-ge-"));

const texts = (locale: "de-CH" | "fr-CH" | "it-CH", coverage: SwissCoverage) =>
	swissCoverageTexts(
		createTranslator({ locale, messages: messagesFor(locale), namespace: "SwissCoverage" }),
		locale,
		coverage,
	);

const everyText = (coverage: SwissCoverage, locale: "de-CH" | "fr-CH" | "it-CH") => {
	const all = texts(locale, coverage);
	return [
		all.hook,
		...all.summary,
		all.unlisted,
		all.listing("spital"),
		all.listing("pflegeheim"),
		all.listing("apotheke"),
	].join("\n");
};

describe("Switzerland's coverage", () => {
	it("names each kind's cantons from the lists of the published facilities, in the Constitution's order", () => {
		expect(shapeSwissCoverage(FIXTURES)).toEqual({
			hospitalLists: ["BE", "BS", "GE", "JU"],
			nursingHomes: ["ZH", "BE", "BS", "BL", "GE", "JU"],
			pharmacies: ["BL", "GE"],
			registries: [
				"ch-bag-kzp",
				"ch-be-heime",
				"ch-be-spitaeler",
				"ch-bl-apotheken",
				"ch-bl-heime",
				"ch-bs-heime",
				"ch-bs-spitaeler",
				"ch-ge-ems",
				"ch-ge-hopitaux",
				"ch-ge-pharmacies",
				"ch-ju-institutions",
				"ch-zh-heime",
			],
		});
		// The FOPH's figures are every canton's: they never name one.
		expect(shapeSwissCoverage([{ registry: "ch-bag-kzp", professionCode: "CH_HOSPITAL" }])).toEqual(
			{ ...NO_SWISS_COVERAGE, registries: ["ch-bag-kzp"] },
		);
		expect(shapeSwissCoverage([])).toEqual(NO_SWISS_COVERAGE);
	});

	it("says what the fixtures cover, Geneva included, in Switzerland's three languages", () => {
		const coverage = shapeSwissCoverage(FIXTURES);
		const fr = texts("fr-CH", coverage);
		expect(fr.hook).toBe(
			"Chaque hôpital et chaque clinique de Suisse a déjà sa page, de même que les EMS des cantons de Zurich, de Berne, de Bâle-Ville, de Bâle-Campagne, de Genève et du Jura et les pharmacies des cantons de Bâle-Campagne et de Genève.",
		);
		expect(fr.summary).toEqual([
			"Hôpitaux et cliniques : tous les cantons, d’après les chiffres-clés des hôpitaux suisses 2023 de l’Office fédéral de la santé publique (OFSP) et les listes d’hôpitaux des cantons de Berne, de Bâle-Ville, de Genève et du Jura.",
			"EMS : seulement les cantons de Zurich, de Berne, de Bâle-Ville, de Bâle-Campagne, de Genève et du Jura.",
			"Pharmacies : seulement les cantons de Bâle-Campagne (toutes les pharmacies) et de Genève (seulement celles qui vaccinent).",
		]);
		expect(fr.listing("apotheke")).toBe(
			"Les pharmacies ne sont listées que pour les cantons de Bâle-Campagne (toutes les pharmacies) et de Genève (seulement celles qui vaccinent) : celles des autres cantons ne le sont pas encore.",
		);
		const de = texts("de-CH", coverage);
		expect(de.hook).toBe(
			"Jedes Spital und jede Klinik der Schweiz hat schon eine Seite, ebenso die Alters- und Pflegeheime der Kantone Zürich, Bern, Basel-Stadt, Basel-Landschaft, Genf und Jura und die Apotheken der Kantone Basel-Landschaft und Genf.",
		);
		expect(de.listing("pflegeheim")).toBe(
			"Alters- und Pflegeheime sind nur für die Kantone Zürich, Bern, Basel-Stadt, Basel-Landschaft, Genf und Jura aufgeführt: Die Heime der anderen Kantone sind noch nicht erfasst.",
		);
		expect(de.listing("spital")).toBe(
			"Spitäler und Kliniken sind in allen Kantonen aufgeführt, aus den Kennzahlen der Schweizer Spitäler 2023 des Bundesamts für Gesundheit und den Spitallisten der Kantone Bern, Basel-Stadt, Genf und Jura.",
		);
		const it_ = texts("it-CH", coverage);
		expect(it_.summary[1]).toBe(
			"Case per anziani: solo i Cantoni Zurigo, Berna, Basilea Città, Basilea Campagna, Ginevra e Giura.",
		);
		expect(it_.unlisted).toMatch(
			/^In Svizzera l’elenco comprende per ora strutture, mai persone: gli ospedali e le cliniche di tutti i Cantoni, le case per anziani dei Cantoni Zurigo, .* e Giura e le farmacie dei Cantoni Basilea Campagna e Ginevra\. Medici/,
		);
	});

	it("never claims Geneva when none of its lists is published, and keeps the other cantons", () => {
		const coverage = shapeSwissCoverage(WITHOUT_GENEVA);
		expect(coverage.pharmacies).toEqual(["BL"]);
		for (const locale of ["de-CH", "fr-CH", "it-CH"] as const) {
			const all = everyText(coverage, locale);
			expect(all).not.toMatch(/Genf|Genève|Ginevra/);
			expect(all).toMatch(/Basel-Landschaft|Bâle-Campagne|Basilea Campagna/);
		}
		const fr = texts("fr-CH", coverage);
		// One canton: the singular, with its list's note.
		expect(fr.summary[2]).toBe(
			"Pharmacies : seulement le canton de Bâle-Campagne (toutes les pharmacies).",
		);
		expect(fr.hook).toContain("et les pharmacies du canton de Bâle-Campagne.");
		expect(texts("de-CH", coverage).listing("apotheke")).toBe(
			"Apotheken sind nur für den Kanton Basel-Landschaft (alle Apotheken) aufgeführt: Die Apotheken der anderen Kantone sind noch nicht erfasst.",
		);
	});

	it("claims no canton at all before the first import", () => {
		const de = texts("de-CH", NO_SWISS_COVERAGE);
		expect(de.hook).toBe("Jedes Spital und jede Klinik der Schweiz hat schon eine Seite.");
		expect(de.summary).toEqual([
			"Spitäler und Kliniken: alle Kantone, aus den Kennzahlen der Schweizer Spitäler 2023 des Bundesamts für Gesundheit (BAG).",
			"Alters- und Pflegeheime: noch keine aufgeführt.",
			"Apotheken: noch keine aufgeführt.",
		]);
		expect(de.unlisted).toMatch(/: die Spitäler und Kliniken aller Kantone\. Ärztinnen/);
		expect(texts("fr-CH", NO_SWISS_COVERAGE).listing("pflegeheim")).toBe(
			"Aucun EMS n’est encore listé : aucune liste cantonale n’a encore été importée.",
		);
		expect(texts("it-CH", NO_SWISS_COVERAGE).listing("rehaklinik")).toBe(
			"Gli ospedali e le cliniche sono elencati in tutti i Cantoni, secondo le cifre chiave 2023 degli ospedali dell’Ufficio federale della sanità pubblica.",
		);
	});

	it("names every canton a list can come from, in every Swiss language", () => {
		for (const locale of ["de-CH", "fr-CH", "it-CH"] as const) {
			const names = messagesFor(locale).SwissCoverage.cantons as Record<string, string>;
			expect(Object.keys(names).sort()).toEqual(Object.keys(CH_CANTONS).sort());
			for (const canton of Object.values(CH_LIST_CANTONS)) expect(names[canton]).toBeTruthy();
		}
	});
});
