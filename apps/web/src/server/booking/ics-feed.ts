import type { Database } from "@apercura/db";
import { appointments, calendars, member, user } from "@apercura/db/schema";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { createTranslator } from "next-intl";
import { escapeText, foldLine, icsUtc } from "~/lib/ics";
import { hashOpaqueToken, readAppointmentPatients } from "~/server/phi";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import { BOOKING_LIMITS } from "./config";
import { appOrigin } from "./format";

const DAY_MS = 86_400_000;
/** The feed covers the last 30 days and the next 120 (calendar apps poll it every few hours). */
const PAST_DAYS = 30;
const FUTURE_DAYS = 120;

/** A token is 32 random bytes in base64url (43 characters); `.ics` may follow it. */
const TOKEN = /^([A-Za-z0-9_-]{43})(?:\.ics)?$/;

export interface FeedEntry {
	id: string;
	kind: "appointment" | "block";
	status: string;
	typeName: string | null;
	startsAt: Date;
	endsAt: Date;
	revision: number;
	patient: { firstName: string | null; lastName: string | null } | null;
}

/** "A. S." from a first and last name; compound names keep one initial per part. */
export function initials(firstName: string | null, lastName: string | null): string {
	const letters = [firstName, lastName]
		.flatMap((part) => (part ?? "").split(/[\s-]+/))
		.filter(Boolean)
		.map((part) => `${part.charAt(0).toLocaleUpperCase("fr")}.`);
	return letters.join(" ");
}

/**
 * The private iCalendar feed of one calendar (RFC 5545, `METHOD:PUBLISH`): appointments and
 * blocks, one VEVENT each with a stable UID and `SEQUENCE` = revision. Patients appear by their
 * initials unless the owner turned full names on.
 */
export function buildFeed(options: {
	name: string;
	entries: readonly FeedEntry[];
	fullNames: boolean;
	stampedAt: Date;
	host: string;
	labels: { block: string; pending: string; appointment: string };
}): string {
	const events = options.entries.flatMap((entry) => {
		const who = entry.patient
			? options.fullNames
				? [entry.patient.firstName, entry.patient.lastName].filter(Boolean).join(" ")
				: initials(entry.patient.firstName, entry.patient.lastName)
			: "";
		const title =
			entry.kind === "block"
				? options.labels.block
				: [entry.typeName ?? options.labels.appointment, who].filter(Boolean).join(" · ");
		const summary = entry.status === "pending" ? `${options.labels.pending} ${title}` : title;
		return [
			"BEGIN:VEVENT",
			`UID:${entry.id}@${options.host}`,
			`DTSTAMP:${icsUtc(options.stampedAt)}`,
			`SEQUENCE:${entry.revision}`,
			`DTSTART:${icsUtc(entry.startsAt)}`,
			`DTEND:${icsUtc(entry.endsAt)}`,
			`SUMMARY:${escapeText(summary)}`,
			`STATUS:${entry.status === "pending" ? "TENTATIVE" : "CONFIRMED"}`,
			"TRANSP:OPAQUE",
			"CLASS:PRIVATE",
			"END:VEVENT",
		];
	});
	const lines = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//Apercura//Agenda feed//EN",
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		`X-WR-CALNAME:${escapeText(options.name)}`,
		...events,
		"END:VCALENDAR",
	];
	return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

export type FeedResult = { status: 200; body: string } | { status: 404 } | { status: 429 };

/**
 * Answers `GET /api/ics/{token}`. An unknown, rotated or revoked token is a plain 404. Reading
 * names goes through the `phi` module like every decryption, audited as `system:ics_feed`.
 */
export async function readFeed(
	db: Database,
	rawToken: string,
	options: {
		nowMs: number;
		rateLimit: (key: string, rule: { max: number; windowSeconds: number }) => Promise<boolean>;
		requestId: string;
	},
): Promise<FeedResult> {
	const token = TOKEN.exec(rawToken)?.[1];
	if (!token) {
		return { status: 404 };
	}
	const tokenHash = hashOpaqueToken(token);
	const [calendar] = await db
		.select({
			id: calendars.id,
			organizationId: calendars.organizationId,
			fullNames: calendars.icsFullNames,
		})
		.from(calendars)
		.where(eq(calendars.icsTokenHash, tokenHash))
		.limit(1);
	if (!calendar) {
		return { status: 404 };
	}
	if (
		!(await options.rateLimit(`ics:${tokenHash.slice(0, 32)}`, BOOKING_LIMITS.feedReadsPerToken))
	) {
		return { status: 429 };
	}
	const rows = await db
		.select({
			id: appointments.id,
			kind: appointments.kind,
			status: appointments.status,
			typeName: appointments.typeName,
			startsAt: appointments.startsAt,
			endsAt: appointments.endsAt,
			revision: appointments.revision,
			purgedAt: appointments.purgedAt,
		})
		.from(appointments)
		.where(
			and(
				eq(appointments.calendarId, calendar.id),
				eq(appointments.organizationId, calendar.organizationId),
				inArray(appointments.status, ["pending", "confirmed", "completed", "no_show"]),
				gte(appointments.startsAt, new Date(options.nowMs - PAST_DAYS * DAY_MS)),
				lt(appointments.startsAt, new Date(options.nowMs + FUTURE_DAYS * DAY_MS)),
			),
		)
		.orderBy(asc(appointments.startsAt));
	const withPatient = rows.filter((row) => row.kind === "appointment" && row.purgedAt === null);
	const patients = await readAppointmentPatients(
		db,
		{
			organizationId: calendar.organizationId,
			actor: "system:ics_feed",
			userId: null,
			purpose: "ics_feed",
			requestId: options.requestId,
		},
		withPatient.map((row) => row.id),
		["firstName", "lastName"],
	);
	const [owner] = await db
		.select({ locale: user.locale })
		.from(member)
		.innerJoin(user, eq(user.id, member.userId))
		.where(and(eq(member.organizationId, calendar.organizationId), eq(member.role, "owner")))
		.limit(1);
	const locale = owner?.locale === "en" ? "en" : "fr";
	const t = createTranslator({
		locale,
		messages: locale === "en" ? en : fr,
		namespace: "Agenda.feed",
	});
	const host = new URL(appOrigin()).host;
	const body = buildFeed({
		name: t("name"),
		fullNames: calendar.fullNames,
		stampedAt: new Date(options.nowMs),
		host,
		labels: { block: t("block"), pending: t("pending"), appointment: t("appointment") },
		entries: rows.map((row) => {
			const patient = patients.get(row.id);
			return {
				id: row.id,
				kind: row.kind as FeedEntry["kind"],
				status: row.status,
				typeName: row.typeName,
				startsAt: row.startsAt,
				endsAt: row.endsAt,
				revision: row.revision,
				patient: patient ? { firstName: patient.firstName, lastName: patient.lastName } : null,
			};
		}),
	});
	return { status: 200, body };
}

/** The feed URL shown once, right after a token is issued. */
export function feedUrl(token: string): string {
	return `${appOrigin()}/api/ics/${token}.ics`;
}
