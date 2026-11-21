"use client";

import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import { type ReactNode, useState } from "react";
import superjson from "superjson";
import { makeQueryClient } from "./query-client";
import type { AppRouter } from "./routers/_app";

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
	if (typeof window === "undefined") {
		// Server: always make a new query client.
		return makeQueryClient();
	}
	// Browser: reuse one client so React suspending during the initial render
	// does not throw the cache away.
	browserQueryClient ??= makeQueryClient();
	return browserQueryClient;
}

function getUrl() {
	const base = typeof window === "undefined" ? `http://localhost:${process.env.PORT ?? 3000}` : "";
	return `${base}/api/trpc`;
}

export function TRPCReactProvider({ children }: { children: ReactNode }) {
	const queryClient = getQueryClient();
	const [trpcClient] = useState(() =>
		createTRPCClient<AppRouter>({
			links: [httpBatchLink({ transformer: superjson, url: getUrl() })],
		}),
	);

	return (
		<QueryClientProvider client={queryClient}>
			<TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
				{children}
			</TRPCProvider>
		</QueryClientProvider>
	);
}
