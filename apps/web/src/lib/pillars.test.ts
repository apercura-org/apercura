import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { messagesFor } from "~/i18n/catalogs";
import { CATALOG_LANGUAGES, LOCALES } from "~/i18n/locales";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { getPillars } from "./pillars";

const catalogs = { en, fr } as const;

function printed(locale: keyof typeof catalogs, hdsHost: string | undefined) {
	const t = createTranslator({ locale, messages: catalogs[locale], namespace: "HomePage.pillars" });
	return getPillars(hdsHost).map((pillar) =>
		pillar.key === "hostedInFrance"
			? {
					title: t("hostedInFrance.title"),
					description: t("hostedInFrance.description", { host: pillar.host }),
				}
			: { title: t(`${pillar.key}.title`), description: t(`${pillar.key}.description`) },
	);
}

describe("getPillars", () => {
	it("names the HDS-certified host only when one is configured", () => {
		expect(getPillars("Clever Cloud")[2]).toEqual({ key: "hostedInFrance", host: "Clever Cloud" });
		expect(getPillars(undefined)[2]).toEqual({ key: "encrypted" });
		expect(getPillars("   ")[2]).toEqual({ key: "encrypted" });
		expect(getPillars(undefined).map((pillar) => pillar.key)).toEqual([
			"free",
			"openSource",
			"encrypted",
			"selfHostable",
		]);
	});
});

describe("hosting pillar copy", () => {
	it("prints the host name when PUBLIC_HDS_HOST is set", () => {
		expect(printed("fr", "Clever Cloud")[2]).toEqual({
			title: "Données de santé hébergées en France",
			description:
				"Les données de santé sont hébergées en France chez un hébergeur certifié HDS (Clever Cloud) et chiffrées au niveau applicatif.",
		});
		expect(printed("en", "Clever Cloud")[2]?.description).toBe(
			"Health data is hosted in France by an HDS-certified host (Clever Cloud) and encrypted at the application level.",
		);
	});

	it("only promises encryption when no HDS host is configured", () => {
		expect(printed("fr", undefined)[2]).toEqual({
			title: "Données chiffrées",
			description:
				"Les justificatifs, les signalements d’erreur et, là où la réservation en ligne est ouverte, les rendez-vous sont chiffrés au niveau applicatif.",
		});
		expect(printed("en", undefined)[2]?.title).toBe("Encrypted data");
		for (const locale of ["fr", "en"] as const) {
			expect(JSON.stringify(printed(locale, undefined))).not.toMatch(
				/hébergées en France|hosted in France/,
			);
		}
	});

	it("never says Apercura itself is HDS-certified", () => {
		for (const catalog of [en, fr]) {
			expect(JSON.stringify(catalog)).not.toMatch(/Apercura[^".]*(certifi|HDS)/i);
		}
	});

	it("words the encryption pillar for every market, in its language, without a host or a place", () => {
		const english = en.HomePage.pillars.encrypted;
		for (const locale of LOCALES) {
			const pillar = messagesFor(locale).HomePage.pillars.encrypted;
			// Every market shows it: never the HDS regime, a hosting place or a host.
			expect(`${pillar.title} ${pillar.description}`).not.toMatch(
				/HDS|France|Frankreich|Francia|Francie|EEA|EWR|hébergeur|host/i,
			);
			if (CATALOG_LANGUAGES[locale] !== "en") {
				expect(pillar.description, locale).not.toBe(english.description);
			}
		}
	});
});
