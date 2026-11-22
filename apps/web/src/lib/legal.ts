import type { ServerEnv } from "~/env";
import { LINKS } from "./links";

/**
 * The facts the legal pages print about the publisher and the host (legal notice, privacy
 * policy, terms, accessibility statement), read from the `LEGAL_*` configuration.
 *
 * The legal entity does not exist yet: nothing here may be invented. An unset fact prints its
 * placeholder, e.g. `{{PUBLISHER_NAME}}`, so a draft deployment shows at a glance what is
 * missing; production refuses to start (and to build) without the required ones (`env.ts`).
 * The same placeholders are used by the drafts in docs/legal/.
 */
const FACTS = {
	publisherName: ["LEGAL_PUBLISHER_NAME", "PUBLISHER_NAME"],
	publisherLegalForm: ["LEGAL_PUBLISHER_LEGAL_FORM", "PUBLISHER_LEGAL_FORM"],
	publisherAddress: ["LEGAL_PUBLISHER_ADDRESS", "PUBLISHER_ADDRESS"],
	publisherPhone: ["LEGAL_PUBLISHER_PHONE", "PUBLISHER_PHONE"],
	publisherRegistration: ["LEGAL_PUBLISHER_REGISTRATION", "PUBLISHER_REGISTRATION"],
	publicationDirector: ["LEGAL_PUBLICATION_DIRECTOR", "PUBLICATION_DIRECTOR"],
	contactEmail: ["LEGAL_CONTACT_EMAIL", "CONTACT_EMAIL"],
	dpoContact: ["LEGAL_DPO_CONTACT", "DPO_CONTACT"],
	hostName: ["LEGAL_HOST_NAME", "HOST_NAME"],
	hostAddress: ["LEGAL_HOST_ADDRESS", "HOST_ADDRESS"],
	hostPhone: ["LEGAL_HOST_PHONE", "HOST_PHONE"],
	smtpProvider: ["LEGAL_SMTP_PROVIDER", "SMTP_PROVIDER"],
	effectiveDate: ["LEGAL_EFFECTIVE_DATE", "EFFECTIVE_DATE"],
} as const satisfies Record<string, readonly [keyof ServerEnv, string]>;

export type LegalFact = keyof typeof FACTS;

/**
 * Placeholders that no configuration fills: wording only a legal review can provide. They stay
 * visible on the pages until the catalogs carry the reviewed text.
 */
export const LEGAL_REVIEW_PLACEHOLDERS = {
	/** The verbatim notice of the order of 30 May 2018 (art. 5) on fees and conventionnement. */
	conventionnementWording: "{{CONVENTIONNEMENT_WORDING}}",
} as const;

/**
 * False until a lawyer has reviewed the legal pages: they then carry a "draft" mark. Set it to
 * true in the same change that brings the reviewed texts into the catalogs.
 */
export const LEGAL_TEXTS_REVIEWED = false;

/**
 * Date of the accessibility statement and of the self-assessment it is based on
 * (docs/accessibility/rgaa-self-assessment.md). Update both together.
 */
export const ACCESSIBILITY_STATEMENT_DATE = "2026-11-22";

export const placeholderOf = (fact: LegalFact) => `{{${FACTS[fact][1]}}}`;

export type LegalValue = { value: string; missing: boolean };

/** Every legal fact, configured or as its placeholder. The host falls back to PUBLIC_HDS_HOST. */
export function legalFacts(
	env: Partial<Pick<ServerEnv, (typeof FACTS)[LegalFact][0] | "PUBLIC_HDS_HOST">>,
): Record<LegalFact, LegalValue> {
	const read = (fact: LegalFact): string | undefined => {
		const value = env[FACTS[fact][0]]?.trim();
		if (value) return value;
		return fact === "hostName" ? env.PUBLIC_HDS_HOST?.trim() || undefined : undefined;
	};
	return Object.fromEntries(
		(Object.keys(FACTS) as LegalFact[]).map((fact) => {
			const value = read(fact);
			return [
				fact,
				value ? { value, missing: false } : { value: placeholderOf(fact), missing: true },
			];
		}),
	) as Record<LegalFact, LegalValue>;
}

/**
 * The `Contact` and `Policy` of security.txt (RFC 9116): SECURITY_CONTACT, else a `mailto:` of
 * the legal contact, else the repository's private vulnerability reports (SECURITY.md); the
 * policy defaults to the repository's security policy.
 */
export function securityContact(
	env: Partial<Pick<ServerEnv, "SECURITY_CONTACT" | "SECURITY_POLICY_URL" | "LEGAL_CONTACT_EMAIL">>,
): { contact: string; policy: string } {
	const email = env.LEGAL_CONTACT_EMAIL?.trim();
	const contact =
		env.SECURITY_CONTACT?.trim() || (email ? `mailto:${email}` : LINKS.securityAdvisory);
	return { contact, policy: env.SECURITY_POLICY_URL?.trim() || LINKS.securityPolicy };
}

/** How long a security.txt stays valid: RFC 9116 asks for less than a year. */
export const SECURITY_TXT_VALIDITY_DAYS = 180;

/** The body of `/.well-known/security.txt` (RFC 9116), valid for 180 days from `now`. */
export function securityTxt(options: {
	contact: string;
	policy: string;
	canonical: string;
	now: Date;
}): string {
	const expires = new Date(options.now.getTime() + SECURITY_TXT_VALIDITY_DAYS * 86_400_000);
	expires.setUTCHours(0, 0, 0, 0);
	return [
		`Contact: ${options.contact}`,
		`Expires: ${expires.toISOString()}`,
		`Policy: ${options.policy}`,
		"Preferred-Languages: fr, en",
		`Canonical: ${options.canonical}`,
		"",
	].join("\n");
}
