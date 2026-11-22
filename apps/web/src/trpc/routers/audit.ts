import { z } from "zod";
import { listAuditEvents } from "~/server/booking/audit-log";
import { createTRPCRouter, memberProcedure } from "../init";

/** The practice's access log (plan §10): owners only (`audit:read`). */
export const auditRouter = createTRPCRouter({
	list: memberProcedure({ audit: ["read"] })
		.input(
			z.object({
				cursor: z.number().int().positive().nullish(),
				limit: z.number().int().min(1).max(100).default(50),
			}),
		)
		.query(({ ctx, input }) =>
			listAuditEvents(ctx.db(), ctx.organizationId, {
				cursor: input.cursor,
				limit: input.limit,
				nowMs: (ctx.now ?? Date.now)(),
			}),
		),
});
