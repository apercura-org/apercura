import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { ownerSiteSchema, profileInputSchema } from "~/lib/profile-schema";
import { afterPurge } from "~/server/gdpr/minimise";
import { setOwnerRemoval } from "~/server/gdpr/service";
import {
	addOwnerSite,
	editorData,
	type ProfileError,
	practitionerOfOrganization,
	publishProfile,
	removeOwnerSite,
	removePhoto,
	saveProfile,
	setSiteHidden,
} from "~/server/profile/service";
import { refreshPractitioners } from "~/server/refresh";
import { getStorage, storageConfigured } from "~/server/storage";
import { createTRPCRouter, memberProcedure } from "../init";
import { service } from "./errors";

const readPage = memberProcedure({ page: ["read"] });
const editPage = memberProcedure({ page: ["update"] });
/** Removing the whole page is the owner's decision alone. */
const ownPage = memberProcedure({ organization: ["delete"] });

async function profileCall<T>(run: () => Promise<T>): Promise<T> {
	try {
		return await service(run);
	} catch (error) {
		if (error instanceof Error && error.name === "ProfileError") {
			const code = (error as ProfileError).code;
			throw new TRPCError({
				code: code === "NOT_FOUND" ? "NOT_FOUND" : "BAD_REQUEST",
				message: code,
				cause: error,
			});
		}
		throw error;
	}
}

/**
 * The page editor. The practitioner is always the one whose page the checked
 * organization owns; saving rebuilds that page's read model and expires its
 * cache tags, so the public page shows the change on the next visit.
 */
export const profileRouter = createTRPCRouter({
	get: readPage.query(({ ctx }) =>
		profileCall(async () => {
			const practitioner = await practitionerOfOrganization(ctx.db(), ctx.organizationId);
			return editorData(ctx.db(), practitioner.id);
		}),
	),

	save: editPage.input(z.object({ profile: profileInputSchema })).mutation(({ ctx, input }) =>
		profileCall(async () => {
			const practitioner = await practitionerOfOrganization(ctx.db(), ctx.organizationId);
			await saveProfile(ctx.db(), practitioner.id, input.profile);
			await refreshPractitioners(ctx.db().$client, [practitioner.id]);
			return editorData(ctx.db(), practitioner.id);
		}),
	),

	publish: editPage.mutation(({ ctx }) =>
		profileCall(async () => {
			const practitioner = await practitionerOfOrganization(ctx.db(), ctx.organizationId);
			await publishProfile(ctx.db(), practitioner.id);
			await refreshPractitioners(ctx.db().$client, [practitioner.id]);
			return { ok: true as const };
		}),
	),

	setSiteHidden: editPage
		.input(z.object({ activityId: z.number().int().positive(), hidden: z.boolean() }))
		.mutation(({ ctx, input }) =>
			profileCall(async () => {
				const practitioner = await practitionerOfOrganization(ctx.db(), ctx.organizationId);
				await setSiteHidden(ctx.db(), practitioner.id, input.activityId, input.hidden);
				await refreshPractitioners(ctx.db().$client, [practitioner.id]);
				return { ok: true as const };
			}),
		),

	addSite: editPage.input(z.object({ site: ownerSiteSchema })).mutation(({ ctx, input }) =>
		profileCall(async () => {
			const practitioner = await practitionerOfOrganization(ctx.db(), ctx.organizationId);
			const site = await addOwnerSite(ctx.db(), practitioner.id, input.site);
			await refreshPractitioners(ctx.db().$client, [practitioner.id]);
			return site;
		}),
	),

	removeSite: editPage
		.input(z.object({ activityId: z.number().int().positive() }))
		.mutation(({ ctx, input }) =>
			profileCall(async () => {
				const practitioner = await practitionerOfOrganization(ctx.db(), ctx.organizationId);
				await removeOwnerSite(ctx.db(), practitioner.id, input.activityId);
				await refreshPractitioners(ctx.db().$client, [practitioner.id]);
				return { ok: true as const };
			}),
		),

	removePhoto: editPage.mutation(({ ctx }) =>
		profileCall(async () => {
			const practitioner = await practitionerOfOrganization(ctx.db(), ctx.organizationId);
			await removePhoto(ctx.db(), getStorage(), practitioner.id);
			await refreshPractitioners(ctx.db().$client, [practitioner.id]);
			return { ok: true as const };
		}),
	),

	/**
	 * Removes the page from the directory (GDPR objection by its owner), or restores it. Removing
	 * deletes the page's content, so it needs the confirmation of the editor's dialog: the page's
	 * RPPS number sent back (`confirmRpps`). A request without it changes nothing.
	 */
	setRemoved: ownPage
		.input(z.object({ removed: z.boolean(), confirmRpps: z.string().max(32).optional() }))
		.mutation(({ ctx, input }) =>
			profileCall(async () => {
				const [row] = await ctx.db().$client<{ id: number; nationalId: string }[]>`
					SELECT id, national_id AS "nationalId" FROM directory.practitioners
					WHERE owner_org_id = ${ctx.organizationId} AND claim_status = 'claimed'
				`;
				if (!row) throw new TRPCError({ code: "NOT_FOUND" });
				if (input.removed && input.confirmRpps !== row.nationalId) {
					throw new TRPCError({ code: "BAD_REQUEST", message: "CONFIRMATION_REQUIRED" });
				}
				const purge = await setOwnerRemoval(ctx.db(), {
					practitionerId: row.id,
					userId: ctx.user.id,
					removed: input.removed,
				});
				if (purge) {
					await afterPurge(ctx.db(), purge, {
						storage: storageConfigured() ? getStorage() : null,
					});
				} else {
					await refreshPractitioners(ctx.db().$client, [row.id]);
				}
				return { ok: true as const };
			}),
		),
});
