import { createTRPCRouter } from "../init";
import { accountRouter } from "./account";
import { adminRouter } from "./admin";
import { claimsRouter } from "./claims";
import { gdprRouter } from "./gdpr";
import { healthRouter } from "./health";
import { profileRouter } from "./profile";
import { searchRouter } from "./search";

export const appRouter = createTRPCRouter({
	health: healthRouter,
	account: accountRouter,
	search: searchRouter,
	claims: claimsRouter,
	profile: profileRouter,
	gdpr: gdprRouter,
	admin: adminRouter,
});

export type AppRouter = typeof appRouter;
