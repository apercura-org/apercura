import type SMTPTransport from "nodemailer/lib/smtp-transport";

/**
 * Transport security of outgoing mail (patients' codes and appointments, sign-in links).
 *
 * In production the connection must be encrypted: `smtps://` (implicit TLS, port 465) or
 * `smtp://` with STARTTLS required (`requireTLS`: the message is never sent if the server does
 * not upgrade the connection). The certificate is always verified, with TLS 1.2 at least. The URL
 * may not weaken that through its query (`ignoreTLS`, `secure`, `tls.*`…), and production refuses
 * to start otherwise. `SMTP_ALLOW_INSECURE=true` lifts these rules, for a local catcher such as
 * Mailpit only (development, a self-hosted trial): never with a real provider.
 *
 * Outside production the URL is used as given (Mailpit by default).
 */
export interface SmtpEnv {
	NODE_ENV?: string | undefined;
	SMTP_URL?: string | undefined;
	SMTP_ALLOW_INSECURE?: string | boolean | undefined;
}

/** Local Mailpit, outside production only. */
export const DEVELOPMENT_SMTP_URL = "smtp://localhost:1025";

/** Query parameters of `SMTP_URL` that Nodemailer would read as TLS settings. */
const TLS_PARAMETERS = new Set(["secure", "ignoretls", "requiretls", "opportunistictls"]);

export function smtpAllowInsecure(value: SmtpEnv["SMTP_ALLOW_INSECURE"]): boolean {
	return value === true || value === "true" || value === "1";
}

function enforced(env: SmtpEnv): boolean {
	return env.NODE_ENV === "production" && !smtpAllowInsecure(env.SMTP_ALLOW_INSECURE);
}

/**
 * Why `SMTP_URL` cannot be used under the rules above, or null. Checked by the environment
 * schema (production start and build) and again when the transport is created.
 */
export function smtpUrlProblem(env: SmtpEnv): string | null {
	if (!enforced(env) || !env.SMTP_URL) return null;
	let url: URL;
	try {
		url = new URL(env.SMTP_URL);
	} catch {
		return "SMTP_URL is not a valid URL";
	}
	if (url.protocol !== "smtp:" && url.protocol !== "smtps:") {
		return "SMTP_URL must be an smtps:// or smtp:// URL in production (TLS required; SMTP_ALLOW_INSECURE=true for a local catcher only)";
	}
	const weakening = [...url.searchParams.keys()].find((key) => {
		const name = key.toLowerCase();
		return TLS_PARAMETERS.has(name) || name.startsWith("tls.");
	});
	if (weakening) {
		return `SMTP_URL may not set "${weakening}" in production: TLS comes from the scheme (smtps:// implicit TLS, smtp:// STARTTLS required)`;
	}
	return null;
}

/** Nodemailer options for `SMTP_URL`; throws when {@link smtpUrlProblem} finds one. */
export function smtpTransportOptions(env: SmtpEnv): SMTPTransport.Options {
	const production = env.NODE_ENV === "production";
	if (!env.SMTP_URL && production) {
		throw new Error("SMTP_URL is not set");
	}
	const problem = smtpUrlProblem(env);
	if (problem) {
		throw new Error(problem);
	}
	const url = env.SMTP_URL ?? DEVELOPMENT_SMTP_URL;
	if (!enforced(env)) {
		return { url };
	}
	// Nodemailer lets the URL override these, which is why the URL may not carry TLS settings.
	return {
		url,
		...(new URL(url).protocol === "smtps:"
			? { secure: true }
			: { secure: false, requireTLS: true }),
		tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
	};
}
