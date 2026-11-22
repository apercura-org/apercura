import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import type { Locale } from "~/i18n/locales";
import de from "../../messages/de.json";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import fr from "../../messages/fr.json";
import it_ from "../../messages/it.json";
import { inSentence } from "./labels";

const CATALOGS = { fr, en, de, es, it: it_ } as const;

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
		const values = { listing: label, occupation: inSentence(label, locale), place, count: 12 };
		expect(t("metaDescription", values)).toContain(fragment);
		expect(t("establishmentsIntro", values)).toContain(
			locale === "de" ? "als Kardiologe" : inSentence(label, locale),
		);
	});
});
