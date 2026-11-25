/**
 * The owner experience (issue #92) against a real, migrated database (DATABASE_URL_TEST): the
 * "I am this practitioner" contact requests (encrypted, ALTCHA, audited reads, statuses,
 * retention), the batched admin alerts, the page-view counters of claimed pages, the owner's
 * statistics and their retention. Synthetic data only; skipped when the variable is unset.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { createDb, type Database } from "@apercura/db";
import {
	adminAlerts,
	appointments,
	calendars,
	claims,
	member,
	organization,
	pageViewDays,
	platformAuditEvents,
	practitionerContactRequests,
	user,
} from "@apercura/db/schema";
import { TRPCError } from "@trpc/server";
import { solveChallenge } from "altcha-lib";
import { deriveKey as sha } from "altcha-lib/algorithms/sha";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AdminAlertMessage } from "./admin-alerts";

const url = process.env.DATABASE_URL_TEST;

// Test-only platform key (32 random bytes per run), read by ~/server/crypto/platform.
process.env.ENCRYPTION_KEYS = `t1:${randomBytes(32).toString("base64")}`;
process.env.ENCRYPTION_ACTIVE_KEY = "t1";

const DAY = 86_400_000;
const MONTH = 31 * DAY;

/** A valid RPPS (Luhn) with a random body, so runs never collide. */
function syntheticRpps(): string {
	const body = `1998${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
	for (let check = 0; check <= 9; check++) {
		const candidate = `${body}${check}`;
		let sum = 0;
		for (let index = 0; index < 11; index++) {
			let digit = Number(candidate[10 - index]);
			if (index % 2 === 1) {
				digit *= 2;
				if (digit > 9) digit -= 9;
			}
			sum += digit;
		}
		if (sum % 10 === 0) return candidate;
	}
	throw new Error("unreachable");
}

describe.skipIf(!url)("owner experience (database)", async () => {
	const contacts = await import("./contact-requests/service");
	const gdpr = await import("./gdpr/service");
	const alerts = await import("./admin-alerts");
	const views = await import("./stats/page-views");
	const stats = await import("./stats/owner-stats");
	const retention = await import("./retention");
	const { createProofChallenge, encodeProof } = await import("./booking/proof");
	const { createCallerFactory, createTRPCRouter } = await import("~/trpc/init");
	const { practitionerContactRouter } = await import("~/trpc/routers/practitioner-contact");
	const { adminRouter } = await import("~/trpc/routers/admin");
	const { statsRouter } = await import("~/trpc/routers/stats");
	const { consumeRateLimit } = await import("./rate-limit");

	let db: Database;
	const run = randomUUID().slice(0, 8);
	const ids = (name: string) => `${name}-${run}`;
	const users = { owner: ids("owner"), assistant: ids("assistant"), admin: ids("admin") };
	const orgId = ids("org");
	const created: number[] = [];
	const now = Date.now();

	/** `owned`: claimed by this file's organization (one page per organization, as in v1). */
	async function practitioner(options: { claimed?: boolean; owned?: boolean } = {}) {
		const rpps = syntheticRpps();
		const [person] = await db.$client<{ id: number }[]>`
			INSERT INTO directory.practitioners (national_id, first_name, last_name, first_name_source,
				last_name_source, profession_code, slug, claim_status, owner_org_id)
			VALUES (${rpps}, 'Exemple', 'Martin', 'EXEMPLE', 'MARTIN', '10', ${`exemple-martin-${rpps}`},
				${options.claimed || options.owned ? "claimed" : "unclaimed"}, ${options.owned ? orgId : null})
			RETURNING id
		`;
		created.push(person?.id ?? 0);
		return { id: person?.id ?? 0, rpps };
	}

	const router = createTRPCRouter({
		practitionerContact: practitionerContactRouter,
		admin: adminRouter,
		stats: statsRouter,
	});
	const createCaller = createCallerFactory(router);
	function caller(userId: string | null, headers = new Headers()) {
		return createCaller({
			headers,
			db: () => db,
			getSession: async () =>
				userId
					? {
							session: {
								id: ids(`session-${userId}`),
								userId,
								expiresAt: new Date(Date.now() + 3_600_000),
								mfaVerifiedAt: new Date(),
							},
							user: {
								id: userId,
								email: `${userId}@example.test`,
								name: userId,
								emailVerified: true,
							},
						}
					: null,
			// The real limiter: the ALTCHA burn and the form budget are part of what is tested.
			rateLimit: (key, rule) => consumeRateLimit(db, `${run}:${key}`, rule),
		});
	}
	async function proof() {
		const challenge = await createProofChallenge(
			{ algorithm: "SHA-256", cost: 1, counterMin: 1, counterMax: 30, ttlSeconds: 600 },
			Date.now(),
		);
		const solution = await solveChallenge({ challenge, deriveKey: sha });
		if (!solution) throw new Error("Proof of work not solved");
		return encodeProof(challenge, solution);
	}
	async function codeOf(promise: Promise<unknown>) {
		try {
			await promise;
			return "OK";
		} catch (error) {
			if (error instanceof TRPCError) {
				return error.message === error.code || error.message.startsWith("[")
					? error.code
					: error.message;
			}
			throw error;
		}
	}

	beforeAll(async () => {
		db = createDb({ url: url as string, max: 3 });
		await db.insert(user).values(
			Object.values(users).map((id) => ({
				id,
				name: id,
				email: `${id}@example.test`,
				emailVerified: true,
				twoFactorEnabled: true,
				isPlatformAdmin: id === users.admin,
			})),
		);
		await db.insert(organization).values({ id: orgId, name: "Cabinet Exemple", slug: orgId });
		await db.insert(member).values([
			{ id: ids("m-owner"), organizationId: orgId, userId: users.owner, role: "owner" },
			{ id: ids("m-assistant"), organizationId: orgId, userId: users.assistant, role: "assistant" },
		]);
		// Alerts of other runs or suites must not decide this file's outcomes.
		await db.delete(adminAlerts);
	});

	afterAll(async () => {
		if (!db) return;
		await db
			.delete(practitionerContactRequests)
			.where(inArray(practitionerContactRequests.practitionerId, created));
		await db.delete(appointments).where(eq(appointments.organizationId, orgId));
		await db.delete(calendars).where(eq(calendars.organizationId, orgId));
		await db.delete(claims).where(inArray(claims.practitionerId, created));
		await db.$client`DELETE FROM directory.practitioners WHERE id = ANY (${created}::integer[])`;
		await db.delete(organization).where(eq(organization.id, orgId));
		await db.delete(user).where(inArray(user.id, Object.values(users)));
		await db.delete(adminAlerts);
		await db.close();
	});

	it("stores a contact request encrypted, refuses claimed pages and checks the proof of work", async () => {
		const page = await practitioner();
		const owned = await practitioner({ claimed: true });
		const input = {
			rpps: page.rpps,
			name: "Exemple Martin",
			email: "Exemple.Martin@Exemple.test",
			phone: "01 99 00 00 00",
			message: "Ma carte CPS est en cours de renouvellement (exemple).",
			locale: "fr" as const,
		};
		const visitor = caller(null, new Headers({ "x-forwarded-for": "203.0.113.50" }));
		expect(
			await codeOf(visitor.practitionerContact.submit({ ...input, altcha: "x".repeat(40) })),
		).toBe("PROOF");
		const solved = await proof();
		await visitor.practitionerContact.submit({ ...input, altcha: solved });
		// A solved challenge buys one request.
		expect(await codeOf(visitor.practitionerContact.submit({ ...input, altcha: solved }))).toBe(
			"PROOF",
		);
		expect(
			await codeOf(
				visitor.practitionerContact.submit({ ...input, rpps: owned.rpps, altcha: await proof() }),
			),
		).toBe("CLAIMED");
		expect(
			await codeOf(
				visitor.practitionerContact.submit({
					...input,
					message: "<script>alert(1)</script> bonjour",
					altcha: await proof(),
				}),
			),
		).toBe("BAD_REQUEST");
		// The honeypot is refused before anything is stored.
		expect(
			await codeOf(
				visitor.practitionerContact.submit({ ...input, website: "spam", altcha: await proof() }),
			),
		).toBe("BAD_REQUEST");

		const rows = await db
			.select()
			.from(practitionerContactRequests)
			.where(eq(practitionerContactRequests.practitionerId, page.id));
		expect(rows).toHaveLength(1);
		const [row] = rows;
		expect(row?.status).toBe("new");
		expect(row?.contentEnc).toMatch(/^enc:v1:/);
		for (const clear of ["Martin", "exemple.martin", "01 99", "CPS"]) {
			expect(row?.contentEnc).not.toContain(clear);
		}
	});

	it("lets administrators alone list, decrypt (audited) and move a request", async () => {
		const page = await practitioner();
		const { id } = await contacts.submitContactRequest(db, {
			rpps: page.rpps,
			name: "Exemple Dupont",
			email: "dupont@exemple.test",
			phone: null,
			message: "Je n’ai pas accès à l’e-mail du registre (exemple).",
			locale: "en",
		});
		expect(await codeOf(caller(users.owner).admin.contacts.queue({ status: "new" }))).toBe(
			"FORBIDDEN",
		);
		const admin = caller(users.admin);
		const queue = await admin.admin.contacts.queue({ status: "new" });
		expect(queue.items.some((item) => item.id === id)).toBe(true);
		expect(queue.counts.new).toBeGreaterThanOrEqual(1);
		// The queue carries no personal field of the requester.
		expect(JSON.stringify(queue.items)).not.toContain("dupont@exemple.test");

		const read = await admin.admin.contacts.read({ id });
		expect(read).toMatchObject({ email: "dupont@exemple.test", phone: null, status: "new" });
		await admin.admin.contacts.setStatus({ id, status: "contacted" });
		const audits = await db
			.select({ action: platformAuditEvents.action })
			.from(platformAuditEvents)
			.where(
				and(
					eq(platformAuditEvents.subjectType, "contact_request"),
					eq(platformAuditEvents.subjectId, id),
				),
			);
		expect(audits.map((audit) => audit.action).sort()).toEqual([
			"contact_request.decrypt",
			"contact_request.status",
		]);
		const moved = await admin.admin.contacts.queue({ status: "contacted" });
		expect(moved.items.find((item) => item.id === id)?.status).toBe("contacted");
	});

	it("batches the admin alerts: one email per queue and interval, never without news", async () => {
		const sent: { kind: string; count: number; to: string; queueUrl: string }[] = [];
		const send = async (message: AdminAlertMessage) => {
			sent.push(message);
		};
		const env = {
			LEGAL_CONTACT_EMAIL: "contact@apercura.example",
			ADMIN_ALERT_INTERVAL_MINUTES: "15",
		};
		await db.delete(adminAlerts);
		const page = await practitioner();
		const t0 = Date.now() + 1_000;
		const submit = () =>
			contacts.submitContactRequest(db, {
				rpps: page.rpps,
				name: "Exemple Durand",
				email: "durand@exemple.test",
				phone: null,
				message: "Demande de test (exemple synthétique).",
				locale: "fr",
			});
		await submit();
		expect(
			(await alerts.sendAdminAlert(db, "contact_requests", { nowMs: t0, env, send })).status,
		).toBe("sent");
		expect(sent).toHaveLength(1);
		expect(sent[0]?.to).toBe("contact@apercura.example");
		expect(sent[0]?.queueUrl).toMatch(/\/fr\/pro\/admin\/contacts$/);
		// The email carries a count and a link, no name or address.
		expect(JSON.stringify(sent[0])).not.toMatch(/durand|Exemple/i);

		// A burst within the interval sends nothing more…
		await submit();
		await submit();
		const burst = await Promise.all(
			[1, 2, 3].map(() =>
				alerts.sendAdminAlert(db, "contact_requests", { nowMs: t0 + 60_000, env, send }),
			),
		);
		expect(burst.map((outcome) => outcome.status)).toEqual(["waiting", "waiting", "waiting"]);
		expect(sent).toHaveLength(1);
		// …and the tick after the interval sends one email for what came meanwhile.
		const later = await alerts.sendAdminAlerts(db, t0 + 16 * 60_000, { env, send });
		expect(later.contact_requests).toEqual({ status: "sent", count: 2 });
		expect(sent).toHaveLength(2);
		// Nothing new: nothing sent, however long it waits.
		expect(
			(await alerts.sendAdminAlert(db, "contact_requests", { nowMs: t0 + 90 * 60_000, env, send }))
				.status,
		).toBe("nothing");
		// Without any address configured, nothing is sent at all.
		expect((await alerts.sendAdminAlert(db, "claims", { nowMs: t0, env: {}, send })).status).toBe(
			"no_recipient",
		);

		// A failed send gives the slot back, so the next tick tries again.
		await submit();
		const failing = async () => {
			throw new Error("SMTP down");
		};
		const t1 = t0 + 200 * 60_000;
		expect(
			(await alerts.sendAdminAlert(db, "contact_requests", { nowMs: t1, env, send: failing }))
				.status,
		).toBe("failed");
		expect(
			await alerts.sendAdminAlert(db, "contact_requests", { nowMs: t1 + 1_000, env, send }),
		).toEqual({ status: "sent", count: 1 });
	});

	it("alerts on claims sent for review", async () => {
		const page = await practitioner();
		const sent: AdminAlertMessage[] = [];
		const env = { ADMIN_NOTIFY_EMAIL: "admins@apercura.example" };
		await db.insert(claims).values({
			id: randomUUID(),
			practitionerId: page.id,
			userId: users.owner,
			status: "in_review",
			submittedAt: new Date(),
		});
		const outcome = await alerts.sendAdminAlert(db, "claims", {
			nowMs: Date.now() + 1_000,
			env,
			send: async (message) => {
				sent.push(message);
			},
		});
		expect(outcome.status).toBe("sent");
		expect(sent[0]).toMatchObject({ to: "admins@apercura.example", kind: "claims" });
		expect(sent[0]?.queueUrl).toMatch(/\/fr\/pro\/admin\/revendications$/);
	});

	it("counts views of claimed pages only, one row per day, nothing about visitors", async () => {
		const owned = await practitioner({ claimed: true });
		const unclaimed = await practitioner();
		expect(await views.recordPageView(db, owned.id)).toBe(true);
		expect(await views.recordPageView(db, owned.id)).toBe(true);
		expect(await views.recordPageView(db, unclaimed.id)).toBe(false);
		expect(await views.recordPageView(db, 2_000_000_000)).toBe(false);
		const rows = await db
			.select()
			.from(pageViewDays)
			.where(inArray(pageViewDays.practitionerId, [owned.id, unclaimed.id]));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.views).toBe(2);
		// The table has no column that could describe a visitor.
		const columns = await db.$client<{ column_name: string }[]>`
			SELECT column_name FROM information_schema.columns
			WHERE table_schema = 'directory' AND table_name = 'page_view_days' ORDER BY column_name
		`;
		expect(columns.map((column) => column.column_name)).toEqual([
			"day",
			"practitioner_id",
			"views",
		]);
	});

	it("gives the owner views per day and week, online bookings per week and the checklist", async () => {
		const owned = await practitioner({ owned: true });
		const today = new Date(now).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
		const daysAgo = (days: number) =>
			new Date(new Date(`${today}T12:00:00Z`).getTime() - days * DAY).toISOString().slice(0, 10);
		await db.insert(pageViewDays).values([
			{ practitionerId: owned.id, day: daysAgo(0), views: 4 },
			{ practitionerId: owned.id, day: daysAgo(3), views: 2 },
			{ practitionerId: owned.id, day: daysAgo(40), views: 9 },
		]);
		const [site] = await db.$client<{ id: number }[]>`
			INSERT INTO directory.sites (source, source_key, kind, name, address_line, postcode, location, geo_precision)
			VALUES ('ans', ${`stats-${run}`}, 'office', 'Cabinet Exemple', '1 rue de l’Exemple', '99999',
				'SRID=4326;POINT(2.35 48.85)', 'address')
			RETURNING id
		`;
		const [calendar] = await db
			.insert(calendars)
			.values({
				organizationId: orgId,
				practitionerId: owned.id,
				siteId: site?.id ?? 0,
				timeZone: "Europe/Paris",
				status: "open",
			})
			.returning({ id: calendars.id });
		const slot = (offsetDays: number, source: "online" | "practice", booked: boolean) => {
			const startsAt = new Date(now - offsetDays * DAY + 3_600_000);
			const endsAt = new Date(startsAt.getTime() + 900_000);
			return {
				organizationId: orgId,
				calendarId: calendar?.id ?? "",
				practitionerId: owned.id,
				startsAt,
				endsAt,
				occupiedFrom: startsAt,
				occupiedUntil: endsAt,
				status: "confirmed",
				source,
				bookedAt: booked ? new Date(now - offsetDays * DAY) : null,
			};
		};
		await db
			.insert(appointments)
			.values([slot(0, "online", true), slot(1, "online", true), slot(2, "practice", true)]);

		const daily = await stats.dailyViews(db, owned.id, now);
		expect(daily).toHaveLength(stats.STATS_DAYS);
		expect(daily.at(-1)).toEqual({ day: today, views: 4 });
		expect(daily.reduce((sum, day) => sum + day.views, 0)).toBe(6);

		const result = await caller(users.owner).stats.page({ organizationId: orgId });
		expect(result.totals.viewsLast30Days).toBe(6);
		// Online bookings only: the entry the practice typed itself is not one.
		expect(result.totals.bookingsLast12Weeks).toBe(2);
		expect(result.weekly).toHaveLength(stats.STATS_WEEKS);
		expect(result.weekly.reduce((sum, week) => sum + week.views, 0)).toBe(15);
		const booking = result.completion.items.find((item) => item.key === "booking");
		expect(booking?.done).toBe(true);
		expect(result.completion.items.find((item) => item.key === "hours")?.done).toBe(false);
		expect(JSON.stringify(result)).not.toMatch(/patient|email/i);

		// Assistants run the agenda, not the page: no statistics.
		expect(await codeOf(caller(users.assistant).stats.page({ organizationId: orgId }))).toBe(
			"FORBIDDEN",
		);
		await db.delete(appointments).where(eq(appointments.calendarId, calendar?.id ?? ""));
		await db.delete(calendars).where(eq(calendars.id, calendar?.id ?? ""));
		await db.execute(sql`DELETE FROM directory.sites WHERE id = ${site?.id ?? 0}`);
	});

	it("takes the opt-out of the “Is this you?” block to a suppression the imports honour", async () => {
		const page = await practitioner();
		const owned = await practitioner({ claimed: true });
		// A claimed page is removed by its owner, from the editor: the public form refuses it.
		await expect(
			gdpr.requestRemoval(db, {
				rpps: owned.rpps,
				contact: "owner@exemple.test",
				message: null,
				locale: "fr",
			}),
		).rejects.toMatchObject({ code: "CLAIMED" });
		const request = await gdpr.requestRemoval(db, {
			rpps: page.rpps,
			contact: "objection@exemple.test",
			message: null,
			locale: "fr",
		});
		const [hidden] = await db.$client<{ withheld: boolean; indexable: boolean }[]>`
			SELECT withheld_at IS NOT NULL AS withheld, indexable FROM directory.practitioners
			WHERE id = ${page.id}
		`;
		// Hidden at once, but not deleted before the check.
		expect(hidden).toEqual({ withheld: true, indexable: false });
		await gdpr.decideRemoval(db, {
			id: request.id,
			adminId: users.admin,
			confirm: true,
			reason: null,
		});
		// The suppression keyed exactly as the import's scope and applySuppressions read it
		// (packages/etl/src/merge.ts; the ETL integration test imports twice over it).
		const [suppression] = await db.$client<
			{ country: string; id_scheme: string; reason: string; status: string }[]
		>`
			SELECT s.country, s.id_scheme, s.reason, p.status
			FROM directory.suppressions s
			JOIN directory.practitioners p
				ON p.country = s.country AND p.id_scheme = s.id_scheme AND p.national_id = s.national_id
			WHERE s.national_id = ${page.rpps}
		`;
		expect(suppression).toEqual({
			country: "FR",
			id_scheme: "RPPS",
			reason: "objection",
			status: "suppressed",
		});
		await db.$client`DELETE FROM directory.removal_requests WHERE practitioner_id = ${page.id}`;
		await db.$client`DELETE FROM directory.suppressions WHERE national_id = ${page.rpps}`;
	});

	it("deletes contact requests 12 months after their last change and views after 13 months", async () => {
		const page = await practitioner();
		const owned = await practitioner({ claimed: true });
		const request = (name: string, status: string, updatedAt: Date) => ({
			id: ids(name),
			practitionerId: page.id,
			status,
			contentEnc: "enc:v1:synthetic",
			createdAt: updatedAt,
			updatedAt,
		});
		await db
			.insert(practitionerContactRequests)
			.values([
				request("old-closed", "closed", new Date(now - 13 * MONTH)),
				request("old-new", "new", new Date(now - 13 * MONTH)),
				request("recent", "contacted", new Date(now - 11 * MONTH)),
			]);
		const today = new Date(now).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
		const monthsAgo = (months: number) => {
			const date = new Date(`${today}T12:00:00Z`);
			date.setUTCMonth(date.getUTCMonth() - months);
			return date.toISOString().slice(0, 10);
		};
		await db.insert(pageViewDays).values([
			{ practitionerId: owned.id, day: monthsAgo(14), views: 1 },
			{ practitionerId: owned.id, day: monthsAgo(12), views: 1 },
		]);

		// The retention suite may purge at the same moment: check what is left, not the count.
		const purged = await retention.purgeClosedRequests(db, now);
		expect(purged.contactRequests).toBeGreaterThanOrEqual(0);
		const left = await db
			.select({ id: practitionerContactRequests.id })
			.from(practitionerContactRequests)
			.where(eq(practitionerContactRequests.practitionerId, page.id));
		expect(left.map((row) => row.id)).toEqual([ids("recent")]);

		const viewPurge = await retention.purgePageViews(db, now);
		expect(viewPurge.months).toBe(13);
		const kept = await db
			.select({ day: pageViewDays.day })
			.from(pageViewDays)
			.where(eq(pageViewDays.practitionerId, owned.id));
		expect(kept.map((row) => row.day)).toEqual([monthsAgo(12)]);
	});
});
