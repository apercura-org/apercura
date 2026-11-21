import { createTRPCRouter } from "../init";
import { accountRouter } from "./account";
import { healthRouter } from "./health";

export const appRouter = createTRPCRouter({
	health: healthRouter,
	account: accountRouter,
});

export type AppRouter = typeof appRouter;
