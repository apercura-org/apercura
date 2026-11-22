import nodemailer from "nodemailer";
import {
	type SmtpEnv,
	smtpAllowInsecure,
	smtpTransportOptions,
	smtpUrlProblem,
} from "./smtp-options";

const CHECK_TIMEOUT_MS = 5_000;

/**
 * Start-up check of the mail transport in production (instrumentation.ts): refuses an SMTP_URL
 * that breaks the TLS rules (./smtp-options) and, for `smtp://`, a server that cannot upgrade
 * the connection with STARTTLS (Nodemailer's `ETLS`: no STARTTLS, or a certificate that does not
 * verify). A server that cannot be reached at that moment only logs a warning: mail is retried
 * later and must not keep the site down. No-op outside production, without SMTP_URL, or with
 * SMTP_ALLOW_INSECURE=true.
 */
export async function assertSmtpTls(env: SmtpEnv): Promise<void> {
	if (
		env.NODE_ENV !== "production" ||
		!env.SMTP_URL ||
		smtpAllowInsecure(env.SMTP_ALLOW_INSECURE)
	) {
		return;
	}
	const problem = smtpUrlProblem(env);
	if (problem) {
		throw new Error(problem);
	}
	if (new URL(env.SMTP_URL).protocol !== "smtp:") {
		// smtps:// is TLS from the first byte; Nodemailer verifies the certificate on every send.
		return;
	}
	const transport = nodemailer.createTransport({
		...smtpTransportOptions(env),
		connectionTimeout: CHECK_TIMEOUT_MS,
		greetingTimeout: CHECK_TIMEOUT_MS,
		socketTimeout: CHECK_TIMEOUT_MS,
	});
	try {
		await transport.verify();
	} catch (error) {
		const code = (error as { code?: unknown }).code;
		if (code === "ETLS") {
			throw new Error(
				"The SMTP server of SMTP_URL cannot do STARTTLS (or its certificate does not verify): production requires TLS. Use smtps:// or a provider with STARTTLS; SMTP_ALLOW_INSECURE=true is for a local catcher only.",
			);
		}
		if (code !== "EAUTH") {
			console.warn(
				`SMTP check at start-up failed (${String(code ?? "unknown")}); mail will be retried.`,
			);
		}
	} finally {
		transport.close();
	}
}
