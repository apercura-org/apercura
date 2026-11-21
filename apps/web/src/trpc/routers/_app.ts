import { createTRPCRouter } from "../init";
import { accountRouter } from "./account";
import { agendaRouter } from "./agenda";
import { bookingRouter } from "./booking";
import { calendarRouter } from "./calendar";
import { healthRouter } from "./health";
import { searchRouter } from "./search";

export const appRouter = createTRPCRouter({
	health: healthRouter,
	account: accountRouter,
	search: searchRouter,
	booking: bookingRouter,
	agenda: agendaRouter,
	calendar: calendarRouter,
});

export type AppRouter = typeof appRouter;
