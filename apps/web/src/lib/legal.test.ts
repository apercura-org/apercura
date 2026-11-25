import { describe, expect, it } from "vitest";
import de from "../../messages/de.json";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import fr from "../../messages/fr.json";
import it_ from "../../messages/it.json";
import { legalFacts, placeholderOf, securityContact, securityTxt, transfersSection } from "./legal";
import { LINKS } from "./links";

describe("legal facts", () => {
	it("prints a visible placeholder for every unset fact, never an invented value", () => {
		const facts = legalFacts({});
		expect(facts.publisherName).toEqual({ value: "{{PUBLISHER_NAME}}", missing: true });
		expect(facts.hostName).toEqual({ value: "{{HOST_NAME}}", missing: true });
		expect(
			Object.values(facts).every((fact) => fact.missing && /^\{\{[A-Z_]+\}\}$/.test(fact.value)),
		).toBe(true);
	});

	it("reads the configuration, trimmed, and treats blank values as unset", () => {
		const facts = legalFacts({
			LEGAL_PUBLISHER_NAME: "  Association Exemple ",
			LEGAL_CONTACT_EMAIL: " ",
		});
		expect(facts.publisherName).toEqual({ value: "Association Exemple", missing: false });
		expect(facts.contactEmail).toEqual({ value: placeholderOf("contactEmail"), missing: true });
	});

	it("names the host from PUBLIC_HDS_HOST when LEGAL_HOST_NAME is unset", () => {
		expect(legalFacts({ PUBLIC_HDS_HOST: "Hébergeur Exemple" }).hostName.value).toBe(
			"Hébergeur Exemple",
		);
		expect(
			legalFacts({ PUBLIC_HDS_HOST: "Hébergeur Exemple", LEGAL_HOST_NAME: "Autre Exemple" })
				.hostName.value,
		).toBe("Autre Exemple");
	});
});

describe("privacy policy transfers section", () => {
	const catalogs = { fr, en, de, es, it: it_ };
	const printed = (catalog: typeof en, hdsHost: string | undefined) =>
		catalog.PrivacyPage.sections[transfersSection(hdsHost)].body.join(" ");

	it("says where health data is hosted only when an HDS host is configured", () => {
		expect(transfersSection("Clever Cloud")).toBe("transfersHds");
		expect(transfersSection(undefined)).toBe("transfers");
		expect(transfersSection("   ")).toBe("transfers");
		expect(printed(fr, "Clever Cloud")).toMatch(/données de santé en France/);
		expect(printed(en, "Clever Cloud")).toMatch(/health data in France/);
	});

	it("names no country without PUBLIC_HDS_HOST, only the European Economic Area", () => {
		for (const [locale, catalog] of Object.entries(catalogs)) {
			const text = printed(catalog, undefined);
			expect(text, locale).not.toMatch(/France|Frankreich|Francia|HDS/);
			expect(text, locale).toMatch(
				/Espace économique européen|European Economic Area|Europäischen Wirtschaftsraum|Espacio Económico Europeo|Spazio economico europeo/,
			);
		}
	});
});

describe("security.txt", () => {
	it("falls back from SECURITY_CONTACT to the legal contact, then to the private advisories", () => {
		expect(securityContact({ SECURITY_CONTACT: "https://apercura.example/security" }).contact).toBe(
			"https://apercura.example/security",
		);
		expect(securityContact({ LEGAL_CONTACT_EMAIL: "contact@apercura.example" }).contact).toBe(
			"mailto:contact@apercura.example",
		);
		expect(securityContact({})).toEqual({
			contact: LINKS.securityAdvisory,
			policy: LINKS.securityPolicy,
		});
	});

	it("expires less than a year ahead, at midnight UTC (RFC 9116)", () => {
		const body = securityTxt({
			contact: "mailto:security@apercura.example",
			policy: LINKS.securityPolicy,
			canonical: "https://apercura.example/.well-known/security.txt",
			now: new Date("2026-11-22T10:00:00Z"),
		});
		expect(body).toBe(
			[
				"Contact: mailto:security@apercura.example",
				"Expires: 2027-05-21T00:00:00.000Z",
				`Policy: ${LINKS.securityPolicy}`,
				"Preferred-Languages: fr, en",
				"Canonical: https://apercura.example/.well-known/security.txt",
				"",
			].join("\n"),
		);
	});
});
