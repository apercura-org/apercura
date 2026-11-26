import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import type { ReactNode } from "react";
import { marketOf } from "~/i18n/locales";
import type { Locale } from "~/i18n/routing";
import { pickMessages } from "~/lib/client-messages";
import { forMarket } from "~/lib/market-messages";

/**
 * The messages an interactive part of a page reads on the client, never the
 * whole catalogue (it would be serialized into every page's HTML), and of the
 * taxonomy only the labels of the page's market (`forMarket`). Parts that
 * call the API also wrap themselves in `<TRPCReactProvider>`, imported where
 * used: a client module imported here would ship with every page.
 *
 * `namespaces="all"` passes the whole catalogue: the practitioner space,
 * which is never indexed and has many forms.
 */
export async function ClientIsland({
	locale,
	namespaces,
	children,
}: {
	locale: Locale;
	namespaces: readonly string[] | "all";
	children: ReactNode;
}) {
	const messages = await getMessages({ locale });
	return (
		<NextIntlClientProvider
			messages={
				namespaces === "all"
					? messages
					: forMarket(pickMessages(messages, namespaces), marketOf(locale))
			}
		>
			{children}
		</NextIntlClientProvider>
	);
}

/** Messages read by the search form (home page, search page). */
export const SEARCH_FORM_MESSAGES = ["Search", "SearchForm", "taxonomy"] as const;
/** Messages read by the booking panel, loaded once a patient opens it. */
export const BOOKING_PANEL_MESSAGES = ["booking.panel", "booking.email", "Practitioner"] as const;
/** Messages read by the appointment page (`/rdv`). */
export const MANAGE_MESSAGES = ["booking", "Practitioner", "taxonomy"] as const;
/** Messages read by the report and removal forms. */
export const GDPR_MESSAGES = ["Gdpr"] as const;
