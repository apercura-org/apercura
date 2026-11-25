/**
 * Closing a practice that holds booking data, end to end against a real, migrated database
 * (DATABASE_URL_TEST): the owner deletes their account and closes the practice; upcoming
 * appointments are cancelled and their patients told, the feed and the team go at once; the
 * booking data, the data keys and the organization go once the emails are out (or at the
 * deadline), without a foreign key error; the access log stays. Synthetic data only. Skipped
 * when the variable is unset; CI runs it in the `migrations` job.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { createDb, type Database } from "@apercura/db";
import {
	appointments,
	auditEvents,
	calendars,
	member,
	organization,
	organizationClosures,
	outbox,
	practitionerProfiles,
	practitioners,
	user,
} from "@apercura/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RenderedMail } from "./mail-content";

const url = process.env.DATABASE_URL_TEST;

process.env.FEATURE_BOOKING = "true";
process.env.ENCRYPTION_KEYS = `1:${randomBytes(32).toString("base64")}`;
process.env.ENCRYPTION_ACTIVE_KEY = "1";
process.env.BLIND_INDEX_KEY = randomBytes(32).toString("base64");
process.env.APP_URL = "https://apercura.example";
process.env.MAIL_FROM = "Apercura <no-reply@apercura.example>";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe.skipIf(!url)("closing a practice (database)", { timeout: 30_000 }, async () => {
	const { deleteAccount } = await import("../account/service");
	const { createCalendar, listCalendars, rotateFeedToken } = await import("./calendar-settings");
	const { createEntry } = await import("./agenda");
	const { finalizeClosures, CLOSURE_PURGE_DEADLINE_MS } = await import("./closure");
	const { configureMailTransport, processOutbox } = await import("./outbox-worker");
	const { readFeed } = await import("./ics-feed");
	const { memoryDriver } = await import("../storage");

	let db: Database;
	const run = randomUUID().slice(0, 8);
	const id = (name: string) => `${name}-${run}`;
	const created = { practitioners: [] as number[], sites: [] as number[], places: [] as number[] };
	const users: string[] = [];
	const orgs: string[] = [];
	const mails: RenderedMail[] = [];
	let failMail: Error | null = null;
	const deferred: Promise<unknown>[] = [];
	const clock = { now: 0 };
	let base = 0;

	const runtime = () => ({
		db,
		nowMs: () => clock.now,
		rateLimit: async () => true,
		clientKey: (scope: string) => `${scope}:${run}`,
		requestId: id("request"),
		ipHash: null,
		defer: (task: () => Promise<unknown>) => {
			deferred.push(task());
		},
	});

	/** Sends this practice's due emails only (other test files share the database). */
	async function sendEmailsOf(orgId: string, nowMs: number) {
		const rows = await db
			.select({ id: outbox.id })
			.from(outbox)
			.where(and(eq(outbox.organizationId, orgId), eq(outbox.status, "pending")));
		return processOutbox(db, { nowMs, ids: rows.map((row) => row.id) });
	}

	async function settle() {
		while (deferred.length > 0) await Promise.allSettled(deferred.splice(0));
	}

	/** A practice owning one practitioner page with an office, and its owner (plus a member). */
	async function practice(label: string, withAssistant = false) {
		const sqlc = db.$client;
		const owner = id(`${label}-owner`);
		const assistant = id(`${label}-assistant`);
		const orgId = id(`${label}-org`);
		const people = withAssistant ? [owner, assistant] : [owner];
		users.push(...people);
		orgs.push(orgId);
		await db.insert(user).values(
			people.map((userId) => ({
				id: userId,
				name: userId,
				email: `${userId}@example.test`,
				emailVerified: true,
			})),
		);
		await db.insert(organization).values({ id: orgId, name: `Cabinet ${label}`, slug: orgId });
		await db.insert(member).values(
			people.map((userId, index) => ({
				id: id(`${label}-member-${index}`),
				organizationId: orgId,
				userId,
				role: index === 0 ? "owner" : "assistant",
			})),
		);
		const [place] = await sqlc<{ id: number }[]>`
			INSERT INTO directory.places (kind, code, name, slug, department_code)
			VALUES ('commune', ${id(`T${label}`)}, 'Ville Exemple', ${id(`ville-${label}`)}, '75')
			RETURNING id
		`;
		const [person] = await sqlc<{ id: number }[]>`
			INSERT INTO directory.practitioners (national_id, first_name, last_name, first_name_source,
				last_name_source, profession_code, listing_slug, slug, claim_status, owner_org_id)
			VALUES (${id(`TEST${label}`)}, 'Camille', 'Exemple', 'CAMILLE', 'EXEMPLE', '10',
				'medecin-generaliste', ${id(`camille-exemple-${label}`)}, 'claimed', ${orgId})
			RETURNING id
		`;
		const [site] = await sqlc<{ id: number }[]>`
			INSERT INTO directory.sites (source, source_key, kind, name, address_line, postcode,
				commune_label, place_id)
			VALUES ('owner', ${id(`site-${label}`)}, 'office', 'Cabinet Exemple', '1 rue de l’Exemple',
				'75011', 'Paris', ${place?.id ?? null})
			RETURNING id
		`;
		const practitionerId = person?.id ?? 0;
		const siteId = site?.id ?? 0;
		await sqlc`
			INSERT INTO directory.activities (practitioner_id, site_id, source, source_key, practice_kind)
			VALUES (${practitionerId}, ${siteId}, 'owner', ${id(`act-${label}`)}, 'office')
		`;
		await db.insert(practitionerProfiles).values({ practitionerId, paymentMethods: [] });
		created.practitioners.push(practitionerId);
		created.sites.push(siteId);
		created.places.push(place?.id ?? 0);
		return { owner, assistant, orgId, practitionerId, siteId };
	}

	async function openCalendar(orgId: string, practitionerId: number, siteId: number) {
		const calendar = await createCalendar(db, orgId, {
			practitionerId,
			siteId,
			withPresets: true,
			locale: "fr",
		});
		await db.update(calendars).set({ status: "open" }).where(eq(calendars.id, calendar.id));
		const [listed] = await listCalendars(db, orgId);
		const typeId = listed?.types[0]?.id ?? "";
		return { calendarId: calendar.id, typeId };
	}

	async function entry(
		orgId: string,
		userId: string,
		slot: { calendarId: string; typeId: string },
		startsAt: number,
		email: string | null,
	) {
		const result = await createEntry(
			runtime(),
			{ organizationId: orgId, userId },
			{
				calendarId: slot.calendarId,
				typeId: slot.typeId,
				startsAt: new Date(startsAt),
				patient: { firstName: "Alexis", lastName: `Synthetique${run}`, email, phone: null },
				locale: "fr",
			},
		);
		await settle();
		if (result.status !== "created") throw new Error("Entry not created");
		return result.appointmentId;
	}

	const leftovers = async (orgId: string) => {
		const [row] = await db.execute<Record<string, number>>(sql`
			select
				(select count(*)::int from care.calendars where organization_id = ${orgId}) as calendars,
				(select count(*)::int from care.appointment_types where organization_id = ${orgId}) as types,
				(select count(*)::int from care.availability_rules where organization_id = ${orgId}) as rules,
				(select count(*)::int from care.appointments where organization_id = ${orgId}) as appointments,
				(select count(*)::int from care.appointment_events where organization_id = ${orgId}) as events,
				(select count(*)::int from care.otp_challenges where organization_id = ${orgId}) as codes,
				(select count(*)::int from care.outbox where organization_id = ${orgId}) as outbox,
				(select count(*)::int from care.organization_keys where organization_id = ${orgId}) as keys,
				(select count(*)::int from care.organization_closures where organization_id = ${orgId}) as closures,
				(select count(*)::int from directory.member where organization_id = ${orgId}) as members,
				(select count(*)::int from directory.organization where id = ${orgId}) as organizations
		`);
		return row;
	};

	beforeAll(async () => {
		db = createDb({ url, max: 5 });
		configureMailTransport(async (mail) => {
			if (failMail) throw failMail;
			mails.push(mail);
		});
		base = Date.now() + 2 * DAY;
		clock.now = base;
	});

	afterAll(async () => {
		configureMailTransport(undefined);
		if (!db) return;
		await settle();
		for (const table of ["outbox", "otp_challenges", "appointment_events", "appointments"]) {
			await db.execute(
				sql`delete from ${sql.raw(`care.${table}`)} where organization_id in (${sql.join(
					orgs.map((org) => sql`${org}`),
					sql`, `,
				)})`,
			);
		}
		await db.delete(calendars).where(inArray(calendars.organizationId, orgs));
		await db.execute(
			sql`delete from care.organization_keys where organization_id in (${sql.join(
				orgs.map((org) => sql`${org}`),
				sql`, `,
			)})`,
		);
		await db.delete(organization).where(inArray(organization.id, orgs));
		const ids = created.practitioners;
		await db.delete(practitionerProfiles).where(inArray(practitionerProfiles.practitionerId, ids));
		await db.execute(
			sql`delete from directory.activities where practitioner_id in (${sql.join(
				ids.map((value) => sql`${value}`),
				sql`, `,
			)})`,
		);
		await db.delete(practitioners).where(inArray(practitioners.id, ids));
		await db.execute(
			sql`delete from directory.sites where id in (${sql.join(
				created.sites.map((value) => sql`${value}`),
				sql`, `,
			)})`,
		);
		await db.execute(
			sql`delete from directory.places where id in (${sql.join(
				created.places.map((value) => sql`${value}`),
				sql`, `,
			)})`,
		);
		await db.delete(user).where(inArray(user.id, users));
		await db.close();
	});

	it("cancels and notifies at once, then erases the booking data once the emails are out", async () => {
		const p = await practice("main", true);
		const slot = await openCalendar(p.orgId, p.practitionerId, p.siteId);
		const { token } = await rotateFeedToken(runtime(), p.orgId, slot.calendarId);

		// Past, upcoming with a proved address, upcoming without an address.
		const past = await entry(p.orgId, p.owner, slot, base + 2 * HOUR, null);
		const notified = await entry(
			p.orgId,
			p.owner,
			slot,
			base + 2 * DAY,
			`proved-${run}@example.test`,
		);
		const silent = await entry(p.orgId, p.owner, slot, base + 3 * DAY, null);
		await db
			.update(appointments)
			.set({ emailVerifiedAt: new Date(base) })
			.where(eq(appointments.id, notified));
		expect(
			(await readFeed(db, token, { nowMs: base, rateLimit: async () => true, requestId: run }))
				.status,
		).toBe(200);

		const closeAt = base + 4 * HOUR;
		clock.now = closeAt;
		mails.length = 0;
		await deleteAccount(db, memoryDriver(), {
			userId: p.owner,
			practices: { [p.orgId]: { kind: "close" } },
			nowMs: closeAt,
		});

		// At once: account gone, team out, feed revoked, calendar closed, page unclaimed.
		expect(await db.select().from(user).where(eq(user.id, p.owner))).toEqual([]);
		expect(await leftovers(p.orgId)).toMatchObject({ members: 0, organizations: 1, closures: 1 });
		const [calendar] = await db.select().from(calendars).where(eq(calendars.id, slot.calendarId));
		expect(calendar).toMatchObject({ status: "paused", icsTokenHash: null });
		expect(
			(await readFeed(db, token, { nowMs: closeAt, rateLimit: async () => true, requestId: run }))
				.status,
		).toBe(404);
		const [page] = await db
			.select({ ownerOrgId: practitioners.ownerOrgId, claimStatus: practitioners.claimStatus })
			.from(practitioners)
			.where(eq(practitioners.id, p.practitionerId));
		expect(page).toEqual({ ownerOrgId: null, claimStatus: "unclaimed" });

		const statuses = await db
			.select({ id: appointments.id, status: appointments.status })
			.from(appointments)
			.where(eq(appointments.organizationId, p.orgId));
		expect(Object.fromEntries(statuses.map((row) => [row.id, row.status]))).toEqual({
			[past]: "confirmed",
			[notified]: "cancelled_by_practice",
			[silent]: "cancelled_by_practice",
		});
		const pending = await db
			.select({ kind: outbox.kind, appointmentId: outbox.appointmentId })
			.from(outbox)
			.where(and(eq(outbox.organizationId, p.orgId), eq(outbox.status, "pending")));
		expect(pending).toEqual([{ kind: "booking_cancelled_by_practice", appointmentId: notified }]);

		// The email still has to go: the practice and its data stay meanwhile.
		expect((await finalizeClosures(db, closeAt, [p.orgId])).organizations).toBe(0);

		// The jobs send it (outbox), then erase everything (closures): what `closuresJob` runs,
		// limited to this practice (other test files close theirs on the same database).
		expect(await sendEmailsOf(p.orgId, closeAt)).toMatchObject({ sent: 1 });
		expect(
			mails.map((mail) => [[mail.to].flat(), mail.subject.startsWith("Rendez-vous annulé")]),
		).toEqual([[[`proved-${run}@example.test`], true]]);
		expect(await finalizeClosures(db, closeAt, [p.orgId])).toMatchObject({
			organizations: 1,
			appointments: 3,
		});
		expect(await leftovers(p.orgId)).toEqual({
			calendars: 0,
			types: 0,
			rules: 0,
			appointments: 0,
			events: 0,
			codes: 0,
			outbox: 0,
			keys: 0,
			closures: 0,
			members: 0,
			organizations: 0,
		});

		// The access log of the practice stays (until its own retention), with the purge.
		const log = await db
			.select({
				action: auditEvents.action,
				purpose: auditEvents.purpose,
				ids: auditEvents.subjectIds,
			})
			.from(auditEvents)
			.where(and(eq(auditEvents.organizationId, p.orgId), eq(auditEvents.purpose, "closure")));
		expect(log).toHaveLength(1);
		expect(log[0]?.action).toBe("purge");
		expect([...(log[0]?.ids ?? [])].sort()).toEqual([past, notified, silent].sort());
		const platform = await db.execute<{ action: string }>(sql`
			select action from directory.platform_audit_events
			where subject_type = 'organization' and subject_id = ${p.orgId} order by id
		`);
		expect([...platform].map((row) => row.action)).toEqual([
			"organization.close",
			"organization.purge",
		]);
		// The other member's account stays, without the practice.
		expect(
			await db.select({ id: user.id }).from(user).where(eq(user.id, p.assistant)),
		).toHaveLength(1);
	});

	it("erases at the deadline when an email keeps failing, and at once without booking data", async () => {
		const p = await practice("stuck");
		const slot = await openCalendar(p.orgId, p.practitionerId, p.siteId);
		const notified = await entry(
			p.orgId,
			p.owner,
			slot,
			base + 2 * DAY,
			`stuck-${run}@example.test`,
		);
		await db
			.update(appointments)
			.set({ emailVerifiedAt: new Date(base) })
			.where(eq(appointments.id, notified));
		const closeAt = base + HOUR;
		clock.now = closeAt;
		await deleteAccount(db, memoryDriver(), { userId: p.owner, practices: {}, nowMs: closeAt });
		failMail = new Error("SMTP unavailable");
		expect(await sendEmailsOf(p.orgId, closeAt)).toMatchObject({ retried: 1 });
		failMail = null;
		expect(await leftovers(p.orgId)).toMatchObject({ organizations: 1, appointments: 1 });
		expect((await finalizeClosures(db, closeAt + HOUR, [p.orgId])).organizations).toBe(0);
		const deadline = closeAt + CLOSURE_PURGE_DEADLINE_MS;
		expect(await finalizeClosures(db, deadline, [p.orgId])).toMatchObject({
			organizations: 1,
			appointments: 1,
		});
		expect(await leftovers(p.orgId)).toMatchObject({
			organizations: 0,
			appointments: 0,
			outbox: 0,
			keys: 0,
		});

		// A practice without booking data goes with the account.
		const empty = await practice("empty");
		await deleteAccount(db, memoryDriver(), { userId: empty.owner, practices: {}, nowMs: closeAt });
		expect(await leftovers(empty.orgId)).toMatchObject({ organizations: 0, closures: 0 });
		expect(
			await db
				.select()
				.from(organizationClosures)
				.where(inArray(organizationClosures.organizationId, [p.orgId, empty.orgId])),
		).toEqual([]);
	});
});
