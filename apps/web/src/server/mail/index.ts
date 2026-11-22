import "server-only";
import { render } from "@react-email/render";
import nodemailer, { type Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import type { ReactElement } from "react";
import { serverEnv } from "~/env";
import { smtpTransportOptions } from "./smtp-options";

const TIMEOUT_MS = 10_000;

let transporter: Transporter | undefined;

/**
 * SMTP transport from SMTP_URL (Mailpit in development), with 10 s timeouts. In production TLS
 * is required (see ./smtp-options): implicit with `smtps://`, STARTTLS with `smtp://`.
 */
function getTransporter(): Transporter {
	transporter ??= nodemailer.createTransport({
		...smtpTransportOptions({
			NODE_ENV: process.env.NODE_ENV,
			SMTP_URL: serverEnv.SMTP_URL,
			SMTP_ALLOW_INSECURE: serverEnv.SMTP_ALLOW_INSECURE,
		}),
		connectionTimeout: TIMEOUT_MS,
		greetingTimeout: TIMEOUT_MS,
		socketTimeout: TIMEOUT_MS,
	} satisfies SMTPTransport.Options);
	return transporter;
}

export interface MailMessage {
	to: string;
	subject: string;
	/** React Email element; the plain-text part is derived from it. */
	react: ReactElement;
}

export async function sendMail({ to, subject, react }: MailMessage) {
	const [html, text] = await Promise.all([render(react), render(react, { plainText: true })]);
	await getTransporter().sendMail({
		from: serverEnv.MAIL_FROM ?? "Apercura <no-reply@localhost>",
		to,
		subject,
		html,
		text,
	});
}

export interface RawMailMessage {
	to: string | string[];
	subject: string;
	html: string;
	text: string;
	/** An iCalendar invitation (REQUEST or CANCEL), sent as `text/calendar` and attached. */
	icalEvent?: { method: "REQUEST" | "CANCEL"; filename: string; content: string };
}

/** Sends an already rendered message (booking outbox). Errors keep Nodemailer's SMTP details. */
export async function sendRawMail(message: RawMailMessage) {
	await getTransporter().sendMail({
		from: serverEnv.MAIL_FROM ?? "Apercura <no-reply@localhost>",
		to: message.to,
		subject: message.subject,
		html: message.html,
		text: message.text,
		...(message.icalEvent ? { icalEvent: message.icalEvent } : {}),
	});
}
