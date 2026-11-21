import { defaultShouldDehydrateQuery, QueryClient } from "@tanstack/react-query";
import superjson from "superjson";

export function makeQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				// Avoid refetching immediately on the client after server-side prefetching.
				staleTime: 30 * 1000,
			},
			dehydrate: {
				serializeData: superjson.serialize,
				// Also dehydrate pending queries so prefetches can stream to the client.
				shouldDehydrateQuery: (query) =>
					defaultShouldDehydrateQuery(query) || query.state.status === "pending",
			},
			hydrate: {
				deserializeData: superjson.deserialize,
			},
		},
	});
}
