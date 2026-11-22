import { calendars, member, practitioners, sites, user } from "@apercura/db/schema";
import { render } from "@react-email/render";
import { eq } from "drizzle-orm";
import { createTranslator } from "next-intl";
import { BookingEmail, type BookingEmailProps } from "~/emails/booking-email";
import { messagesFor } from "~/i18n/catalogs";
import { type Locale, toLocale } from "~/i18n/locales";
import { buildIcs } from "~/lib/ics";
import type { Executor } from "~/server/db-executor";
import {
	type AuditContext,
	manageTokenFor,
	type PatientField,
	readAppointmentPatients,
	revealOtpCode,
} from "~/server/phi";
import { siteAddressLine } from "~/server/queries/site-address";
import {
	agendaUrl,
	appOrigin,
	formatSlot,
	manageUrl,
	practitionerPageUrl,
	senderAddress,
} from "./format";
import type { OutboxKind } from "./outbox";
import type { AppointmentRow } from "./transitions";

export interface RenderedMail {
	to: string[];
	subject: string;
	html: string;
	text: string;
	ics?: { method: "REQUEST" | "CANCEL"; content: string } | null;
}

export type OutboxRow = {
	id: string;
	organizationId: string;
	kind: string;
	recipient: string;
	otpChallengeId: string | null;
};

/** Template keys (namespace `booking.email`) of each outbox kind. */
const TEMPLATE: Record<OutboxKind, string> = {
	booking_code: "code",
	booking_confirmed: "confirmed",
	booking_pending: "pending",
	booking_accepted: "accepted",
	booking_declined: "declined",
	request_expired: "expired",
	booking_cancelled_by_patient: "cancelledByPatient",
	booking_cancelled_by_practice: "cancelledByPractice",
	booking_rescheduled: "rescheduled",
	reminder: "reminder",
	practice_entry: "practiceEntry",
	practice_new: "practiceNew",
	practice_request: "practiceRequest",
	practice_cancelled: "practiceCancelled",
	practice_rescheduled: "practiceRescheduled",
};

const ICS_METHOD: Partial<Record<OutboxKind, "REQUEST" | "CANCEL">> = {
	booking_confirmed: "REQUEST",
	booking_accepted: "REQUEST",
	booking_rescheduled: "REQUEST",
	booking_cancelled_by_patient: "CANCEL",
	booking_cancelled_by_practice: "CANCEL",
};

/** Kinds whose email carries the slip (practitioner, date, time, address). */
const WITH_DETAILS = new Set<OutboxKind>([
	"booking_confirmed",
	"booking_pending",
	"booking_accepted",
	"booking_declined",
	"request_expired",
	"booking_cancelled_by_patient",
	"booking_cancelled_by_practice",
	"booking_rescheduled",
	"reminder",
]);

/** Kinds that leave the patient without an appointment: they link to the practitioner's page. */
const WITH_BOOK_AGAIN_LINK = new Set<OutboxKind>([
	"booking_declined",
	"request_expired",
	"booking_cancelled_by_practice",
]);

/** Kinds that link to the manage page. */
const WITH_MANAGE_LINK = new Set<OutboxKind>([
	"booking_confirmed",
	"booking_pending",
	"booking_accepted",
	"booking_rescheduled",
	"reminder",
	"practice_entry",
]);

interface Place {
	practitionerName: string;
	practitionerSlug: string;
	address: string | null;
	timeZone: string;
}

async function loadPlace(
	db: Executor,
	appointment: AppointmentRow,
	locale: Locale,
): Promise<Place> {
	const [row] = await db
		.select({
			timeZone: calendars.timeZone,
			titleCode: practitioners.titleCode,
			firstName: practitioners.firstName,
			lastName: practitioners.lastName,
			slug: practitioners.slug,
			siteName: sites.name,
			addressLine: siteAddressLine,
			postcode: sites.postcode,
			communeLabel: sites.communeLabel,
		})
		.from(calendars)
		.innerJoin(practitioners, eq(practitioners.id, calendars.practitionerId))
		.innerJoin(sites, eq(sites.id, calendars.siteId))
		.where(eq(calendars.id, appointment.calendarId))
		.limit(1);
	if (!row) {
		throw new Error("Calendar of the appointment is missing");
	}
	const titles = messagesFor(locale).taxonomy.title as Record<string, string>;
	const title = row.titleCode ? titles[row.titleCode] : undefined;
	const town = [row.postcode, row.communeLabel].filter(Boolean).join(" ");
	return {
		practitionerName: [title, row.firstName, row.lastName].filter(Boolean).join(" "),
		practitionerSlug: row.slug,
		address: [row.addressLine, town].filter(Boolean).join(", ") || row.siteName || null,
		timeZone: row.timeZone,
	};
}

function translator(locale: Locale) {
	const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "booking.email" });
	// Template keys are chosen at run time from the outbox kind.
	return (key: string, values?: Record<string, string>) => t(key as never, values as never);
}

async function renderMail(props: BookingEmailProps) {
	const element = <BookingEmail {...props} />;
	const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
	return { html, text };
}

/**
 * Renders the email(s) of one outbox row. Patient data is decrypted here, at send time, under
 * the audited actor `system:notify`. Patient emails stay minimal (no specialty, no reason);
 * practice notifications never carry the patient's name.
 */
export async function composeMail(
	db: Executor,
	entry: OutboxRow,
	appointment: AppointmentRow,
	nowMs: number,
): Promise<RenderedMail[]> {
	const kind = entry.kind as OutboxKind;
	const audit: AuditContext = {
		organizationId: entry.organizationId,
		actor: "system:notify",
		purpose: `notify:${kind}`,
		requestId: entry.id,
	};
	return entry.recipient === "practice"
		? composePracticeMail(db, kind, appointment)
		: composePatientMail(db, kind, entry, appointment, audit, nowMs);
}

async function composePatientMail(
	db: Executor,
	kind: OutboxKind,
	entry: OutboxRow,
	appointment: AppointmentRow,
	audit: AuditContext,
	nowMs: number,
): Promise<RenderedMail[]> {
	const locale = toLocale(appointment.patientLocale);
	const t = translator(locale);
	const fields: PatientField[] = ["email", "firstName", "lastName"];
	if (kind === "booking_cancelled_by_practice") {
		fields.push("practiceMessage");
	}
	const patient = (await readAppointmentPatients(db, audit, [appointment.id], fields)).get(
		appointment.id,
	);
	if (!patient?.email) {
		return [];
	}
	const place = await loadPlace(db, appointment, locale);
	const slot = formatSlot(appointment.startsAt.getTime(), place.timeZone, locale);
	const key = TEMPLATE[kind];
	const values = { practitioner: place.practitionerName, date: slot.shortDate };

	let code: string | null = null;
	if (kind === "booking_code") {
		code = entry.otpChallengeId ? await revealOtpCode(db, audit, entry.otpChallengeId) : null;
		if (!code) {
			return [];
		}
	}

	const paragraphs: string[] = [];
	if (patient.firstName && kind !== "practice_entry") {
		paragraphs.push(t("greeting", { name: patient.firstName }));
	}
	paragraphs.push(t(`${key}.body`));
	if (kind === "booking_cancelled_by_practice" && patient.practiceMessage) {
		paragraphs.push(t("cancelledByPractice.message", { message: patient.practiceMessage }));
	}

	const details: { label: string; value: string }[] = WITH_DETAILS.has(kind)
		? [
				{ label: t("labels.with"), value: place.practitionerName },
				{ label: t("labels.date"), value: slot.date },
				{ label: t("labels.time"), value: slot.time },
				...(place.address ? [{ label: t("labels.address"), value: place.address }] : []),
			]
		: [];
	if (kind === "booking_pending" && appointment.expiresAt) {
		// The patient knows until when the practice may answer.
		const deadline = formatSlot(appointment.expiresAt.getTime(), place.timeZone, locale);
		details.push({ label: t("labels.until"), value: `${deadline.date}, ${deadline.time}` });
	}

	const token =
		WITH_MANAGE_LINK.has(kind) && appointment.manageTokenNonce
			? manageTokenFor(appointment.id, appointment.manageTokenNonce)
			: null;
	const method = ICS_METHOD[kind] ?? null;
	const notes: string[] = [];
	if (kind === "booking_code") {
		notes.push(t("code.expiry"), t("code.ignore"));
	}
	if (kind === "practice_entry") {
		notes.push(t("practiceEntry.ignore"));
	}
	if (method === "REQUEST") {
		notes.push(t("calendarNote"));
	}

	const { html, text } = await renderMail({
		lang: locale,
		preview: t(`${key}.preview`),
		wordmark: t("wordmark"),
		runningHead: t("runningHead"),
		footer: t("footer"),
		title: t(`${key}.title`),
		paragraphs,
		details,
		code,
		action: token
			? { href: manageUrl(locale, token), label: t("manageAction"), fallback: t("fallback") }
			: WITH_BOOK_AGAIN_LINK.has(kind)
				? {
						href: practitionerPageUrl(locale, place.practitionerSlug),
						label: t("bookAgainAction"),
						fallback: t("fallback"),
					}
				: null,
		notes,
	});

	const sender = senderAddress();
	const ics = method
		? {
				method,
				content: buildIcs({
					method,
					uid: `${appointment.id}@${new URL(appOrigin()).hostname}`,
					sequence: appointment.revision,
					startsAt: appointment.startsAt,
					endsAt: appointment.endsAt,
					stampedAt: new Date(nowMs),
					summary: t("summary", { practitioner: place.practitionerName }),
					location: place.address,
					organizer: sender,
					attendee: {
						name: [patient.firstName, patient.lastName].filter(Boolean).join(" "),
						email: patient.email,
					},
				}),
			}
		: null;

	return [
		{
			to: [patient.email],
			subject:
				kind === "booking_code"
					? t("code.subject", { code: code ?? "" })
					: t(`${key}.subject`, values),
			html,
			text,
			ics,
		},
	];
}

/** Members who receive practice notifications: owners and practitioners, never assistants. */
async function practiceRecipients(db: Executor, organizationId: string) {
	const rows = await db
		.select({ email: user.email, locale: user.locale, role: member.role })
		.from(member)
		.innerJoin(user, eq(user.id, member.userId))
		.where(eq(member.organizationId, organizationId));
	return rows.filter((row) =>
		row.role.split(",").some((role) => ["owner", "practitioner"].includes(role.trim())),
	);
}

async function composePracticeMail(
	db: Executor,
	kind: OutboxKind,
	appointment: AppointmentRow,
): Promise<RenderedMail[]> {
	const recipients = await practiceRecipients(db, appointment.organizationId);
	const byLocale = new Map<Locale, string[]>();
	for (const recipient of recipients) {
		const locale = toLocale(recipient.locale);
		byLocale.set(locale, [...(byLocale.get(locale) ?? []), recipient.email]);
	}
	const mails: RenderedMail[] = [];
	for (const [locale, to] of byLocale) {
		const t = translator(locale);
		const place = await loadPlace(db, appointment, locale);
		const slot = formatSlot(appointment.startsAt.getTime(), place.timeZone, locale);
		const key = TEMPLATE[kind];
		const details = [
			{ label: t("labels.date"), value: slot.date },
			{ label: t("labels.time"), value: slot.time },
			...(place.address ? [{ label: t("labels.address"), value: place.address }] : []),
		];
		if (kind === "practice_request" && appointment.expiresAt) {
			const deadline = formatSlot(appointment.expiresAt.getTime(), place.timeZone, locale);
			details.push({ label: t("labels.until"), value: `${deadline.date}, ${deadline.time}` });
		}
		const { html, text } = await renderMail({
			lang: locale,
			preview: t(`${key}.preview`),
			wordmark: t("wordmark"),
			runningHead: t("practiceRunningHead"),
			footer: t("footer"),
			title: t(`${key}.title`),
			paragraphs: [t(`${key}.body`)],
			details,
			action: { href: agendaUrl(locale), label: t("agendaAction"), fallback: t("fallback") },
		});
		mails.push({ to, subject: t(`${key}.subject`, { date: slot.shortDate }), html, text });
	}
	return mails;
}
