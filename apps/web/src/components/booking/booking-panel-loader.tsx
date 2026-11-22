"use client";

import type { ComponentProps } from "react";
import { TRPCReactProvider } from "~/trpc/client";
import { BookingPanel } from "./booking-panel";

/**
 * The booking panel with the API client it calls. Imported on demand by the
 * launcher, so neither the panel nor the tRPC and query clients weigh on the
 * practitioner page's first load.
 */
export function BookingPanelWithApi(props: ComponentProps<typeof BookingPanel>) {
	return (
		<TRPCReactProvider>
			<BookingPanel {...props} />
		</TRPCReactProvider>
	);
}
