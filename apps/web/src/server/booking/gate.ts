import { practitionerProfiles, practitioners } from "@apercura/db/schema";
import { and, eq } from "drizzle-orm";
import type { Executor } from "~/server/db-executor";

export interface AgendaRequirements {
	/** The page is claimed and verified, and owned by this organization. */
	claimed: boolean;
	/** `practitioner_profiles.fees` is filled (a non-empty JSON object or array). */
	fees: boolean;
	/** `practitioner_profiles.payment_methods` lists at least one method. */
	paymentMethods: boolean;
	ready: boolean;
}

function filled(value: unknown): boolean {
	if (value === null || value === undefined) {
		return false;
	}
	if (Array.isArray(value)) {
		return value.length > 0;
	}
	if (typeof value === "object") {
		return Object.keys(value).length > 0;
	}
	return typeof value === "string" ? value.trim().length > 0 : true;
}

/**
 * What opening the online agenda of a practitioner requires (plan §9-10): a verified claim held
 * by the organization, and the fees and payment methods filled on the public page, so patients
 * know what they book. The claims workflow and the page editor own these columns
 * (`practitioners.claim_status` / `owner_org_id`, `practitioner_profiles.fees` /
 * `payment_methods`); this is the single function booking reads them through.
 */
export async function agendaRequirements(
	db: Executor,
	organizationId: string,
	practitionerId: number,
): Promise<AgendaRequirements> {
	const [row] = await db
		.select({
			claimStatus: practitioners.claimStatus,
			ownerOrgId: practitioners.ownerOrgId,
			fees: practitionerProfiles.fees,
			paymentMethods: practitionerProfiles.paymentMethods,
		})
		.from(practitioners)
		.leftJoin(practitionerProfiles, eq(practitionerProfiles.practitionerId, practitioners.id))
		.where(and(eq(practitioners.id, practitionerId)))
		.limit(1);
	const claimed = row?.claimStatus === "claimed" && row.ownerOrgId === organizationId;
	const fees = filled(row?.fees);
	const paymentMethods = (row?.paymentMethods ?? []).length > 0;
	return { claimed, fees, paymentMethods, ready: claimed && fees && paymentMethods };
}
