import { createTRPCRouter } from "../init";
import { accountRouter } from "./account";
import { healthRouter } from "./health";
import { searchRouter } from "./search";

export const appRouter = createTRPCRouter({
	health: healthRouter,
	account: accountRouter,
	search: searchRouter,
});

export type AppRouter = typeof appRouter;
