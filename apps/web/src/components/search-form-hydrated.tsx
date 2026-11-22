"use client";

import { TRPCReactProvider } from "~/trpc/client";
import { SearchForm, type SearchFormProps } from "./search-form";

/** The code `DeferredSearchForm` loads on first interaction: the form and its API client. */
export default function SearchFormHydrated(props: SearchFormProps) {
	return (
		<TRPCReactProvider>
			<SearchForm {...props} />
		</TRPCReactProvider>
	);
}
