import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { messagesFor } from "~/i18n/catalogs";
import type { Locale } from "~/i18n/locales";
import de from "../../messages/de.json";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import fr from "../../messages/fr.json";
import it_ from "../../messages/it.json";
import { inSentence } from "./labels";

const CATALOGS = {
	fr,
	en,
	de,
	es,
	it: it_,
	"de-AT": messagesFor("de-AT"),
	"en-GB": messagesFor("en-GB"),
	"cs-CZ": messagesFor("cs-CZ"),
	"es-ES": messagesFor("es-ES"),
	"it-IT": messagesFor("it-IT"),
} as const;

/** A label of the catalog's taxonomy, rendered like `getTaxonomyLabels` does. */
function listing(locale: Locale, slug: string, gender: "female" | "male" = "female") {
	const t = createTranslator({ locale, messages: CATALOGS[locale], namespace: "taxonomy" });
	return t(`listing.${slug}` as never, { gender } as never);
}

function translate(locale: Locale, namespace: "PractitionerPage" | "Listing") {
	return createTranslator({ locale, messages: CATALOGS[locale], namespace });
}

describe("inSentence", () => {
	it.each([
		["fr", "Cardiologue", "cardiologue"],
		["fr", "Médecin généraliste", "médecin généraliste"],
		["fr", "ORL", "ORL"],
		["en", "Cardiologist", "cardiologist"],
		["en", "General practitioner", "general practitioner"],
		["en", "ENT specialist", "ENT specialist"],
		["de", "Kardiologin", "Kardiologin"],
		["de", "Allgemeinmedizinerin", "Allgemeinmedizinerin"],
		["de", "HNO-Ärztin", "HNO-Ärztin"],
		["es", "Cardióloga", "cardióloga"],
		["es", "Médica de familia", "médica de familia"],
		["it", "Cardiologa", "cardiologa"],
		["it", "Otorinolaringoiatra", "otorinolaringoiatra"],
		["fr", "Épithésiste", "épithésiste"],
		["fr", "", ""],
	] as const)("%s: %j inside a sentence is %j", (locale, label, expected) => {
		expect(inSentence(label, locale)).toBe(expected);
	});
});

describe("titles and descriptions that embed a profession", () => {
	const name = "Dr Hélène Aelion";
	const place = "Paris 16e";

	it.each([
		["fr", "Dr Hélène Aelion, cardiologue à Paris 16e · Apercura"],
		["en", "Dr Hélène Aelion, cardiologist in Paris 16e · Apercura"],
		["de", "Dr Hélène Aelion, Kardiologin in Paris 16e · Apercura"],
		["es", "Dr Hélène Aelion, cardióloga en Paris 16e · Apercura"],
		["it", "Dr Hélène Aelion, cardiologa a Paris 16e · Apercura"],
	] as const)("practitioner title in %s", (locale, expected) => {
		const occupation = inSentence(listing(locale, "cardiologue"), locale);
		expect(
			translate(locale, "PractitionerPage")("metaTitlePlace", { name, occupation, place }),
		).toBe(expected);
	});

	it.each([
		["fr", "Autres praticiens : cardiologue à Paris 16e"],
		["en", "Other practitioners: cardiologist in Paris 16e"],
		["de", "Weitere Gesundheitsfachkräfte: Kardiologin in Paris 16e"],
		["es", "Otros profesionales sanitarios: cardióloga en Paris 16e"],
		["it", "Altri professionisti: cardiologa a Paris 16e"],
	] as const)("heading of the other practitioners in %s", (locale, expected) => {
		const occupation = inSentence(listing(locale, "cardiologue"), locale);
		expect(translate(locale, "PractitionerPage")("ring.heading", { occupation, place })).toBe(
			expected,
		);
	});

	it.each([
		["fr", "Cardiologue à Paris 16e", "comme cardiologue à Paris 16e"],
		["en", "Cardiologist in Paris 16e", "as cardiologist in Paris 16e"],
		["de", "Kardiologe in Paris 16e", "als Kardiologe in Paris 16e"],
		["es", "Cardiólogo en Paris 16e", "como cardiólogo en Paris 16e"],
		["it", "Cardiologo a Paris 16e", "come cardiologo a Paris 16e"],
	] as const)("listing heading and description in %s", (locale, title, fragment) => {
		const label = listing(locale, "cardiologue", "male");
		const t = translate(locale, "Listing");
		// A heading starts with the label: capitalized in every language.
		expect(t("title", { listing: label, place })).toBe(title);
		const values = {
			listing: label,
			occupation: inSentence(label, locale),
			place,
			count: 12,
			fees: "sector",
		};
		expect(t("metaDescription", values)).toContain(fragment);
		expect(t("establishmentsIntro", values)).toContain(
			locale === "de" ? "als Kardiologe" : inSentence(label, locale),
		);
	});
});

describe("fees of professions without sectors", () => {
	const name = "Pauline Soignante";
	const place = "Paris 15e";

	it.each([
		["fr", "secteur de conventionnement", "conventionnement"],
		["en", "agreement sector", "fee agreement"],
		["de", "Tarifsektor", "Kassenvertrag"],
		["es", "sector de tarifas", "convenio de honorarios"],
		["it", "settore tariffario", "convenzione tariffaria"],
	] as const)(
		"a nurse's page description in %s names the agreement, not a sector",
		(locale, sector, agreement) => {
			const t = translate(locale, "PractitionerPage");
			const occupation = inSentence(listing(locale, "infirmier"), locale);
			const values = { name, occupation, place };
			expect(t("metaDescriptionPlace", { ...values, fees: "sector" })).toContain(sector);
			const nurse = t("metaDescriptionPlace", { ...values, fees: "other" });
			expect(nurse).toContain(agreement);
			expect(nurse).not.toContain(sector);
			const listingT = translate(locale, "Listing");
			const listingValues = { occupation, place, count: 3, fees: "other" };
			expect(listingT("metaDescription", listingValues)).not.toContain(sector);
			expect(listingT("hubMetaDescription", listingValues)).not.toContain(sector);
		},
	);

	it.each(["fr", "en", "de", "es", "it"] as const)(
		"labels a contracted nurse without a sector in %s",
		(locale) => {
			const t = createTranslator({ locale, messages: CATALOGS[locale], namespace: "taxonomy" });
			expect(t("billingAgreement.1")).not.toBe(t("billingSector.1"));
			expect(t("billingAgreement.1")).not.toMatch(/1/);
		},
	);
});

describe("Spain's labels", () => {
	it("name a listing in the plural and a centre's kind or specialty in the singular", () => {
		const t = createTranslator({
			locale: "es-ES",
			messages: CATALOGS["es-ES"],
			namespace: "taxonomy",
		});
		expect(t("listing.centros-de-salud" as never)).toBe("Centros de salud y consultorios");
		expect(t("profession.consultorio-local" as never)).toBe("Consultorio local");
		expect(t("profession.cardiologos" as never)).toBe("Consulta de cardiología");
		expect(inSentence(t("profession.clinica-dental" as never), "es-ES")).toBe("clínica dental");
	});
});

describe("Italy's labels", () => {
	it("name a listing in the plural and a place's kind in the singular", () => {
		const t = createTranslator({
			locale: "it-IT",
			messages: CATALOGS["it-IT"],
			namespace: "taxonomy",
		});
		expect(t("listing.farmacie" as never)).toBe("Farmacie");
		expect(t("profession.case-di-cura" as never)).toBe("Casa di cura accreditata");
		expect(inSentence(t("profession.ospedali" as never), "it-IT")).toBe("ospedale");
	});
});
