import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { readBodyCapped, tooLarge, withBody } from "~/server/http/body";
import { refuseCrossSite } from "~/server/http/same-origin";
import { createTRPCContext } from "~/trpc/context";
import { logProcedureError } from "~/trpc/error-redaction";
import { appRouter } from "~/trpc/routers/_app";

/** The largest tRPC body (a batch of mutations); the page editor's longest form fits easily. */
const MAX_BODY_BYTES = 512 * 1024;

async function handler(request: Request) {
	// Mutations are POSTs: only our own pages may send them (see ~/server/http/same-origin).
	const crossSite = refuseCrossSite(request);
	if (crossSite) return crossSite;
	const body = await readBodyCapped(request, MAX_BODY_BYTES);
	if (!body) return tooLarge();
	const req = withBody(request, body);
	return fetchRequestHandler({
		endpoint: "/api/trpc",
		req,
		router: appRouter,
		createContext: ({ resHeaders }) => createTRPCContext({ headers: req.headers, resHeaders }),
		onError: logProcedureError,
	});
}

export { handler as GET, handler as POST };
