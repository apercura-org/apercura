import { presetsForSpecialty } from "@apercura/core/booking";
import {
	parseLocalDate,
	parseLocalDateTime,
	parseLocalTime,
	timeZoneForDepartment,
} from "@apercura/core/time";
import type { Database } from "@apercura/db";
import {
	activities,
	appointmentTypes,
	availabilityExceptions,
	availabilityRules,
	calendars,
	places,
	practitioners,
	sites,
} from "@apercura/db/schema";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { createTranslator } from "next-intl";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import { findCalendar } from "./availability";
import { BookingError, isUniqueViolation } from "./errors";
import { agendaRequirements } from "./gate";
import { refreshNextFreeFor } from "./next-free";
import type { BookingRuntime } from "./runtime";

/*
 * Calendar settings for owners (`calendar.*`): calendars per site (time zone
 * from the site's department), appointment types (from presets), weekly rules
 * and exceptions. Every query is scoped by the organization the membership
 * check injected.
 */

export interface CalendarSettingsInput {
	minNoticeMin?: number | undefined;
	horizonDays?: number | undefined;
	stepMin?: number | undefined;
	manualValidation?: boolean | undefined;
	acceptsNewPatients?: boolean | undefined;
	cancellationCutoffMin?: number | undefined;
	requirePhone?: boolean | undefined;
	askFirstVisit?: boolean | undefined;
	retentionDays?: number | undefined;
	publicInstructions?: string | null | undefined;
}

function settingsPatch(input: CalendarSettingsInput) {
	return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

/** Presets of the practitioner's specialty, names translated (they become the owner's text). */
export async function presetsFor(
	db: Database,
	organizationId: string,
	practitionerId: number,
	locale: "fr" | "en",
) {
	const [row] = await db
		.select({ listingSlug: practitioners.listingSlug })
		.from(practitioners)
		.where(and(eq(practitioners.id, practitionerId), eq(practitioners.ownerOrgId, organizationId)))
		.limit(1);
	if (!row) {
		throw new BookingError("NOT_FOUND");
	}
	const t = createTranslator({ locale, messages: locale === "en" ? en : fr });
	return presetsForSpecialty(row.listingSlug ?? "").map((preset) => ({
		...preset,
		name: t(preset.nameKey as never),
	}));
}

export async function listCalendars(db: Database, organizationId: string) {
	const rows = await db
		.select()
		.from(calendars)
		.where(eq(calendars.organizationId, organizationId))
		.orderBy(asc(calendars.createdAt));
	if (rows.length === 0) {
		return [];
	}
	const ids = rows.map((row) => row.id);
	const [types, rules, exceptions] = await Promise.all([
		db
			.select()
			.from(appointmentTypes)
			.where(inArray(appointmentTypes.calendarId, ids))
			.orderBy(asc(appointmentTypes.position)),
		db.select().from(availabilityRules).where(inArray(availabilityRules.calendarId, ids)),
		db.select().from(availabilityExceptions).where(inArray(availabilityExceptions.calendarId, ids)),
	]);
	return rows.map(({ icsTokenHash: _hidden, ...calendar }) => ({
		...calendar,
		types: types.filter((type) => type.calendarId === calendar.id),
		rules: rules.filter((rule) => rule.calendarId === calendar.id),
		exceptions: exceptions.filter((exception) => exception.calendarId === calendar.id),
	}));
}

/**
 * Creates a draft calendar for a practitioner of the organization at one of their sites. The
 * time zone comes from the site's department (overseas departments have their own).
 */
export async function createCalendar(
	db: Database,
	organizationId: string,
	input: {
		practitionerId: number;
		siteId: number;
		withPresets: boolean;
		locale: "fr" | "en";
		settings?: CalendarSettingsInput;
	},
) {
	const [site] = await db
		.select({ siteId: sites.id, departmentCode: places.departmentCode })
		.from(activities)
		.innerJoin(practitioners, eq(practitioners.id, activities.practitionerId))
		.innerJoin(sites, eq(sites.id, activities.siteId))
		.leftJoin(places, eq(places.id, sites.placeId))
		.where(
			and(
				eq(activities.practitionerId, input.practitionerId),
				eq(activities.siteId, input.siteId),
				isNull(activities.removedAt),
				eq(practitioners.ownerOrgId, organizationId),
			),
		)
		.limit(1);
	if (!site) {
		throw new BookingError("NOT_FOUND");
	}
	let timeZone: string;
	try {
		timeZone = timeZoneForDepartment(site.departmentCode ?? "");
	} catch {
		throw new BookingError("INVALID_INPUT", "UNKNOWN_TIME_ZONE");
	}
	const presets = input.withPresets
		? await presetsFor(db, organizationId, input.practitionerId, input.locale)
		: [];
	try {
		return await db.transaction(async (tx) => {
			const [calendar] = await tx
				.insert(calendars)
				.values({
					organizationId,
					practitionerId: input.practitionerId,
					siteId: input.siteId,
					timeZone,
					...settingsPatch(input.settings ?? {}),
				})
				.returning();
			if (!calendar) {
				throw new BookingError("NOT_FOUND");
			}
			if (presets.length > 0) {
				await tx.insert(appointmentTypes).values(
					presets.map((preset, position) => ({
						organizationId,
						calendarId: calendar.id,
						name: preset.name,
						durationMin: preset.durationMin,
						beforeMin: preset.beforeMin,
						afterMin: preset.afterMin,
						audience: preset.audience,
						position,
						presetKey: preset.nameKey,
					})),
				);
			}
			return calendar;
		});
	} catch (error) {
		if (isUniqueViolation(error, "calendars_practitioner_site_uq")) {
			throw new BookingError("IDEMPOTENCY_CONFLICT", "CALENDAR_EXISTS");
		}
		throw error;
	}
}

export async function updateCalendar(
	rt: BookingRuntime,
	organizationId: string,
	calendarId: string,
	settings: CalendarSettingsInput,
) {
	const calendar = await findCalendar(rt.db, calendarId, { organizationId });
	const patch = settingsPatch(settings);
	if (Object.keys(patch).length > 0) {
		await rt.db.update(calendars).set(patch).where(eq(calendars.id, calendar.id));
	}
	await refreshNextFreeFor(rt, calendar.practitionerId);
	return findCalendar(rt.db, calendarId, { organizationId });
}

/**
 * Opens (`open`) or pauses the online agenda. Opening requires the agenda requirements (verified
 * claim, fees and payment methods), at least one active type and one opening window.
 */
export async function setCalendarStatus(
	rt: BookingRuntime,
	organizationId: string,
	calendarId: string,
	status: "open" | "paused",
) {
	const calendar = await findCalendar(rt.db, calendarId, { organizationId });
	if (status === "open") {
		const requirements = await agendaRequirements(rt.db, organizationId, calendar.practitionerId);
		const [type] = await rt.db
			.select({ id: appointmentTypes.id })
			.from(appointmentTypes)
			.where(and(eq(appointmentTypes.calendarId, calendar.id), eq(appointmentTypes.active, true)))
			.limit(1);
		const [rule] = await rt.db
			.select({ id: availabilityRules.id })
			.from(availabilityRules)
			.where(eq(availabilityRules.calendarId, calendar.id))
			.limit(1);
		const [openException] = await rt.db
			.select({ id: availabilityExceptions.id })
			.from(availabilityExceptions)
			.where(
				and(
					eq(availabilityExceptions.calendarId, calendar.id),
					eq(availabilityExceptions.kind, "open"),
				),
			)
			.limit(1);
		if (!requirements.ready || !type || (!rule && !openException)) {
			throw new BookingError("AGENDA_NOT_READY");
		}
	}
	await rt.db
		.update(calendars)
		.set({
			status,
			...(status === "open" && !calendar.openedAt ? { openedAt: new Date(rt.nowMs()) } : {}),
		})
		.where(eq(calendars.id, calendar.id));
	// Opening or pausing changes what the practitioner's page offers even when the slot does not.
	await refreshNextFreeFor(rt, calendar.practitionerId, { force: true });
	return { status };
}

export interface TypeInput {
	name: string;
	durationMin: number;
	beforeMin: number;
	afterMin: number;
	audience: "all" | "new" | "existing";
	position?: number | undefined;
	active?: boolean | undefined;
}

export async function saveType(
	rt: BookingRuntime,
	organizationId: string,
	input: TypeInput & { calendarId: string; typeId?: string | undefined },
) {
	const calendar = await findCalendar(rt.db, input.calendarId, { organizationId });
	const values = {
		name: input.name.trim(),
		durationMin: input.durationMin,
		beforeMin: input.beforeMin,
		afterMin: input.afterMin,
		audience: input.audience,
		...(input.position === undefined ? {} : { position: input.position }),
		...(input.active === undefined ? {} : { active: input.active }),
	};
	let saved: typeof appointmentTypes.$inferSelect | undefined;
	if (input.typeId) {
		[saved] = await rt.db
			.update(appointmentTypes)
			.set(values)
			.where(
				and(eq(appointmentTypes.id, input.typeId), eq(appointmentTypes.calendarId, calendar.id)),
			)
			.returning();
	} else {
		[saved] = await rt.db
			.insert(appointmentTypes)
			.values({ ...values, organizationId, calendarId: calendar.id })
			.returning();
	}
	if (!saved) {
		throw new BookingError("NOT_FOUND");
	}
	await refreshNextFreeFor(rt, calendar.practitionerId);
	return saved;
}

export interface RuleInput {
	weekday: number;
	startTime: string;
	endTime: string;
	typeIds?: string[] | undefined;
	validFrom?: string | null | undefined;
	validUntil?: string | null | undefined;
}

function assertRule(rule: RuleInput) {
	try {
		if (!Number.isInteger(rule.weekday) || rule.weekday < 1 || rule.weekday > 7) {
			throw new RangeError("weekday");
		}
		if (parseLocalTime(rule.endTime) <= parseLocalTime(rule.startTime)) {
			throw new RangeError("times");
		}
		if (rule.validFrom) parseLocalDate(rule.validFrom);
		if (rule.validUntil) parseLocalDate(rule.validUntil);
	} catch {
		throw new BookingError("INVALID_INPUT");
	}
}

async function assertTypeIds(
	db: Database,
	calendarId: string,
	typeIds: readonly string[],
): Promise<void> {
	if (typeIds.length === 0) {
		return;
	}
	const found = await db
		.select({ id: appointmentTypes.id })
		.from(appointmentTypes)
		.where(
			and(eq(appointmentTypes.calendarId, calendarId), inArray(appointmentTypes.id, [...typeIds])),
		);
	if (found.length !== new Set(typeIds).size) {
		throw new BookingError("INVALID_INPUT");
	}
}

/** Replaces every weekly rule of a calendar at once. */
export async function replaceRules(
	rt: BookingRuntime,
	organizationId: string,
	calendarId: string,
	rules: readonly RuleInput[],
) {
	const calendar = await findCalendar(rt.db, calendarId, { organizationId });
	rules.forEach(assertRule);
	await assertTypeIds(
		rt.db,
		calendar.id,
		rules.flatMap((rule) => rule.typeIds ?? []),
	);
	await rt.db.transaction(async (tx) => {
		await tx.delete(availabilityRules).where(eq(availabilityRules.calendarId, calendar.id));
		if (rules.length > 0) {
			await tx.insert(availabilityRules).values(
				rules.map((rule) => ({
					organizationId,
					calendarId: calendar.id,
					weekday: rule.weekday,
					startTime: rule.startTime,
					endTime: rule.endTime,
					typeIds: rule.typeIds ?? [],
					validFrom: rule.validFrom ?? null,
					validUntil: rule.validUntil ?? null,
				})),
			);
		}
	});
	await refreshNextFreeFor(rt, calendar.practitionerId);
	return { count: rules.length };
}

export type ExceptionInput =
	| {
			kind: "closed" | "open";
			span: "days";
			fromDate: string;
			untilDate: string;
			typeIds?: string[];
	  }
	| { kind: "closed" | "open"; span: "time"; from: string; until: string; typeIds?: string[] };

export async function addException(
	rt: BookingRuntime,
	organizationId: string,
	calendarId: string,
	exception: ExceptionInput,
) {
	const calendar = await findCalendar(rt.db, calendarId, { organizationId });
	try {
		if (exception.span === "days") {
			if (parseLocalDate(exception.untilDate).compare(parseLocalDate(exception.fromDate)) < 0) {
				throw new RangeError("order");
			}
		} else {
			const from = parseLocalDateTime(exception.from);
			const until = parseLocalDateTime(exception.until);
			const order = until.date.compare(from.date) || until.minutes - from.minutes;
			if (order <= 0) {
				throw new RangeError("order");
			}
		}
	} catch {
		throw new BookingError("INVALID_INPUT");
	}
	await assertTypeIds(rt.db, calendar.id, exception.typeIds ?? []);
	const [row] = await rt.db
		.insert(availabilityExceptions)
		.values({
			organizationId,
			calendarId: calendar.id,
			kind: exception.kind,
			span: exception.span,
			fromDate: exception.span === "days" ? exception.fromDate : null,
			untilDate: exception.span === "days" ? exception.untilDate : null,
			fromLocal: exception.span === "time" ? exception.from : null,
			untilLocal: exception.span === "time" ? exception.until : null,
			typeIds: exception.typeIds ?? [],
		})
		.returning();
	await refreshNextFreeFor(rt, calendar.practitionerId);
	return row;
}

export async function removeException(
	rt: BookingRuntime,
	organizationId: string,
	exceptionId: string,
) {
	const [row] = await rt.db
		.delete(availabilityExceptions)
		.where(
			and(
				eq(availabilityExceptions.id, exceptionId),
				eq(availabilityExceptions.organizationId, organizationId),
			),
		)
		.returning({ calendarId: availabilityExceptions.calendarId });
	if (!row) {
		throw new BookingError("NOT_FOUND");
	}
	const calendar = await findCalendar(rt.db, row.calendarId, { organizationId });
	await refreshNextFreeFor(rt, calendar.practitionerId);
	return { removed: true };
}
