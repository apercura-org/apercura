import { CH_HOSPITAL_TYPES } from "@apercura/core/taxonomy";
import type { QualificationPayload } from "~/server/queries/types";

/** The languages Switzerland's pages and its lists are written in. */
export type SwissLanguage = "de" | "fr" | "it";

/** A page language as one of Switzerland's (`de`, `fr`, `it`), German for any other. */
export function swissLanguageOf(language: string): SwissLanguage {
	return language === "fr" || language === "it" ? language : "de";
}

/**
 * What a Swiss facility's page says of it, from the qualifications its import stores
 * (docs/data-import.md, "Switzerland"): the hospital type of the Federal Statistical Office's
 * typology (`typ`, printed in the page's language), its activity types (`akt`), the services of
 * the hospital it belongs to (`leistung`: an emergency department, an intensive care unit), the
 * site's offer (`angebot`: outpatient, inpatient), its ownership (`rechtsform`: a public enterprise
 * is public, a company, an association or foundation, a sole proprietorship or partnership
 * private), its operator when it is not the site itself (`betrieb`), its category as its canton's
 * list names it, in that list's language (`kategorie`), and the further lists the page is built
 * from (`quelle`).
 */
export type SwissFacilityFacts = {
	hospitalType: string | null;
	/** `A` acute care, `P` psychiatry, `R` rehabilitation, `B` birth centre. */
	activities: string[];
	/** `NF` emergency department, `IPS` intensive care unit: the hospital's, not only this site's. */
	services: string[];
	/** `AMB` outpatient, `STAT` inpatient. */
	offers: string[];
	ownership: "public" | "private" | null;
	operator: string | null;
	categories: { language: string; label: string }[];
	/** Registry ids of the further lists the page is completed from. */
	sources: string[];
};

const ACTIVITIES = ["A", "P", "R", "B"];
const SERVICES = ["NF", "IPS"];
const OFFERS = ["AMB", "STAT"];
/** `R4`: a public enterprise; `R1`–`R3`: companies, associations and foundations, sole traders. */
const PUBLIC_FORMS = new Set(["R4"]);
const PRIVATE_FORMS = new Set(["R1", "R2", "R3"]);

/** The known codes of one source, in the order the page lists them, each once. */
function codesOf(
	qualifications: readonly QualificationPayload[],
	source: string,
	known: readonly string[],
): string[] {
	const codes = new Set(
		qualifications.filter((item) => item.source === source).map((item) => item.code.toUpperCase()),
	);
	return known.filter((code) => codes.has(code));
}

export function swissFacilityFacts(
	qualifications: readonly QualificationPayload[],
	language: string,
): SwissFacilityFacts {
	const swiss = swissLanguageOf(language);
	const typeCode = qualifications.find((item) => item.source === "typ")?.code.toUpperCase();
	const type = typeCode ? CH_HOSPITAL_TYPES[typeCode] : undefined;
	const form = qualifications.find((item) => item.source === "rechtsform")?.code.toUpperCase();
	const operator = qualifications.find((item) => item.source === "betrieb")?.label?.trim();
	return {
		// The typology's own wording in the page's language; the list's German label otherwise.
		hospitalType:
			type?.[swiss] ?? qualifications.find((item) => item.source === "typ")?.label?.trim() ?? null,
		activities: codesOf(qualifications, "akt", ACTIVITIES),
		services: codesOf(qualifications, "leistung", SERVICES),
		offers: codesOf(qualifications, "angebot", OFFERS),
		ownership: form
			? PUBLIC_FORMS.has(form)
				? "public"
				: PRIVATE_FORMS.has(form)
					? "private"
					: null
			: null,
		operator: operator || null,
		categories: qualifications
			.filter((item) => item.source === "kategorie" && item.label?.trim())
			.map((item) => ({ language: item.code || swiss, label: (item.label ?? "").trim() })),
		sources: [
			...new Set(
				qualifications
					.filter((item) => item.source === "quelle" && item.code)
					.map((item) => item.code),
			),
		],
	};
}
