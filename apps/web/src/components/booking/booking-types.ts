import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "~/trpc/routers/_app";

type Outputs = inferRouterOutputs<AppRouter>;

export type BookingOptions = Outputs["booking"]["options"];
export type BookingCalendar = BookingOptions["calendars"][number];
export type BookingType = BookingCalendar["types"][number];
export type HoldOutcome = Outputs["booking"]["hold"];
export type VerifyOutcome = Outputs["booking"]["verify"];
export type ManagedAppointment = Outputs["booking"]["manage"]["get"];

/** Free starts of one 14-day window, read in the site's time zone. */
export interface SlotPage {
	timeZone: string;
	slots: Date[];
	/** Grid starts that cannot be booked (start instants only), struck through in the grid. */
	taken?: Date[];
}

/** Business error codes the booking procedures answer with (the tRPC error message). */
const KNOWN = new Set([
	"BOOKING_DISABLED",
	"NOT_FOUND",
	"INVALID_SLOT",
	"INVALID_INPUT",
	"RATE_LIMITED",
	"PROOF_REQUIRED",
	"CODE_EXPIRED",
	"TOO_MANY_ATTEMPTS",
	"RESEND_TOO_SOON",
	"RESEND_LIMIT",
	"TRANSITION_REFUSED",
	"IDEMPOTENCY_CONFLICT",
	"OUTSIDE_AREA",
]);

/** The booking error code of a failed call, or `generic` (network, validation, server fault). */
export function bookingErrorCode(error: unknown): string {
	const message = error instanceof Error ? error.message : "";
	if (KNOWN.has(message)) {
		return message;
	}
	const code = (error as { data?: { code?: string } } | null)?.data?.code;
	if (code === "TOO_MANY_REQUESTS") {
		return "RATE_LIMITED";
	}
	if (code === "BAD_REQUEST") {
		return "INVALID_INPUT";
	}
	return "generic";
}

/** The commune of a home visit among the type's service area, or null. */
export function homeCommune(type: BookingType, communeCode: string | null) {
	return type.serviceArea.find((commune) => commune.code === communeCode) ?? null;
}

/** "Lyon 3e Arrondissement (69003)": a commune with its postcode when it has a single one. */
export function communeLabel(commune: { name: string; postcodes: string[] }): string {
	return commune.postcodes.length === 1
		? `${commune.name} (${commune.postcodes[0]})`
		: commune.name;
}

/** Postal address of a site on one line: "1 rue de l’Exemple, 75011 Paris". */
export function siteAddress(site: {
	name?: string | null;
	siteName?: string | null;
	addressLine: string | null;
	postcode: string | null;
	communeLabel: string | null;
}): string {
	const town = [site.postcode, site.communeLabel].filter(Boolean).join(" ");
	return [site.addressLine, town].filter(Boolean).join(", ") || site.siteName || site.name || "";
}
