import { type BookingBlocker, bookingReadiness, type Fees } from "@apercura/core";
import { claims, practitionerProfiles, practitioners } from "@apercura/db/schema";
import { and, eq } from "drizzle-orm";
import type { Executor } from "~/server/db-executor";

export interface AgendaRequirements {
	/** The page is claimed and verified, and owned by this organization. */
	claimed: boolean;
	/** Fees are stated on the page (at least one item with a label and an amount). */
	fees: boolean;
	/** At least one accepted payment method is stated on the page. */
	paymentMethods: boolean;
	/**
	 * The waiting period after verification is over: booking opens at once
	 * with Pro Santé Connect, 7 days after any other verification.
	 */
	waitingPeriodOver: boolean;
	/** When booking may open (null: no waiting period recorded). */
	bookingOpensAt: Date | null;
	/** What is still missing, in the order the editor and onboarding list it. */
	blockers: BookingBlocker[];
	ready: boolean;
}

/**
 * The single gate on opening a practitioner's online agenda (plan §9-11): a
 * verified claim held by the organization, the waiting period after a
 * verification without Pro Santé Connect, and the fees and payment methods
 * stated on the public page (R.4127-53 II). The calendar's "open" procedure,
 * the page editor and the onboarding all read it here; the rule itself is
 * `bookingReadiness` in `@apercura/core`.
 *
 * `organizationId` is the organization asking (calendar procedures); null
 * means "whichever organization owns the page" (the owner's own editor).
 */
export async function agendaRequirements(
	db: Executor,
	organizationId: string | null,
	practitionerId: number,
	now: Date = new Date(),
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
		.where(eq(practitioners.id, practitionerId))
		.limit(1);
	const [claim] = await db
		.select({ bookingOpensAt: claims.bookingOpensAt })
		.from(claims)
		.where(and(eq(claims.practitionerId, practitionerId), eq(claims.status, "verified")))
		.limit(1);
	const claimed =
		row?.claimStatus === "claimed" &&
		row.ownerOrgId !== null &&
		(organizationId === null || row.ownerOrgId === organizationId);
	const bookingOpensAt = claim?.bookingOpensAt ?? null;
	const readiness = bookingReadiness({
		verified: claimed,
		bookingOpensAt,
		fees: (row?.fees as Fees | null) ?? null,
		paymentMethods: row?.paymentMethods ?? [],
		now,
	});
	return {
		claimed,
		fees: !readiness.blockers.includes("fees"),
		paymentMethods: !readiness.blockers.includes("paymentMethods"),
		waitingPeriodOver: claimed && !readiness.blockers.includes("waitingPeriod"),
		bookingOpensAt,
		blockers: readiness.blockers,
		ready: readiness.ready,
	};
}
