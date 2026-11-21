import { initTRPC } from "@trpc/server";
import superjson from "superjson";

export type CreateContextOptions = {
	headers: Headers;
};

/**
 * Builds the per-request context shared by every procedure.
 * Called by the HTTP route handler and by the React Server Components caller.
 */
export async function createTRPCContext(options: CreateContextOptions) {
	return {
		headers: options.headers,
	};
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create({
	transformer: superjson,
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

/** Procedure available without authentication. */
export const publicProcedure = t.procedure;
