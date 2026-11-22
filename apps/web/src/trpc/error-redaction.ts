import type { TRPCError } from "@trpc/server";

/*
 * What leaves the server when a procedure fails. Business errors carry a code
 * as their message (`SLOT_TAKEN`, `MFA_REQUIRED`…) and reach the client as
 * they are. An unexpected error (a database error, a bug) may describe data in
 * its message: outside development it reaches neither the client nor the logs,
 * only its kind and where it was thrown.
 */

const isDevelopment = () => process.env.NODE_ENV === "development";

interface ErrorShape {
	message: string;
	data: { stack?: string | undefined } & Record<string, unknown>;
}

/** tRPC `errorFormatter`: no internal message and no stack trace outside development. */
export function redactErrorShape<Shape extends ErrorShape>(shape: Shape, error: TRPCError): Shape {
	if (isDevelopment()) return shape;
	const { stack: _stack, ...data } = shape.data;
	if (error.code === "INTERNAL_SERVER_ERROR") {
		return { ...shape, message: "INTERNAL_SERVER_ERROR", data };
	}
	return { ...shape, data };
}

/**
 * A log line for an unexpected error, without its message: the error class,
 * the PostgreSQL SQLSTATE or Node.js code when there is one, and the first
 * stack frame of our own code.
 */
export function describeError(error: unknown): string {
	if (!(error instanceof Error)) return typeof error;
	const code = (error as { code?: unknown }).code;
	const frame = error.stack
		?.split("\n")
		.slice(1)
		.map((line) => line.trim())
		.find((line) => line.startsWith("at ") && !line.includes("node_modules"));
	return [error.name, typeof code === "string" ? `(${code})` : null, frame ?? null]
		.filter(Boolean)
		.join(" ");
}

/** tRPC `onError`: unexpected errors only, never the input nor the error message in production. */
export function logProcedureError({
	path,
	error,
}: {
	path?: string | undefined;
	error: TRPCError;
}) {
	if (error.code !== "INTERNAL_SERVER_ERROR") return;
	if (isDevelopment()) {
		console.error(`tRPC failed on ${path ?? "<no-path>"}:`, error);
		return;
	}
	console.error(`tRPC failed on ${path ?? "<no-path>"}: ${describeError(error.cause ?? error)}`);
}
