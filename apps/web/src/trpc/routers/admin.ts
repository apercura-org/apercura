import { z } from "zod";
import { afterApproval, notifyClaimRejected } from "~/server/claims/notify";
import {
	adminClaimDetail,
	adminClaimQueue,
	approveClaim,
	rejectClaim,
	verifyPhoneCallback,
} from "~/server/claims/service";
import {
	CONTACT_REQUEST_STATUSES,
	contactRequestCounts,
	contactRequestQueue,
	readContactRequest,
	setContactRequestStatus,
} from "~/server/contact-requests/service";
import { claimDocumentsEnabled, pscConfigured } from "~/server/features";
import {
	decideRemoval,
	readRemovalRequest,
	readReport,
	removalQueue,
	reportQueue,
	resolveReport,
} from "~/server/gdpr/service";
import { mailErrorSummary } from "~/server/mail/error-summary";
import { sendNotice } from "~/server/mail/notices";
import { refreshPractitioners } from "~/server/refresh";
import { createTRPCRouter, platformAdminProcedure } from "../init";
import { service } from "./errors";

const id = z.object({ id: z.uuid() });
const reason = z.string().trim().min(3).max(500);

/**
 * Platform administration: the claims queue, error reports, removal requests and the "I am this
 * practitioner" contact requests. Platform administrators carry no organization and never reach
 * patient data; every decryption is written to the platform audit log.
 */
export const adminRouter = createTRPCRouter({
	claims: createTRPCRouter({
		queue: platformAdminProcedure.query(({ ctx }) => adminClaimQueue(ctx.db())),

		detail: platformAdminProcedure.input(id).query(({ ctx, input }) =>
			service(() =>
				adminClaimDetail(ctx.db(), input.id, {
					pscEnabled: pscConfigured(),
					documentsEnabled: claimDocumentsEnabled(),
				}),
			),
		),

		/** The code read out by whoever answered the registry phone. */
		verifyPhone: platformAdminProcedure
			.input(
				z.object({
					id: z.uuid(),
					phone: z.string().regex(/^\+\d{8,15}$/),
					code: z.string().regex(/^\d{6}$/),
				}),
			)
			.mutation(({ ctx, input }) =>
				service(() =>
					verifyPhoneCallback(ctx.db(), {
						claimId: input.id,
						adminId: ctx.user.id,
						code: input.code,
						phone: input.phone,
						headers: ctx.headers,
					}),
				),
			),

		approve: platformAdminProcedure
			.input(z.object({ id: z.uuid(), reason: reason.optional() }))
			.mutation(async ({ ctx, input }) => {
				const result = await service(() =>
					approveClaim(ctx.db(), input.id, ctx.user.id, input.reason ?? null, ctx.headers),
				);
				await afterApproval(ctx.db(), result);
				return { ok: true as const, superseded: result.supersededUserId !== null };
			}),

		reject: platformAdminProcedure
			.input(z.object({ id: z.uuid(), reason }))
			.mutation(async ({ ctx, input }) => {
				const result = await service(() =>
					rejectClaim(ctx.db(), input.id, ctx.user.id, input.reason, ctx.headers),
				);
				await refreshPractitioners(ctx.db().$client, [result.practitionerId]);
				await notifyClaimRejected(ctx.db(), result.userId, input.reason);
				return { ok: true as const };
			}),
	}),

	reports: createTRPCRouter({
		queue: platformAdminProcedure
			.input(z.object({ status: z.enum(["open", "resolved", "dismissed"]).default("open") }))
			.query(({ ctx, input }) => reportQueue(ctx.db(), input.status)),

		/** Decrypts one report (audited). */
		read: platformAdminProcedure
			.input(id)
			.mutation(({ ctx, input }) =>
				service(() =>
					readReport(ctx.db(), { id: input.id, adminId: ctx.user.id, headers: ctx.headers }),
				),
			),

		resolve: platformAdminProcedure
			.input(
				z.object({
					id: z.uuid(),
					status: z.enum(["resolved", "dismissed"]),
					note: z.string().trim().max(500).optional(),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				await service(() =>
					resolveReport(ctx.db(), {
						id: input.id,
						adminId: ctx.user.id,
						status: input.status,
						note: input.note || null,
						headers: ctx.headers,
					}),
				);
				return { ok: true as const };
			}),
	}),

	contacts: createTRPCRouter({
		queue: platformAdminProcedure
			.input(z.object({ status: z.enum(CONTACT_REQUEST_STATUSES).default("new") }))
			.query(async ({ ctx, input }) => ({
				items: await contactRequestQueue(ctx.db(), input.status),
				counts: await contactRequestCounts(ctx.db()),
			})),

		/** Decrypts the requester's details and message (audited). */
		read: platformAdminProcedure.input(id).mutation(({ ctx, input }) =>
			service(() =>
				readContactRequest(ctx.db(), {
					id: input.id,
					adminId: ctx.user.id,
					headers: ctx.headers,
				}),
			),
		),

		setStatus: platformAdminProcedure
			.input(z.object({ id: z.uuid(), status: z.enum(CONTACT_REQUEST_STATUSES) }))
			.mutation(async ({ ctx, input }) => {
				await service(() =>
					setContactRequestStatus(ctx.db(), {
						id: input.id,
						adminId: ctx.user.id,
						status: input.status,
						headers: ctx.headers,
					}),
				);
				return { ok: true as const };
			}),
	}),

	removals: createTRPCRouter({
		queue: platformAdminProcedure.query(({ ctx }) => removalQueue(ctx.db())),

		/** Decrypts the requester's contact and message (audited). */
		read: platformAdminProcedure.input(id).mutation(({ ctx, input }) =>
			service(() =>
				readRemovalRequest(ctx.db(), {
					id: input.id,
					adminId: ctx.user.id,
					headers: ctx.headers,
				}),
			),
		),

		decide: platformAdminProcedure
			.input(z.object({ id: z.uuid(), confirm: z.boolean(), reason: reason.optional() }))
			.mutation(async ({ ctx, input }) => {
				const result = await service(() =>
					decideRemoval(ctx.db(), {
						id: input.id,
						adminId: ctx.user.id,
						confirm: input.confirm,
						reason: input.reason ?? null,
						headers: ctx.headers,
					}),
				);
				await refreshPractitioners(ctx.db().$client, [result.practitionerId]);
				try {
					await sendNotice({
						to: result.contact,
						locale: result.locale,
						kind: input.confirm ? "removalConfirmed" : "removalRejected",
						values: { reason: input.reason ?? "" },
					});
				} catch (error) {
					console.error(`Removal decision email failed: ${mailErrorSummary(error)}`);
				}
				return { ok: true as const };
			}),
	}),
});
