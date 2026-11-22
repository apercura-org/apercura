import type { RateLimitRule } from "~/server/rate-limit";

/** Booking limits (plan §9). Kept together so tests and docs read the same numbers. */
export const BOOKING_LIMITS = {
	/** `booking.slots` and `booking.options`, per client IP. */
	slotsPerIp: { max: 120, windowSeconds: 60 } satisfies RateLimitRule,
	/** `booking.challenge`, per client IP. */
	challengesPerIp: { max: 30, windowSeconds: 60 } satisfies RateLimitRule,
	/** `booking.hold`, per client IP (per /64 in IPv6). */
	holdsPerIp: { max: 5, windowSeconds: 600 } satisfies RateLimitRule,
	/** `booking.hold`, per email blind index. */
	holdsPerEmail: { max: 3, windowSeconds: 3600 } satisfies RateLimitRule,
	/** `booking.verify` calls, per client IP (codes also have 5 attempts each hold). */
	verifiesPerIp: { max: 30, windowSeconds: 600 } satisfies RateLimitRule,
	/** `booking.manage.*`, per client IP. */
	managePerIp: { max: 30, windowSeconds: 3600 } satisfies RateLimitRule,
	/** Live holds a single practitioner may have at once. */
	liveHoldsPerPractitioner: 20,
	/** Active future appointments one email may have in one calendar. */
	activePerEmailPerCalendar: 3,
	/** Wrong codes before the hold is dropped. */
	codeAttempts: 5,
	/** Code emails per hold (the first one included). */
	codeSends: 3,
	/** Minimal delay between two code emails. */
	resendIntervalMs: 60_000,
	/** How long a code stays valid (greylisting delays some emails). */
	codeValidityMs: 30 * 60_000,
	/** Alternatives offered when a slot was just taken. */
	alternatives: 3,
	/** Longest agenda range staff may list at once. */
	agendaMaxDays: 42,
	/** `agenda.list` calls (each one decrypts and audits), per signed-in person. */
	agendaListsPerUser: { max: 120, windowSeconds: 60 } satisfies RateLimitRule,
	/** Reads of one private calendar feed (`/api/ics/{token}`), per token. */
	feedReadsPerToken: { max: 60, windowSeconds: 3600 } satisfies RateLimitRule,
	/** Invitations one practice may send in a day. */
	invitationsPerOrganization: { max: 20, windowSeconds: 86_400 } satisfies RateLimitRule,
} as const;

/** Whether online booking is enabled (FEATURE_BOOKING). */
export function bookingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
	return env.FEATURE_BOOKING === "true" || env.FEATURE_BOOKING === "1";
}

/** Name of the cookie behind "one live hold per browser". */
export const BROWSER_COOKIE = "apercura_booking";
