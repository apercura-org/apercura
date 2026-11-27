import { IE_HOSPITAL_KINDS, isPrivateIeHospitalKind } from "@apercura/core/taxonomy";
import type { QualificationPayload } from "~/server/queries/types";

/*
 * The qualification sources the Irish import stores (`directory.practitioner_qualifications.source`).
 * The web does not import from the ETL: these strings are the ones
 * packages/etl/src/sources/ie/types.ts exports, kept equal by hand (and by the e2e tests).
 */

/** A hospital's kind: code = the HSE layer's subcategory ("General/Acute"), label = the kind. */
export const IE_HOSPITAL_KIND_SOURCE = "ie-hospital-kind";
/** A nursing home's maximum occupancy on HIQA's register: code = the number of places. */
export const IE_CAPACITY_SOURCE = "ie-capacity";
/** Who runs the facility: code `hse` (the Health Service Executive) or `company` (label = name). */
export const IE_OPERATOR_SOURCE = "ie-operator";
/** The slug of a nursing home's page on HIQA's website (its inspection reports). */
export const IE_HIQA_PAGE_SOURCE = "ie-hiqa-page";

/** The page of a designated centre on HIQA's website, where its inspection reports are. */
export function hiqaCentreUrl(slug: string): string {
	return `https://www.hiqa.ie/areas-we-work/find-a-centre/${encodeURIComponent(slug)}`;
}

/**
 * What an Irish facility's page says of it, beyond its kind and address: a hospital's kind as the
 * HSE's Health Atlas names it (printed in English, the page's language, from
 * `IE_HOSPITAL_KINDS`, else as the layer writes it) and whether it is private; a nursing home's
 * places for residents and the link to its inspection reports on HIQA's website; and who runs the
 * facility (the HSE, or a company by its name). Never a person: the import reads no
 * superintendent pharmacist, person in charge or individual provider.
 */
export type IrishFacilityFacts = {
	hospitalKind: string | null;
	privateHospital: boolean;
	capacity: number | null;
	operator: { kind: "hse" } | { kind: "company"; name: string } | null;
	hiqaUrl: string | null;
};

export function irishFacilityFacts(
	qualifications: readonly QualificationPayload[],
): IrishFacilityFacts {
	const find = (source: string) => qualifications.find((item) => item.source === source);
	const kind = find(IE_HOSPITAL_KIND_SOURCE);
	const kindCode = kind?.code.trim() ?? "";
	const capacity = find(IE_CAPACITY_SOURCE)?.code.trim() ?? "";
	const operator = find(IE_OPERATOR_SOURCE);
	const operatorName = operator?.label?.trim() ?? "";
	const hiqaPage = find(IE_HIQA_PAGE_SOURCE)?.code.trim() ?? "";
	return {
		hospitalKind: kind
			? (IE_HOSPITAL_KINDS[kindCode] ?? (kind.label?.trim() || kindCode || null))
			: null,
		privateHospital: kind ? isPrivateIeHospitalKind(kindCode) : false,
		capacity: /^\d{1,4}$/.test(capacity) && Number(capacity) > 0 ? Number(capacity) : null,
		operator:
			operator?.code === "hse"
				? { kind: "hse" }
				: operator?.code === "company" && operatorName
					? { kind: "company", name: operatorName }
					: null,
		hiqaUrl: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(hiqaPage) ? hiqaCentreUrl(hiqaPage) : null,
	};
}
