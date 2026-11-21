import { createTRPCRouter } from "../init";
import { healthRouter } from "./health";
import { searchRouter } from "./search";

export const appRouter = createTRPCRouter({
	health: healthRouter,
	search: searchRouter,
});

export type AppRouter = typeof appRouter;
