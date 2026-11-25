import { TRPCError } from "@trpc/server";
import { ClaimError } from "~/server/claims/service";
import { ContactRequestError } from "~/server/contact-requests/service";
import { GdprError } from "~/server/gdpr/service";

const CODE_FOR: Record<ClaimError["code"], TRPCError["code"]> = {
	INVALID_RPPS: "BAD_REQUEST",
	NOT_FOUND: "NOT_FOUND",
	ALREADY_OWNER: "CONFLICT",
	FROZEN: "FORBIDDEN",
	NOT_OPEN: "CONFLICT",
	METHOD_UNAVAILABLE: "BAD_REQUEST",
	TOO_MANY_ATTEMPTS: "TOO_MANY_REQUESTS",
	INVALID_CODE: "BAD_REQUEST",
	EXPIRED: "BAD_REQUEST",
	NOT_SUBMITTABLE: "PRECONDITION_FAILED",
	NOT_APPROVABLE: "PRECONDITION_FAILED",
	BAD_DOCUMENT: "BAD_REQUEST",
	PSC_MISMATCH: "FORBIDDEN",
	PSC_MISSING: "PRECONDITION_FAILED",
};

/** Runs a service call and turns its business errors into tRPC errors (message = code). */
export async function service<T>(run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (error) {
		if (error instanceof ClaimError) {
			throw new TRPCError({ code: CODE_FOR[error.code], message: error.code, cause: error });
		}
		if (error instanceof GdprError || error instanceof ContactRequestError) {
			throw new TRPCError({
				code: error.code === "NOT_FOUND" ? "NOT_FOUND" : "CONFLICT",
				message: error.code,
				cause: error,
			});
		}
		throw error;
	}
}
