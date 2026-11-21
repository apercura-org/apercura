import { createTRPCRouter } from "../init";
import { accountRouter } from "./account";
import { adminRouter } from "./admin";
import { agendaRouter } from "./agenda";
import { bookingRouter } from "./booking";
import { calendarRouter } from "./calendar";
import { claimsRouter } from "./claims";
import { gdprRouter } from "./gdpr";
import { healthRouter } from "./health";
import { profileRouter } from "./profile";
import { searchRouter } from "./search";

export const appRouter = createTRPCRouter({
	health: healthRouter,
	account: accountRouter,
	search: searchRouter,
	booking: bookingRouter,
	agenda: agendaRouter,
	calendar: calendarRouter,
	claims: claimsRouter,
	profile: profileRouter,
	gdpr: gdprRouter,
	admin: adminRouter,
});

export type AppRouter = typeof appRouter;
