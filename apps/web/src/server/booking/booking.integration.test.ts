/**
 * Booking against a real, migrated database (DATABASE_URL_TEST): the overlap constraint under
 * concurrency, the hold → code → verify → manage flow, staff procedures, the outbox and the jobs.
 * Synthetic data only. Skipped when the variable is unset; CI runs it in the `migrations` job.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { instantToLocalDate, localToInstant } from "@apercura/core/time";
import { createDb, type Database } from "@apercura/db";
import {
	activities,
	appointments,
	auditEvents,
	member,
	organization,
	outbox,
	places,
	practitionerProfiles,
	practitioners,
	session,
	sites,
	user,
} from "@apercura/db/schema";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { solveChallenge } from "altcha-lib";
import { deriveKey as sha } from "altcha-lib/algorithms/sha";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readAppointmentPatients } from "~/server/phi";
import { dataKeyCache } from "~/server/phi/keys";
import { consumeRateLimit } from "~/server/rate-limit";
import {
	type Context,
	createCallerFactory,
	createTRPCRouter,
	type SessionContext,
} from "~/trpc/init";
import { agendaRouter } from "~/trpc/routers/agenda";
import { bookingRouter } from "~/trpc/routers/booking";
import { calendarRouter } from "~/trpc/routers/calendar";
import { BROWSER_COOKIE } from "./config";
import { assertBookingConstraints } from "./constraints";
import { enqueueReminders, expireLapsed, purge, refreshAllNextFree } from "./jobs";
import type { RenderedMail } from "./mail-content";
import { enqueueOutbox } from "./outbox";
import { configureMailTransport, PermanentMailError, processOutbox } from "./outbox-worker";
import { createProofChallenge, encodeProof } from "./proof";

const url = process.env.DATABASE_URL_TEST;

process.env.FEATURE_BOOKING = "true";
process.env.ENCRYPTION_KEYS = `1:${randomBytes(32).toString("base64")}`;
process.env.ENCRYPTION_ACTIVE_KEY = "1";
process.env.BLIND_INDEX_KEY = randomBytes(32).toString("base64");
process.env.ALTCHA_HMAC_KEY = randomBytes(32).toString("base64");
process.env.APP_URL = "https://apercura.example";
process.env.MAIL_FROM = "Apercura <no-reply@apercura.example>";

const MINUTE = 60_000;
const DAY = 86_400_000;

const router = createTRPCRouter({
	booking: bookingRouter,
	agenda: agendaRouter,
	calendar: calendarRouter,
});
const createCaller = createCallerFactory(router);

describe.skipIf(!url)("booking (database)", () => {
	let db: Database;
	const run = randomUUID().slice(0, 8);
	const id = (name: string) => `${name}-${run}`;
	const users = { ownerA: id("owner-a"), assistantA: id("assistant-a"), ownerB: id("owner-b") };
	const orgA = id("org-a");
	const orgB = id("org-b");
	const ids = { practitionerA: 0, practitionerB: 0, siteA: 0, siteB: 0, placeA: 0, placeB: 0 };
	let calendarA = "";
	let calendarB = "";
	let typeA = "";
	let typeB = "";

	const mails: RenderedMail[] = [];
	let failMail: Error | null = null;
	const deferred: Promise<unknown>[] = [];
	const clock = { now: 0 };
	let base = 0;
	let counter = 0;

	async function settle() {
		while (deferred.length > 0) {
			await Promise.allSettled(deferred.splice(0));
		}
	}

	function ctxFor(
		options: { userId?: string; cookie?: string; forwardedFor?: string; realLimits?: boolean } = {},
	): Context {
		const headers = new Headers();
		if (options.cookie) {
			headers.set("cookie", `${BROWSER_COOKIE}=${options.cookie}`);
		}
		if (options.forwardedFor) {
			headers.set("x-forwarded-for", options.forwardedFor);
		}
		const current: SessionContext | null = options.userId
			? {
					session: {
						id: id(`session-${options.userId}`),
						userId: options.userId,
						expiresAt: new Date(Date.now() + 3_600_000),
						mfaVerifiedAt: new Date(),
					},
					user: {
						id: options.userId,
						email: `${options.userId}@example.test`,
						name: options.userId,
						emailVerified: true,
					},
				}
			: null;
		return {
			headers,
			db: () => db,
			getSession: async () => current,
			rateLimit: options.realLimits
				? (key, rule) => consumeRateLimit(db, key, rule)
				: async () => true,
			resHeaders: new Headers(),
			defer: (task) => {
				deferred.push(task());
			},
			now: () => clock.now,
		};
	}

	const patientCaller = (cookie = randomBytes(24).toString("base64url")) =>
		createCaller(ctxFor({ cookie }));
	const staffCaller = (userId: string) => createCaller(ctxFor({ userId }));

	async function proof() {
		const challenge = await createProofChallenge(
			{ algorithm: "SHA-256", cost: 1, counterMin: 1, counterMax: 30, ttlSeconds: 600 },
			Date.now(),
		);
		const solution = await solveChallenge({ challenge, deriveKey: sha });
		if (!solution) {
			throw new Error("Proof of work not solved");
		}
		return encodeProof(challenge, solution);
	}

	function patient(label = "patient") {
		counter += 1;
		return {
			firstName: `Alexis${counter}`,
			lastName: `Synthetique${run}`,
			email: `${label}-${counter}-${run}@example.test`,
			phone: `06 12 34 ${String(10 + (counter % 89)).padStart(2, "0")} 00`,
			isNew: true,
		};
	}

	async function freeSlots(calendarId = calendarA, typeId = typeA, fromMs = clock.now) {
		const fromDate = new Date(fromMs).toISOString().slice(0, 10);
		const result = await patientCaller().booking.slots({ calendarId, typeId, fromDate, days: 7 });
		return result.slots;
	}

	async function holdAt(startsAt: Date, who = patient(), caller = patientCaller()) {
		const result = await caller.booking.hold({
			calendarId: calendarA,
			typeId: typeA,
			startsAt,
			patient: who,
			locale: "fr",
			idempotencyKey: randomUUID(),
			altcha: await proof(),
		});
		await settle();
		return { result, who, caller };
	}

	function lastCode(email: string): string {
		const mail = [...mails]
			.reverse()
			.find((entry) => entry.to.includes(email) && /^Votre code/.test(entry.subject));
		const code = mail?.subject.match(/(\d{6})/)?.[1];
		if (!code) {
			throw new Error(`No code email for ${email}`);
		}
		return code;
	}

	async function errorOf(promise: Promise<unknown>) {
		try {
			await promise;
			return null;
		} catch (error) {
			return error as { code?: string; message?: string };
		}
	}

	async function bookConfirmed(startsAt?: Date) {
		const slot = startsAt ?? (await freeSlots())[0];
		if (!slot) {
			throw new Error("No free slot");
		}
		const { result, who, caller } = await holdAt(slot);
		if (result.status !== "held") {
			throw new Error("Hold failed");
		}
		const verified = await caller.booking.verify({
			holdId: result.holdId,
			holdToken: result.holdToken,
			code: lastCode(who.email),
		});
		await settle();
		if (verified.status !== "confirmed" && verified.status !== "pending") {
			throw new Error(`Verify failed: ${verified.status}`);
		}
		return { holdId: result.holdId, token: verified.manageToken, who, slot, verified };
	}

	beforeAll(async () => {
		db = createDb({ url, max: 30 });
		configureMailTransport(async (mail) => {
			if (failMail) {
				throw failMail;
			}
			mails.push(mail);
		});

		const start = new Date(Date.now() + 7 * DAY);
		while (start.getUTCDay() !== 1) {
			start.setUTCDate(start.getUTCDate() + 1);
		}
		start.setUTCHours(5, 0, 0, 0);
		base = start.getTime();
		clock.now = base;

		await db.insert(user).values(
			Object.values(users).map((userId) => ({
				id: userId,
				name: userId,
				email: `${userId}@example.test`,
				emailVerified: true,
			})),
		);
		await db.insert(organization).values([
			{ id: orgA, name: "Cabinet Exemple A", slug: orgA },
			{ id: orgB, name: "Cabinet Exemple B", slug: orgB },
		]);
		await db.insert(member).values([
			{ id: id("m1"), organizationId: orgA, userId: users.ownerA, role: "owner" },
			{ id: id("m2"), organizationId: orgA, userId: users.assistantA, role: "assistant" },
			{ id: id("m3"), organizationId: orgB, userId: users.ownerB, role: "owner" },
		]);
		const [placeA, placeB] = await db
			.insert(places)
			.values([
				{
					kind: "commune",
					code: id("T75"),
					name: "Ville Exemple",
					slug: id("ville-a"),
					departmentCode: "75",
				},
				{
					kind: "commune",
					code: id("T974"),
					name: "Ville Outre-mer",
					slug: id("ville-b"),
					departmentCode: "974",
				},
			])
			.returning({ id: places.id });
		const [siteA, siteB] = await db
			.insert(sites)
			.values([
				{
					source: "owner",
					sourceKey: id("site-a"),
					kind: "office",
					name: "Cabinet Exemple",
					addressLine: "1 rue de l’Exemple",
					postcode: "75011",
					communeLabel: "Paris",
					placeId: placeA?.id,
				},
				{
					source: "owner",
					sourceKey: id("site-b"),
					kind: "office",
					name: "Cabinet Outre-mer",
					addressLine: "2 rue Exemple",
					postcode: "97400",
					communeLabel: "Saint-Denis",
					placeId: placeB?.id,
				},
			])
			.returning({ id: sites.id });
		const [practA, practB] = await db
			.insert(practitioners)
			.values(
				(["A", "B"] as const).map((letter) => ({
					nationalId: id(`TEST${letter}`),
					titleCode: "DR",
					firstName: "Camille",
					lastName: `Exemple${letter}`,
					firstNameSource: "CAMILLE",
					lastNameSource: `EXEMPLE${letter}`,
					professionCode: "10",
					listingSlug: "medecin-generaliste",
					slug: id(`camille-exemple-${letter.toLowerCase()}`),
					claimStatus: "claimed",
					ownerOrgId: letter === "A" ? orgA : orgB,
				})),
			)
			.returning({ id: practitioners.id });
		ids.placeA = placeA?.id ?? 0;
		ids.placeB = placeB?.id ?? 0;
		ids.siteA = siteA?.id ?? 0;
		ids.siteB = siteB?.id ?? 0;
		ids.practitionerA = practA?.id ?? 0;
		ids.practitionerB = practB?.id ?? 0;
		await db.insert(activities).values([
			{
				practitionerId: ids.practitionerA,
				siteId: ids.siteA,
				source: "owner",
				sourceKey: id("act-a"),
				practiceKind: "office",
			},
			{
				practitionerId: ids.practitionerB,
				siteId: ids.siteB,
				source: "owner",
				sourceKey: id("act-b"),
				practiceKind: "office",
			},
		]);
		await db.insert(practitionerProfiles).values([
			{ practitionerId: ids.practitionerA, fees: null, paymentMethods: [] },
			{
				practitionerId: ids.practitionerB,
				fees: { consultation: 3000 },
				paymentMethods: ["card"],
			},
		]);
		await db.insert(session).values(
			[users.ownerA, users.ownerB, users.assistantA].map((userId) => ({
				id: id(`session-${userId}`),
				token: id(`token-${userId}`),
				userId,
				expiresAt: new Date(Date.now() + 3_600_000),
				mfaVerifiedAt: new Date(),
			})),
		);
	});

	beforeEach(() => {
		clock.now = base;
		failMail = null;
	});

	afterEach(async () => {
		await settle();
		// Keep the per-practitioner live-hold limit out of the way between tests.
		await db
			.update(appointments)
			.set({ status: "expired", expiryReason: "released" })
			.where(
				and(
					inArray(appointments.practitionerId, [ids.practitionerA, ids.practitionerB]),
					eq(appointments.status, "held"),
				),
			);
	});

	afterAll(async () => {
		configureMailTransport(undefined);
		if (!db) {
			return;
		}
		await settle();
		const orgs = [orgA, orgB];
		for (const table of [
			"outbox",
			"otp_challenges",
			"appointment_events",
			"appointments",
			"availability_exceptions",
			"availability_rules",
			"appointment_types",
			"calendars",
			"organization_keys",
			"audit_events",
		]) {
			await db.execute(
				sql`delete from ${sql.raw(`care.${table}`)} where organization_id in (${sql.join(
					orgs.map((org) => sql`${org}`),
					sql`, `,
				)})`,
			);
		}
		await db
			.delete(activities)
			.where(inArray(activities.practitionerId, [ids.practitionerA, ids.practitionerB]));
		await db
			.delete(practitionerProfiles)
			.where(inArray(practitionerProfiles.practitionerId, [ids.practitionerA, ids.practitionerB]));
		await db
			.delete(practitioners)
			.where(inArray(practitioners.id, [ids.practitionerA, ids.practitionerB]));
		await db.delete(sites).where(inArray(sites.id, [ids.siteA, ids.siteB]));
		await db.delete(places).where(inArray(places.id, [ids.placeA, ids.placeB]));
		await db.delete(organization).where(inArray(organization.id, orgs));
		await db.delete(user).where(inArray(user.id, Object.values(users)));
		await db.execute(sql`delete from directory.rate_limits where key like ${`%${run}%`}`);
		await db.close();
	});

	it("creates calendars in the site's time zone and opens them only when the page is ready", async () => {
		const ownerA = staffCaller(users.ownerA);
		const created = await ownerA.calendar.create({
			organizationId: orgA,
			practitionerId: ids.practitionerA,
			siteId: ids.siteA,
			withPresets: true,
			locale: "fr",
			settings: { minNoticeMin: 60, stepMin: 15, horizonDays: 60, cancellationCutoffMin: 1440 },
		});
		calendarA = created.id;
		expect(created.timeZone).toBe("Europe/Paris");
		const [calendar] = await ownerA.calendar.list({ organizationId: orgA });
		expect(calendar?.types.map((type) => [type.name, type.durationMin])).toEqual([
			["Consultation", 15],
			["Première consultation", 30],
		]);
		typeA = calendar?.types[0]?.id ?? "";
		await ownerA.calendar.replaceRules({
			organizationId: orgA,
			calendarId: calendarA,
			rules: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime: "08:00", endTime: "12:00" })),
		});

		// Fees and payment methods missing: the agenda stays closed.
		expect(
			await ownerA.calendar.requirements({
				organizationId: orgA,
				practitionerId: ids.practitionerA,
			}),
		).toMatchObject({ claimed: true, fees: false, paymentMethods: false, ready: false });
		const refused = await errorOf(
			ownerA.calendar.setStatus({ organizationId: orgA, calendarId: calendarA, status: "open" }),
		);
		expect(refused?.message).toBe("AGENDA_NOT_READY");
		await db
			.update(practitionerProfiles)
			.set({ fees: { consultation: 3000 }, paymentMethods: ["card", "cash"] })
			.where(eq(practitionerProfiles.practitionerId, ids.practitionerA));
		expect(
			await ownerA.calendar.setStatus({
				organizationId: orgA,
				calendarId: calendarA,
				status: "open",
			}),
		).toEqual({ status: "open" });

		// Overseas site: its own zone, from the department.
		const ownerB = staffCaller(users.ownerB);
		const createdB = await ownerB.calendar.create({
			organizationId: orgB,
			practitionerId: ids.practitionerB,
			siteId: ids.siteB,
			withPresets: true,
			locale: "fr",
			settings: { minNoticeMin: 0 },
		});
		calendarB = createdB.id;
		expect(createdB.timeZone).toBe("Indian/Reunion");
		typeB = (await ownerB.calendar.list({ organizationId: orgB }))[0]?.types[0]?.id ?? "";
		await ownerB.calendar.replaceRules({
			organizationId: orgB,
			calendarId: calendarB,
			rules: [{ weekday: 1, startTime: "08:00", endTime: "09:00" }],
		});
		await ownerB.calendar.setStatus({
			organizationId: orgB,
			calendarId: calendarB,
			status: "open",
		});

		// Settings are for owners only.
		const assistant = staffCaller(users.assistantA);
		expect((await errorOf(assistant.calendar.list({ organizationId: orgA })))?.code).toBe(
			"FORBIDDEN",
		);
	});

	it("computes slots in the site's time zone, overseas and across daylight saving time", async () => {
		const options = await patientCaller().booking.options({ practitionerId: ids.practitionerA });
		expect(options.calendars).toHaveLength(1);
		expect(options.calendars[0]?.types).toHaveLength(2);

		// Réunion (UTC+4, no DST): 08:00 local is 04:00 UTC.
		const monday = new Date(base + 7 * DAY).toISOString().slice(0, 10);
		const reunion = await patientCaller().booking.slots({
			calendarId: calendarB,
			typeId: typeB,
			fromDate: monday,
			days: 1,
		});
		expect(reunion.timeZone).toBe("Indian/Reunion");
		expect(reunion.slots.map((slot) => slot.toISOString().slice(11, 16))).toEqual([
			"04:00",
			"04:15",
			"04:30",
			"04:45",
		]);

		// Paris on both sides of the spring change (2027-03-28): 08:00 local moves from 07:00Z to 06:00Z.
		clock.now = Date.parse("2027-03-22T05:00:00Z");
		const before = await patientCaller().booking.slots({
			calendarId: calendarA,
			typeId: typeA,
			fromDate: "2027-03-26",
			days: 1,
		});
		const after = await patientCaller().booking.slots({
			calendarId: calendarA,
			typeId: typeA,
			fromDate: "2027-03-29",
			days: 1,
		});
		expect(before.slots[0]?.toISOString()).toBe("2027-03-26T07:00:00.000Z");
		expect(after.slots[0]?.toISOString()).toBe("2027-03-29T06:00:00.000Z");
		expect(before.slots).toHaveLength(16);
		expect(after.slots).toHaveLength(16);

		const tooLong = await errorOf(
			patientCaller().booking.slots({
				calendarId: calendarA,
				typeId: typeA,
				fromDate: monday,
				days: 15,
			}),
		);
		expect(tooLong?.code).toBe("BAD_REQUEST");
	});

	it("lets exactly one of 20 parallel holds on one slot through, the others get alternatives", async () => {
		const [slot] = await freeSlots();
		expect(slot).toBeDefined();
		const proofs = await Promise.all(Array.from({ length: 20 }, () => proof()));
		const results = await Promise.all(
			proofs.map((altcha) =>
				patientCaller().booking.hold({
					calendarId: calendarA,
					typeId: typeA,
					startsAt: slot as Date,
					patient: patient("race"),
					locale: "fr",
					idempotencyKey: randomUUID(),
					altcha,
				}),
			),
		);
		await settle();
		expect(results.filter((result) => result.status === "held")).toHaveLength(1);
		const taken = results.filter((result) => result.status === "slot_taken");
		expect(taken).toHaveLength(19);
		for (const result of taken) {
			if (result.status === "slot_taken") {
				expect(result.alternatives.length).toBeGreaterThan(0);
				expect(result.alternatives.length).toBeLessThanOrEqual(3);
				expect(result.alternatives.map(Number)).not.toContain(slot?.getTime());
			}
		}
		const rows = await db
			.select({ id: appointments.id })
			.from(appointments)
			.where(
				and(
					eq(appointments.practitionerId, ids.practitionerA),
					eq(appointments.startsAt, slot as Date),
					inArray(appointments.status, ["held", "pending", "confirmed"]),
				),
			);
		expect(rows).toHaveLength(1);
	});

	it("books with an emailed code, then lets the patient move and cancel through the manage link", async () => {
		const [slot, later] = await freeSlots();
		const { result, who, caller } = await holdAt(slot as Date);
		expect(result.status).toBe("held");
		if (result.status !== "held") return;
		expect(result.expiresAt.getTime() - clock.now).toBe(15 * MINUTE);

		const code = lastCode(who.email);
		const wrong = code === "000000" ? "111111" : "000000";
		expect(
			await caller.booking.verify({
				holdId: result.holdId,
				holdToken: result.holdToken,
				code: wrong,
			}),
		).toEqual({ status: "invalid_code", attemptsLeft: 4 });
		const verified = await caller.booking.verify({
			holdId: result.holdId,
			holdToken: result.holdToken,
			code,
		});
		await settle();
		expect(verified.status).toBe("confirmed");
		if (verified.status !== "confirmed") return;
		expect(verified.manageToken).toMatch(/^[\w-]{43}$/);

		// Patient email: practitioner, date, time, address, manage link in the fragment, .ics.
		const confirmation = mails.find(
			(mail) => mail.to.includes(who.email) && mail.subject.startsWith("Rendez-vous confirmé"),
		);
		expect(confirmation?.html).toContain(`#t=${verified.manageToken}`);
		expect(confirmation?.html).toContain("Dr Camille ExempleA");
		expect(confirmation?.html).toContain("1 rue de l’Exemple");
		expect(confirmation?.html).not.toContain("Consultation");
		expect(confirmation?.html).not.toMatch(/généraliste/i);
		expect(confirmation?.ics?.method).toBe("REQUEST");
		expect(confirmation?.ics?.content).toContain(`UID:${result.holdId}@apercura.example`);
		expect(confirmation?.ics?.content).toContain("SEQUENCE:2");
		// Practice notification: never the patient's name.
		const notice = mails.find((mail) => mail.to.includes(`${users.ownerA}@example.test`));
		expect(notice?.subject).toMatch(/^Nouveau rendez-vous/);
		expect(notice?.html).not.toContain(who.firstName);
		expect(notice?.html).not.toContain(who.lastName);
		expect(notice?.html).not.toContain(who.email);
		expect(mails.some((mail) => mail.to.includes(`${users.assistantA}@example.test`))).toBe(false);

		const managed = await patientCaller().booking.manage.get({ token: verified.manageToken });
		expect(managed).toMatchObject({
			status: "confirmed",
			canCancel: true,
			canReschedule: true,
			patient: { firstName: who.firstName, lastName: who.lastName },
		});

		const own = await patientCaller().booking.manage.slots({
			token: verified.manageToken,
			fromDate: new Date(base).toISOString().slice(0, 10),
			days: 7,
		});
		expect(own.slots.map(Number)).toContain((slot as Date).getTime());
		const moved = await patientCaller().booking.manage.reschedule({
			token: verified.manageToken,
			startsAt: later as Date,
		});
		await settle();
		expect(moved).toMatchObject({ status: "rescheduled", revision: 3 });
		const movedMail = mails.find(
			(mail) => mail.to.includes(who.email) && mail.subject === "Rendez-vous déplacé",
		);
		expect(movedMail?.ics?.content).toContain("SEQUENCE:3");

		expect(await patientCaller().booking.manage.cancel({ token: verified.manageToken })).toEqual({
			status: "cancelled_by_patient",
		});
		await settle();
		const cancelled = mails.find(
			(mail) => mail.to.includes(who.email) && mail.subject === "Rendez-vous annulé",
		);
		expect(cancelled?.ics?.method).toBe("CANCEL");
		expect(cancelled?.ics?.content).toContain("SEQUENCE:4");
		expect(
			(await errorOf(patientCaller().booking.manage.cancel({ token: verified.manageToken })))
				?.message,
		).toBe("TRANSITION_REFUSED");
	});

	it("revives a hold with a late code when the slot is still free, and offers alternatives when not", async () => {
		const [first, second] = await freeSlots();
		const late = await holdAt(first as Date);
		if (late.result.status !== "held") throw new Error("hold");
		clock.now = base + 20 * MINUTE;
		await expireLapsed(db, clock.now);
		const revived = await late.caller.booking.verify({
			holdId: late.result.holdId,
			holdToken: late.result.holdToken,
			code: lastCode(late.who.email),
		});
		expect(revived.status).toBe("confirmed");

		clock.now = base;
		const lost = await holdAt(second as Date);
		if (lost.result.status !== "held") throw new Error("hold");
		clock.now = base + 16 * MINUTE;
		const winner = await holdAt(second as Date);
		expect(winner.result.status).toBe("held");
		const refused = await lost.caller.booking.verify({
			holdId: lost.result.holdId,
			holdToken: lost.result.holdToken,
			code: lastCode(lost.who.email),
		});
		expect(refused.status).toBe("slot_taken");

		// Past 30 minutes the code itself has expired.
		clock.now = base + (16 + 31) * MINUTE;
		const expired = await errorOf(
			winner.caller.booking.verify({
				holdId: winner.result.status === "held" ? winner.result.holdId : "",
				holdToken: winner.result.status === "held" ? winner.result.holdToken : "",
				code: lastCode(winner.who.email),
			}),
		);
		expect(expired?.message).toBe("CODE_EXPIRED");
	});

	it("drops a hold after 5 wrong codes and limits code emails to 3, 60 s apart", async () => {
		const [slot, other] = await freeSlots();
		const { result, caller, who } = await holdAt(slot as Date);
		if (result.status !== "held") throw new Error("hold");
		const ref = { holdId: result.holdId, holdToken: result.holdToken };
		expect((await errorOf(caller.booking.resendCode(ref)))?.message).toBe("RESEND_TOO_SOON");
		clock.now += 61_000;
		expect((await caller.booking.resendCode(ref)).sendsLeft).toBe(1);
		clock.now += 61_000;
		expect((await caller.booking.resendCode(ref)).sendsLeft).toBe(0);
		clock.now += 61_000;
		expect((await errorOf(caller.booking.resendCode(ref)))?.message).toBe("RESEND_LIMIT");
		await settle();
		// Every code sent is valid until used: the first one still works.
		expect(mails.filter((mail) => mail.to.includes(who.email)).length).toBe(3);

		const second = await holdAt(other as Date);
		if (second.result.status !== "held") throw new Error("hold");
		const code = lastCode(second.who.email);
		const wrong = code === "000000" ? "111111" : "000000";
		const secondRef = { holdId: second.result.holdId, holdToken: second.result.holdToken };
		for (let attempt = 4; attempt >= 0; attempt -= 1) {
			expect(await second.caller.booking.verify({ ...secondRef, code: wrong })).toEqual({
				status: "invalid_code",
				attemptsLeft: attempt,
			});
		}
		const [row] = await db
			.select({ status: appointments.status, reason: appointments.expiryReason })
			.from(appointments)
			.where(eq(appointments.id, second.result.holdId));
		expect(row).toEqual({ status: "expired", reason: "too_many_attempts" });
		expect((await errorOf(second.caller.booking.verify({ ...secondRef, code })))?.message).toBe(
			"CODE_EXPIRED",
		);
	});

	it("turns requests into pending ones with a deadline when the practice validates by hand", async () => {
		const ownerA = staffCaller(users.ownerA);
		await ownerA.calendar.update({
			organizationId: orgA,
			calendarId: calendarA,
			settings: { manualValidation: true },
		});
		try {
			const booking = await bookConfirmed();
			expect(booking.verified.status).toBe("pending");
			if (booking.verified.status !== "pending") return;
			const deadline = booking.verified.pendingUntil?.getTime() ?? 0;
			expect(deadline).toBe(
				Math.min(clock.now + 48 * 60 * MINUTE, booking.slot.getTime() - 2 * 60 * MINUTE),
			);
			expect(
				mails.some((mail) => mail.subject.startsWith("Demande de rendez-vous à traiter")),
			).toBe(true);
			const assistant = staffCaller(users.assistantA);
			expect(
				await assistant.agenda.decide({
					organizationId: orgA,
					appointmentId: booking.holdId,
					decision: "approve",
				}),
			).toEqual({ status: "confirmed" });
			await settle();
			expect(
				mails.some(
					(mail) =>
						mail.to.includes(booking.who.email) && mail.subject.startsWith("Rendez-vous confirmé"),
				),
			).toBe(true);
		} finally {
			await ownerA.calendar.update({
				organizationId: orgA,
				calendarId: calendarA,
				settings: { manualValidation: false },
			});
		}
	});

	it("lets staff override a patient's temporary hold, never a confirmed appointment", async () => {
		const [slot, other] = await freeSlots();
		const held = await holdAt(slot as Date);
		expect(held.result.status).toBe("held");
		const assistant = staffCaller(users.assistantA);
		const entered = await assistant.agenda.create({
			organizationId: orgA,
			calendarId: calendarA,
			typeId: typeA,
			startsAt: slot as Date,
			patient: {
				firstName: "Dominique",
				lastName: `Telephone${run}`,
				email: `phone-${run}@example.test`,
			},
			locale: "fr",
		});
		await settle();
		expect(entered.status).toBe("created");
		const neutral = mails.find((mail) => mail.to.includes(`phone-${run}@example.test`));
		expect(neutral?.subject).toBe("Un rendez-vous a été enregistré pour cette adresse");
		expect(neutral?.html).not.toContain("Camille");
		expect(neutral?.ics ?? null).toBeNull();

		expect(
			await assistant.agenda.create({
				organizationId: orgA,
				calendarId: calendarA,
				typeId: typeA,
				startsAt: slot as Date,
				patient: { firstName: "Autre", lastName: "Patient" },
				locale: "fr",
			}),
		).toEqual({ status: "slot_taken" });
		const block = await assistant.agenda.block({
			organizationId: orgA,
			calendarId: calendarA,
			startsAt: other as Date,
			endsAt: new Date((other as Date).getTime() + 30 * MINUTE),
		});
		expect(block.status).toBe("created");
		expect((await holdAt(other as Date)).result.status).toBe("slot_taken");
		if (block.status === "created") {
			await assistant.agenda.cancel({ organizationId: orgA, appointmentId: block.appointmentId });
		}
		expect((await holdAt(other as Date)).result.status).toBe("held");
	});

	it("never changes booking data from a query or a GET request", async () => {
		const [slot] = await freeSlots();
		const booking = await bookConfirmed(slot);
		const stale = await holdAt((await freeSlots())[0] as Date);
		if (stale.result.status !== "held") throw new Error("hold");
		clock.now = base + 20 * MINUTE;

		const fingerprint = async () => {
			const [row] = await db.execute<{ appointments: string; outbox: string; events: string }>(sql`
				select
					(select md5(coalesce(string_agg(a::text, ',' order by id), '')) from care.appointments a) as appointments,
					(select md5(coalesce(string_agg(o::text, ',' order by id), '')) from care.outbox o) as outbox,
					(select count(*)::text from care.appointment_events) as events
			`);
			return row;
		};
		const before = await fingerprint();
		const reader = patientCaller();
		await reader.booking.options({ calendarId: calendarA });
		const slots = await reader.booking.slots({
			calendarId: calendarA,
			typeId: typeA,
			fromDate: new Date(base).toISOString().slice(0, 10),
			days: 7,
		});
		await reader.booking.challenge();
		// The lapsed hold is offered again at read time, but stays untouched until a write.
		const [lapsed] = await db
			.select({ status: appointments.status, startsAt: appointments.startsAt })
			.from(appointments)
			.where(eq(appointments.id, stale.result.holdId));
		expect(lapsed?.status).toBe("held");
		expect(slots.slots.map(Number)).toContain(lapsed?.startsAt.getTime());
		expect(await fingerprint()).toEqual(before);

		// Mutations are not reachable by GET (mail scanners open links on their own).
		const handler = (request: Request) =>
			fetchRequestHandler({
				endpoint: "/api/trpc",
				req: request,
				router,
				createContext: () => ctxFor(),
			});
		const input = encodeURIComponent(JSON.stringify({ json: { token: booking.token } }));
		for (const path of [
			"booking.manage.cancel",
			"booking.manage.get",
			"booking.manage.reschedule",
		]) {
			const response = await handler(
				new Request(`http://localhost/api/trpc/${path}?input=${input}`),
			);
			expect(response.status).toBe(405);
		}
		expect(await fingerprint()).toEqual(before);
	});

	it("audits every decryption in the same transaction, and never decrypts across organizations", async () => {
		const booking = await bookConfirmed();
		const audits = async () =>
			db
				.select()
				.from(auditEvents)
				.where(and(eq(auditEvents.organizationId, orgA), eq(auditEvents.action, "decrypt")));
		const before = (await audits()).length;
		// Keys come from the database, not from this process's memory: a cold cache still decrypts.
		dataKeyCache.clear();

		const agenda = await staffCaller(users.assistantA).agenda.list({
			organizationId: orgA,
			calendarId: calendarA,
			from: new Date(base),
			to: new Date(base + 7 * DAY),
		});
		const entry = agenda.find((row) => row.id === booking.holdId);
		expect(entry?.patient).toMatchObject({
			firstName: booking.who.firstName,
			email: booking.who.email,
		});
		const afterList = await audits();
		expect(afterList.length).toBe(before + 1);
		const listAudit = afterList.at(-1);
		expect(listAudit).toMatchObject({
			actor: `user:${users.assistantA}`,
			userId: users.assistantA,
			purpose: "agenda_list",
			subjectTable: "appointments",
		});
		expect(listAudit?.subjectIds).toContain(booking.holdId);
		expect(listAudit?.requestId).toBeTruthy();

		await patientCaller().booking.manage.get({ token: booking.token });
		const afterManage = await audits();
		expect(afterManage.at(-1)).toMatchObject({ actor: "patient", purpose: "manage" });

		// A decryption that fails leaves no data out and no partial write: the audit row of a
		// rolled-back transaction is gone with it, and nothing was returned.
		const rolledBack = await errorOf(
			db.transaction(async (tx) => {
				await readAppointmentPatients(
					tx,
					{ organizationId: orgA, actor: "system:test", purpose: "rollback" },
					[booking.holdId],
				);
				throw new Error("rollback");
			}),
		);
		expect(rolledBack?.message).toBe("rollback");
		expect((await audits()).some((row) => row.purpose === "rollback")).toBe(false);

		// Organization B reads nothing of organization A, even with the right id.
		const leaked = await readAppointmentPatients(
			db,
			{ organizationId: orgB, actor: "system:test", purpose: "cross-org" },
			[booking.holdId],
		);
		expect(leaked.size).toBe(0);

		// The notification emails were decrypted under the audited system:notify actor.
		expect(afterManage.some((row) => row.actor === "system:notify")).toBe(true);
	});

	it("refuses every staff procedure on another organization's data", async () => {
		const booking = await bookConfirmed();
		const ownerB = staffCaller(users.ownerB);
		const range = { from: new Date(base), to: new Date(base + 7 * DAY) };
		expect((await errorOf(ownerB.agenda.list({ organizationId: orgA, ...range })))?.code).toBe(
			"FORBIDDEN",
		);
		expect(
			(await errorOf(ownerB.agenda.list({ organizationId: orgB, calendarId: calendarA, ...range })))
				?.code,
		).toBe("NOT_FOUND");
		expect(
			(await errorOf(ownerB.agenda.cancel({ organizationId: orgB, appointmentId: booking.holdId })))
				?.code,
		).toBe("NOT_FOUND");
		expect(
			(
				await errorOf(
					ownerB.agenda.decide({
						organizationId: orgB,
						appointmentId: booking.holdId,
						decision: "decline",
					}),
				)
			)?.code,
		).toBe("NOT_FOUND");
		expect(
			(
				await errorOf(
					ownerB.calendar.update({
						organizationId: orgB,
						calendarId: calendarA,
						settings: { stepMin: 5 },
					}),
				)
			)?.code,
		).toBe("NOT_FOUND");
		const listB = await ownerB.agenda.list({ organizationId: orgB, ...range });
		expect(listB.some((row) => row.id === booking.holdId)).toBe(false);
		const [row] = await db
			.select({ status: appointments.status })
			.from(appointments)
			.where(eq(appointments.id, booking.holdId));
		expect(row?.status).toBe("confirmed");
	});

	it("stores no patient data in clear anywhere in the care schema", async () => {
		const booking = await bookConfirmed();
		await staffCaller(users.assistantA).agenda.cancel({
			organizationId: orgA,
			appointmentId: booking.holdId,
			message: `Message${run} confidentiel`,
		});
		await settle();
		const needles = [
			booking.who.firstName,
			booking.who.lastName,
			booking.who.email,
			"+33612",
			"06 12 34",
			`Message${run}`,
			`phone-${run}`,
			`Telephone${run}`,
		];
		const columns = await db.execute<{ table_name: string; column_name: string }>(sql`
			select table_name, column_name from information_schema.columns
			where table_schema = 'care' and data_type in ('text', 'jsonb', 'ARRAY', 'character varying')
		`);
		expect(columns.length).toBeGreaterThan(20);
		for (const column of columns) {
			for (const needle of needles) {
				const [found] = await db.execute<{ n: number }>(sql`
					select count(*)::int as n from ${sql.raw(`care.${column.table_name}`)}
					where ${sql.raw(`"${column.column_name}"`)}::text ilike ${`%${needle}%`}
				`);
				expect(found?.n, `${column.table_name}.${column.column_name} holds "${needle}"`).toBe(0);
			}
		}
	});

	it("enqueues each email once, retries failures with backoff, then flags the patient", async () => {
		const booking = await bookConfirmed();
		const entry = {
			organizationId: orgA,
			kind: "reminder" as const,
			appointmentId: booking.holdId,
			revision: 2,
			expectedStatuses: ["confirmed"],
			dedupeKey: `test-reminder:${booking.holdId}`,
		};
		expect(await enqueueOutbox(db, [entry])).toHaveLength(1);
		expect(await enqueueOutbox(db, [entry])).toHaveLength(0);

		// Two workers at once: the email goes out once.
		const sentBefore = mails.length;
		await Promise.all([
			processOutbox(db, { nowMs: clock.now }),
			processOutbox(db, { nowMs: clock.now }),
		]);
		expect(mails.length - sentBefore).toBe(1);
		const [sent] = await db.select().from(outbox).where(eq(outbox.dedupeKey, entry.dedupeKey));
		expect(sent).toMatchObject({ status: "sent", attempts: 1, leaseToken: null });

		// A row whose appointment moved on is skipped.
		await enqueueOutbox(db, [{ ...entry, revision: 1, dedupeKey: `stale:${booking.holdId}` }]);
		await processOutbox(db, { nowMs: clock.now });
		const [stale] = await db
			.select()
			.from(outbox)
			.where(eq(outbox.dedupeKey, `stale:${booking.holdId}`));
		expect(stale?.status).toBe("skipped");

		// Failures: 1 min, 5 min, 15 min, 1 h, 4 h, then dead.
		await enqueueOutbox(db, [{ ...entry, dedupeKey: `retry:${booking.holdId}` }]);
		failMail = new Error("SMTP unavailable");
		const delays = [1, 5, 15, 60, 240];
		for (const delay of delays) {
			await processOutbox(db, { nowMs: clock.now, random: () => 0.5 });
			const [row] = await db
				.select()
				.from(outbox)
				.where(eq(outbox.dedupeKey, `retry:${booking.holdId}`));
			expect(row?.status).toBe("pending");
			expect((row?.nextAttemptAt.getTime() ?? 0) - clock.now).toBe(delay * MINUTE);
			// Not due yet: nothing happens.
			expect((await processOutbox(db, { nowMs: clock.now + delay * MINUTE - 1_000 })).retried).toBe(
				0,
			);
			clock.now += delay * MINUTE;
		}
		await processOutbox(db, { nowMs: clock.now });
		const [dead] = await db
			.select()
			.from(outbox)
			.where(eq(outbox.dedupeKey, `retry:${booking.holdId}`));
		expect(dead).toMatchObject({ status: "dead", attempts: 6 });
		expect(dead?.lastError).toContain("SMTP unavailable");
		const [flagged] = await db
			.select({ unreachable: appointments.patientUnreachableAt })
			.from(appointments)
			.where(eq(appointments.id, booking.holdId));
		expect(flagged?.unreachable).toBeInstanceOf(Date);

		// A permanent refusal (5xx on RCPT) is dead at once.
		await enqueueOutbox(db, [{ ...entry, dedupeKey: `permanent:${booking.holdId}` }]);
		failMail = new PermanentMailError();
		await processOutbox(db, { nowMs: clock.now });
		const [permanent] = await db
			.select()
			.from(outbox)
			.where(eq(outbox.dedupeKey, `permanent:${booking.holdId}`));
		expect(permanent).toMatchObject({ status: "dead", attempts: 1 });
	});

	it("sends reminders from 09:00 the day before in the site's time zone, once", async () => {
		const tuesday = (await freeSlots(calendarA, typeA, base + DAY)).find(
			(slot) => slot.getTime() >= base + DAY,
		);
		const booking = await bookConfirmed(tuesday);
		const tz = "Europe/Paris";
		const nineParis = localToInstant(
			instantToLocalDate(booking.slot.getTime(), tz).subtract({ days: 1 }),
			9 * 60,
			tz,
		);
		await db
			.update(appointments)
			.set({ bookedAt: new Date(booking.slot.getTime() - 3 * DAY) })
			.where(eq(appointments.id, booking.holdId));
		clock.now = nineParis - MINUTE;
		await enqueueReminders(db, clock.now);
		const reminders = () =>
			db
				.select()
				.from(outbox)
				.where(and(eq(outbox.appointmentId, booking.holdId), eq(outbox.kind, "reminder")));
		expect(await reminders()).toHaveLength(0);
		clock.now = nineParis + MINUTE;
		await enqueueReminders(db, clock.now);
		await enqueueReminders(db, clock.now);
		const queued = await reminders();
		expect(queued).toHaveLength(1);
		expect(queued[0]?.dedupeKey).toBe(`reminder:${booking.holdId}:2`);

		// Booked less than 12 hours before: no reminder.
		const lastMinute = await bookConfirmed(
			(await freeSlots(calendarA, typeA, booking.slot.getTime())).find(
				(slot) => slot.getTime() > booking.slot.getTime(),
			),
		);
		await db
			.update(appointments)
			.set({ bookedAt: new Date(lastMinute.slot.getTime() - 6 * 60 * MINUTE) })
			.where(eq(appointments.id, lastMinute.holdId));
		clock.now = lastMinute.slot.getTime() - 2 * 60 * MINUTE;
		await enqueueReminders(db, clock.now);
		const none = await db
			.select()
			.from(outbox)
			.where(and(eq(outbox.appointmentId, lastMinute.holdId), eq(outbox.kind, "reminder")));
		expect(none).toHaveLength(0);
	});

	it("expires, completes and purges in the jobs, and keeps next_free_at current", async () => {
		await refreshAllNextFree(db, clock.now);
		const [first] = await freeSlots();
		const nextFree = async () =>
			(
				await db
					.select({ at: practitioners.nextFreeAt })
					.from(practitioners)
					.where(eq(practitioners.id, ids.practitionerA))
			)[0]?.at;
		expect((await nextFree())?.getTime()).toBe(first?.getTime());
		const booking = await bookConfirmed(first);
		await settle();
		expect((await nextFree())?.getTime()).toBeGreaterThan(first?.getTime() ?? 0);

		// An unverified hold: details erased 24 hours later.
		const [slot] = await freeSlots();
		const held = await holdAt(slot as Date);
		if (held.result.status !== "held") throw new Error("hold");
		clock.now = base + 25 * 60 * MINUTE;
		const swept = await expireLapsed(db, clock.now);
		expect(swept.expired).toBeGreaterThanOrEqual(1);
		await purge(db, clock.now);
		const [unverified] = await db
			.select()
			.from(appointments)
			.where(eq(appointments.id, held.result.holdId));
		expect(unverified).toMatchObject({
			status: "expired",
			patientEmailEnc: null,
			patientFirstNameEnc: null,
			emailBidx: null,
		});
		expect(unverified?.purgedAt).toBeInstanceOf(Date);

		// Completed 24 hours after the end, erased at purge_after (end + 90 days).
		clock.now = booking.slot.getTime() + 2 * DAY;
		await expireLapsed(db, clock.now);
		const [done] = await db.select().from(appointments).where(eq(appointments.id, booking.holdId));
		expect(done?.status).toBe("completed");
		expect(done?.patientEmailEnc).not.toBeNull();
		clock.now = (done?.purgeAfter?.getTime() ?? 0) + MINUTE;
		await purge(db, clock.now);
		const [erased] = await db
			.select()
			.from(appointments)
			.where(eq(appointments.id, booking.holdId));
		expect(erased).toMatchObject({
			patientFirstNameEnc: null,
			patientLastNameEnc: null,
			patientEmailEnc: null,
			patientPhoneEnc: null,
			manageTokenHash: null,
		});
		const purgeAudit = await db
			.select()
			.from(auditEvents)
			.where(and(eq(auditEvents.organizationId, orgA), eq(auditEvents.action, "purge")));
		expect(purgeAudit.some((row) => row.subjectIds.includes(booking.holdId))).toBe(true);
		expect(
			(await errorOf(patientCaller().booking.manage.get({ token: booking.token })))?.code,
		).toBe("NOT_FOUND");
	});

	it("limits holds per client (IPv6 by /64) with the shared rate limiter", async () => {
		process.env.TRUSTED_PROXY_COUNT = "1";
		try {
			const slots = await freeSlots();
			const prefix = `2001:db8:${parseInt(run.slice(0, 4), 16).toString(16)}:${parseInt(run.slice(4, 8), 16).toString(16)}`;
			const results: string[] = [];
			for (let index = 0; index < 6; index += 1) {
				const caller = createCaller(
					ctxFor({
						cookie: randomBytes(24).toString("base64url"),
						forwardedFor: `${prefix}::${index + 1}`,
						realLimits: true,
					}),
				);
				const outcome = await errorOf(
					caller.booking.hold({
						calendarId: calendarA,
						typeId: typeA,
						startsAt: slots[index] as Date,
						patient: patient("limit"),
						locale: "fr",
						idempotencyKey: randomUUID(),
						altcha: await proof(),
					}),
				);
				results.push(outcome?.code ?? "OK");
			}
			expect(results).toEqual(["OK", "OK", "OK", "OK", "OK", "TOO_MANY_REQUESTS"]);
		} finally {
			delete process.env.TRUSTED_PROXY_COUNT;
		}
	});

	it("refuses a hold without a valid, unused proof of work", async () => {
		const [slot] = await freeSlots();
		const caller = createCaller(
			ctxFor({ cookie: randomBytes(24).toString("base64url"), realLimits: true }),
		);
		const input = {
			calendarId: calendarA,
			typeId: typeA,
			startsAt: slot as Date,
			patient: patient("proof"),
			locale: "fr" as const,
		};
		const garbage = Buffer.from(JSON.stringify({ challenge: {}, solution: {} })).toString("base64");
		expect(
			(
				await errorOf(
					caller.booking.hold({ ...input, idempotencyKey: randomUUID(), altcha: garbage }),
				)
			)?.message,
		).toBe("PROOF_REQUIRED");
		const altcha = await proof();
		await caller.booking.hold({ ...input, idempotencyKey: randomUUID(), altcha });
		expect(
			(
				await errorOf(
					caller.booking.hold({
						...input,
						patient: patient("proof"),
						idempotencyKey: randomUUID(),
						altcha,
					}),
				)
			)?.message,
		).toBe("PROOF_REQUIRED");
	});

	it("checks that the overlap constraint exists", async () => {
		await expect(assertBookingConstraints(db.$client)).resolves.toBeUndefined();
		const reserved = await db.$client.reserve();
		try {
			await reserved`begin`;
			await reserved`alter table care.appointments drop constraint appointments_no_overlap`;
			await expect(
				assertBookingConstraints(reserved as unknown as Database["$client"]),
			).rejects.toThrow(/appointments_no_overlap is missing/);
		} finally {
			await reserved`rollback`;
			reserved.release();
		}
		await expect(assertBookingConstraints(db.$client)).resolves.toBeUndefined();
	});
});
