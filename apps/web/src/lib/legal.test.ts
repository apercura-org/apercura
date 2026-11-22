import { describe, expect, it } from "vitest";
import { legalFacts, placeholderOf, securityContact, securityTxt } from "./legal";
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
