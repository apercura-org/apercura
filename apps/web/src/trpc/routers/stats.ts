import { TRPCError } from "@trpc/server";
import { editorData, practitionerOfOrganization } from "~/server/profile/service";
import { ownerPageStats } from "~/server/stats/owner-stats";
import { createTRPCRouter, memberProcedure } from "../init";

/**
 * The owner's statistics of their page: aggregated views, online bookings per week and the
 * completion checklist. Those who may read the page (owner, practitioner) may read them;
 * assistants run the agenda only.
 */
export const statsRouter = createTRPCRouter({
	page: memberProcedure({ page: ["read"] }).query(async ({ ctx }) => {
		try {
			const practitioner = await practitionerOfOrganization(ctx.db(), ctx.organizationId);
			const data = await editorData(ctx.db(), practitioner.id);
			return await ownerPageStats(ctx.db(), {
				data,
				organizationId: ctx.organizationId,
				nowMs: ctx.now?.() ?? Date.now(),
			});
		} catch (error) {
			if (error instanceof Error && error.name === "ProfileError") {
				throw new TRPCError({ code: "NOT_FOUND", message: "NOT_FOUND", cause: error });
			}
			throw error;
		}
	}),
});
