import { createTRPCRouter } from "../init";
import { accountRouter } from "./account";
import { adminRouter } from "./admin";
import { agendaRouter } from "./agenda";
import { auditRouter } from "./audit";
import { bookingRouter } from "./booking";
import { calendarRouter } from "./calendar";
import { claimsRouter } from "./claims";
import { gdprRouter } from "./gdpr";
import { healthRouter } from "./health";
import { practitionerContactRouter } from "./practitioner-contact";
import { profileRouter } from "./profile";
import { searchRouter } from "./search";
import { statsRouter } from "./stats";
import { teamRouter } from "./team";

export const appRouter = createTRPCRouter({
	health: healthRouter,
	account: accountRouter,
	search: searchRouter,
	booking: bookingRouter,
	agenda: agendaRouter,
	calendar: calendarRouter,
	team: teamRouter,
	audit: auditRouter,
	claims: claimsRouter,
	profile: profileRouter,
	gdpr: gdprRouter,
	practitionerContact: practitionerContactRouter,
	stats: statsRouter,
	admin: adminRouter,
});

export type AppRouter = typeof appRouter;
