import { TRPCError } from "@trpc/server";

/** Business errors of the booking services; the routers map them to tRPC errors. */
export type BookingErrorCode =
	| "BOOKING_DISABLED"
	| "NOT_FOUND"
	| "INVALID_SLOT"
	| "INVALID_INPUT"
	| "SLOT_TAKEN"
	| "RATE_LIMITED"
	| "PROOF_REQUIRED"
	| "CODE_INVALID"
	| "CODE_EXPIRED"
	| "TOO_MANY_ATTEMPTS"
	| "RESEND_TOO_SOON"
	| "RESEND_LIMIT"
	| "TRANSITION_REFUSED"
	| "IDEMPOTENCY_CONFLICT"
	| "AGENDA_NOT_READY"
	/** A home visit asked for a commune outside the type's service area. */
	| "OUTSIDE_AREA"
	/** An active home visit without any commune. */
	| "AREA_REQUIRED"
	/** A service area code the directory does not hold. */
	| "UNKNOWN_COMMUNE"
	/** Communes around a site that has no position on the map. */
	| "SITE_NOT_LOCATED";

const TRPC_CODES: Record<BookingErrorCode, TRPCError["code"]> = {
	BOOKING_DISABLED: "NOT_FOUND",
	NOT_FOUND: "NOT_FOUND",
	INVALID_SLOT: "BAD_REQUEST",
	INVALID_INPUT: "BAD_REQUEST",
	SLOT_TAKEN: "CONFLICT",
	RATE_LIMITED: "TOO_MANY_REQUESTS",
	PROOF_REQUIRED: "FORBIDDEN",
	CODE_INVALID: "BAD_REQUEST",
	CODE_EXPIRED: "BAD_REQUEST",
	TOO_MANY_ATTEMPTS: "FORBIDDEN",
	RESEND_TOO_SOON: "TOO_MANY_REQUESTS",
	RESEND_LIMIT: "TOO_MANY_REQUESTS",
	TRANSITION_REFUSED: "CONFLICT",
	IDEMPOTENCY_CONFLICT: "CONFLICT",
	AGENDA_NOT_READY: "PRECONDITION_FAILED",
	OUTSIDE_AREA: "BAD_REQUEST",
	AREA_REQUIRED: "BAD_REQUEST",
	UNKNOWN_COMMUNE: "BAD_REQUEST",
	SITE_NOT_LOCATED: "PRECONDITION_FAILED",
};

export class BookingError extends Error {
	constructor(
		readonly code: BookingErrorCode,
		message: string = code,
	) {
		super(message);
		this.name = "BookingError";
	}
}

/** Runs a service call and turns its BookingError into a TRPCError whose message is the code. */
export async function asTrpc<T>(run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (error) {
		if (error instanceof BookingError) {
			throw new TRPCError({ code: TRPC_CODES[error.code], message: error.code, cause: error });
		}
		throw error;
	}
}

/** Whether `error` (or its cause, as Drizzle wraps driver errors) is an exclusion violation. */
export function isExclusionViolation(error: unknown): boolean {
	return pgErrorCode(error) === "23P01";
}

/** Whether `error` is a unique violation, optionally on one constraint or index. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
	if (pgErrorCode(error) !== "23505") {
		return false;
	}
	return constraint === undefined || pgConstraint(error) === constraint;
}

export function pgErrorCode(error: unknown): string | undefined {
	for (let current = error, depth = 0; current && depth < 5; depth += 1) {
		const code = (current as { code?: unknown }).code;
		if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) {
			return code;
		}
		current = (current as { cause?: unknown }).cause;
	}
	return undefined;
}

function pgConstraint(error: unknown): string | undefined {
	for (let current = error, depth = 0; current && depth < 5; depth += 1) {
		const name = (current as { constraint_name?: unknown }).constraint_name;
		if (typeof name === "string") {
			return name;
		}
		current = (current as { cause?: unknown }).cause;
	}
	return undefined;
}
