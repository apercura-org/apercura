/**
 * A mail failure as it may be stored or logged: the error class, Nodemailer's
 * error code and the SMTP reply code with its command, never the message. SMTP
 * replies quote the recipient (`550 <name@example.org>: user unknown`), and for
 * a patient that address is health data: it must stay encrypted.
 */
export function mailErrorSummary(error: unknown): string {
	if (!(error instanceof Error)) return "Unknown error";
	const details = error as { code?: unknown; responseCode?: unknown; command?: unknown };
	const parts = [/^[A-Za-z]{1,64}$/.test(error.name) ? error.name : "Error"];
	if (typeof details.code === "string" && /^[A-Z][A-Z0-9_]{1,31}$/.test(details.code)) {
		parts.push(details.code);
	}
	if (typeof details.responseCode === "number" && Number.isInteger(details.responseCode)) {
		parts.push(`SMTP ${details.responseCode}`);
	}
	if (typeof details.command === "string" && /^[A-Z][A-Z ]{1,15}$/.test(details.command)) {
		parts.push(`on ${details.command}`);
	}
	return parts.join(" ");
}
