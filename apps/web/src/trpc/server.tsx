import "server-only";

import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createTRPCOptionsProxy, type TRPCQueryOptions } from "@trpc/tanstack-react-query";
import { headers } from "next/headers";
import { cache, type ReactNode } from "react";
import { createTRPCContext } from "./init";
import { makeQueryClient } from "./query-client";
import { appRouter } from "./routers/_app";

/** One query client per server request. */
export const getQueryClient = cache(makeQueryClient);

const createContext = cache(async () => {
	const requestHeaders = new Headers(await headers());
	requestHeaders.set("x-trpc-source", "rsc");
	return createTRPCContext({ headers: requestHeaders });
});

/** Query options factory for prefetching in Server Components. */
export const trpc = createTRPCOptionsProxy({
	ctx: createContext,
	router: appRouter,
	queryClient: getQueryClient,
});

/** Server-side caller for data that does not need to reach the client cache. */
export const caller = appRouter.createCaller(createContext);

/** Hands the server query cache to client components under it. */
export function HydrateClient({ children }: { children: ReactNode }) {
	return <HydrationBoundary state={dehydrate(getQueryClient())}>{children}</HydrationBoundary>;
}

// biome-ignore lint/suspicious/noExplicitAny: matches any procedure's query options.
export function prefetch<T extends ReturnType<TRPCQueryOptions<any>>>(queryOptions: T) {
	const queryClient = getQueryClient();
	if (queryOptions.queryKey[1]?.type === "infinite") {
		// biome-ignore lint/suspicious/noExplicitAny: infinite options share the same shape at runtime.
		void queryClient.prefetchInfiniteQuery(queryOptions as any);
	} else {
		void queryClient.prefetchQuery(queryOptions);
	}
}
