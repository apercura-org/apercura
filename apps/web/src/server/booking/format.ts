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
 * The page itself ships with the booking panel (next issue) at `/rdv`.
 */
export function manageUrl(locale: "fr" | "en", token: string): string {
	return `${appOrigin()}${localePrefix(locale)}/rdv#t=${token}`;
}

/** The practice's agenda (dashboard until the agenda page exists). */
export function agendaUrl(locale: "fr" | "en"): string {
	return `${appOrigin()}${localePrefix(locale)}/pro/tableau-de-bord`;
}

const tag = (locale: "fr" | "en") => (locale === "fr" ? "fr-FR" : "en-GB");

/**
 * Date and time of an instant in the site's time zone. When clocks go back and the wall-clock
 * time occurs twice, the time carries its UTC offset.
 */
export function formatSlot(ms: number, timeZone: string, locale: "fr" | "en") {
	const date = new Intl.DateTimeFormat(tag(locale), {
		timeZone,
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
	}).format(ms);
	const wall = (instant: number) =>
		new Intl.DateTimeFormat(tag(locale), { timeZone, hour: "2-digit", minute: "2-digit" }).format(
			instant,
		);
	const ambiguous = wall(ms - 3_600_000) === wall(ms) || wall(ms + 3_600_000) === wall(ms);
	const time = ambiguous
		? new Intl.DateTimeFormat(tag(locale), {
				timeZone,
				hour: "2-digit",
				minute: "2-digit",
				timeZoneName: "shortOffset",
			}).format(ms)
		: wall(ms);
	const shortDate = new Intl.DateTimeFormat(tag(locale), {
		timeZone,
		day: "numeric",
		month: "long",
	}).format(ms);
	return { date, time, shortDate };
}

/** Email address inside MAIL_FROM (`Name <address>` or a bare address). */
export function senderAddress(): { name: string; email: string } {
	const from = process.env.MAIL_FROM ?? "Apercura <no-reply@localhost>";
	const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
	return match
		? { name: match[1] || "Apercura", email: match[2] ?? "no-reply@localhost" }
		: { name: "Apercura", email: from.trim() };
}
