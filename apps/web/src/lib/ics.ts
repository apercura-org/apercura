/**
 * Hand-written iCalendar (RFC 5545 / RFC 5546) for patient emails: one VEVENT per appointment
 * with a stable UID, `SEQUENCE` = the appointment's revision, times in UTC, `METHOD:REQUEST` for
 * a booking or a change and `METHOD:CANCEL` for a cancellation. No reason and no specialty in it.
 */

export interface IcsEvent {
	method: "REQUEST" | "CANCEL";
	/** Stable across revisions: `{appointmentId}@{host}`. */
	uid: string;
	sequence: number;
	startsAt: Date;
	endsAt: Date;
	stampedAt: Date;
	summary: string;
	location?: string | null;
	organizer: { name: string; email: string };
	attendee?: { name: string; email: string } | null;
}

/** `20261121T093000Z`. */
export function icsUtc(date: Date): string {
	return date
		.toISOString()
		.replace(/\.\d{3}Z$/, "Z")
		.replace(/[-:]/g, "");
}

/** Escapes a TEXT value (RFC 5545 §3.3.11). */
export function escapeText(value: string): string {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/;/g, "\\;")
		.replace(/,/g, "\\,")
		.replace(/\r?\n/g, "\\n");
}

/** Quotes a parameter value (CN) and drops characters a parameter cannot hold. */
function paramValue(value: string): string {
	return `"${value.replace(/["\r\n]/g, "")}"`;
}

/** Folds a content line at 75 octets, never inside a UTF-8 sequence (RFC 5545 §3.1). */
export function foldLine(line: string): string {
	const encoder = new TextEncoder();
	const parts: string[] = [];
	let current = "";
	let size = 0;
	for (const char of line) {
		const bytes = encoder.encode(char).length;
		const limit = parts.length === 0 ? 75 : 74;
		if (size + bytes > limit) {
			parts.push(current);
			current = "";
			size = 0;
		}
		current += char;
		size += bytes;
	}
	parts.push(current);
	return parts.join("\r\n ");
}

export function buildIcs(event: IcsEvent): string {
	const cancelled = event.method === "CANCEL";
	const lines = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//Apercura//Booking//EN",
		"CALSCALE:GREGORIAN",
		`METHOD:${event.method}`,
		"BEGIN:VEVENT",
		`UID:${event.uid}`,
		`DTSTAMP:${icsUtc(event.stampedAt)}`,
		`SEQUENCE:${event.sequence}`,
		`DTSTART:${icsUtc(event.startsAt)}`,
		`DTEND:${icsUtc(event.endsAt)}`,
		`SUMMARY:${escapeText(event.summary)}`,
		...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
		`ORGANIZER;CN=${paramValue(event.organizer.name)}:mailto:${event.organizer.email}`,
		...(event.attendee
			? [
					`ATTENDEE;CN=${paramValue(event.attendee.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${event.attendee.email}`,
				]
			: []),
		`STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
		"TRANSP:OPAQUE",
		"END:VEVENT",
		"END:VCALENDAR",
	];
	return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
