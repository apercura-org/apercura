import { slotParts, slotTime } from "~/lib/slot-format";

/** Origin of the public site, from APP_URL (emails, .ics UIDs). */
export function appOrigin(): string {
	try {
		return process.env.APP_URL ? new URL(process.env.APP_URL).origin : "http://localhost:3000";
	} catch {
		return "http://localhost:3000";
	}
}

const localePrefix = (locale: "fr" | "en") => (locale === "en" ? "/en" : "");

/**
 * The patient's manage page. The token travels in the URL fragment, which browsers never send
 * to the server (so it never reaches access logs); the page posts it to `booking.manage.*`.
 */
export function manageUrl(locale: "fr" | "en", token: string): string {
	return `${appOrigin()}${localePrefix(locale)}/rdv#t=${token}`;
}

/** The practitioner's public page, where a patient can choose another time. */
export function practitionerPageUrl(locale: "fr" | "en", slug: string): string {
	const path = locale === "en" ? "/en/practitioner/" : "/praticien/";
	return `${appOrigin()}${path}${encodeURIComponent(slug)}`;
}

/** The practice's day in the agenda ("Today"). */
export function agendaUrl(locale: "fr" | "en"): string {
	return `${appOrigin()}${localePrefix(locale)}/pro/aujourdhui`;
}

/** The page where an invited person joins a practice. */
export function invitationUrl(locale: "fr" | "en", invitationId: string): string {
	return `${appOrigin()}${localePrefix(locale)}/pro/invitation/${invitationId}`;
}

/**
 * Date and time of an instant in the site's time zone. When clocks go back and the wall-clock
 * time occurs twice, the time carries its UTC offset.
 */
export function formatSlot(ms: number, timeZone: string, locale: "fr" | "en") {
	const parts = slotParts(ms, timeZone, locale);
	return { date: parts.date, time: slotTime(parts), shortDate: parts.shortDate };
}

/** Email address inside MAIL_FROM (`Name <address>` or a bare address). */
export function senderAddress(): { name: string; email: string } {
	const from = process.env.MAIL_FROM ?? "Apercura <no-reply@localhost>";
	const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
	return match
		? { name: match[1] || "Apercura", email: match[2] ?? "no-reply@localhost" }
		: { name: "Apercura", email: from.trim() };
}
