/**
 * Every procedure of the app router, with the access it must require. A new
 * procedure fails this test until its path is listed here, so its access is a
 * decision someone reviewed. Then each procedure is called the way an attacker
 * would: signed out, signed in without a second factor, as a non-member, as a
 * non-administrator; the middleware must refuse before any handler runs.
 */
import type { Database } from "@apercura/db";
import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import type { Permissions } from "~/server/auth/access";
import { type Context, createCallerFactory, type ProcedureMeta, type SessionContext } from "./init";
import { appRouter } from "./routers/_app";

const PUBLIC = { access: "public" } as const;
const AUTHED = { access: "authed" } as const;
const MFA = { access: "mfa" } as const;
const ADMIN = { access: "platformAdmin" } as const;
const member = (permissions: Permissions) => ({ access: "member", permissions }) as const;

const AGENDA_READ = member({ agenda: ["read"] });
const AGENDA_WRITE = member({ agenda: ["write"] });
const AGENDA_OWNER = member({ agenda: ["open"] });
const PAGE_READ = member({ page: ["read"] });
const PAGE_WRITE = member({ page: ["update"] });

const EXPECTED: Record<string, ProcedureMeta> = {
	"health.ping": PUBLIC,

	"account.status": AUTHED,
	"account.sessions": MFA,
	"account.revokeSession": MFA,
	"account.memberships": MFA,
	"account.deletionPlan": MFA,
	"account.delete": MFA,

	"search.who": PUBLIC,
	"search.where": PUBLIC,

	// Patients book without an account: rate limits, proof of work, email codes, opaque tokens.
	"booking.challenge": PUBLIC,
	"booking.options": PUBLIC,
	"booking.slots": PUBLIC,
	"booking.hold": PUBLIC,
	"booking.resendCode": PUBLIC,
	"booking.verify": PUBLIC,
	"booking.release": PUBLIC,
	"booking.manage.get": PUBLIC,
	"booking.manage.confirm": PUBLIC,
	"booking.manage.cancel": PUBLIC,
	"booking.manage.slots": PUBLIC,
	"booking.manage.reschedule": PUBLIC,

	"agenda.list": AGENDA_READ,
	"agenda.calendars": AGENDA_READ,
	"agenda.create": AGENDA_WRITE,
	"agenda.block": AGENDA_WRITE,
	"agenda.cancel": AGENDA_WRITE,
	"agenda.decide": AGENDA_WRITE,
	"agenda.noShow": AGENDA_WRITE,

	"calendar.list": AGENDA_OWNER,
	"calendar.overview": AGENDA_OWNER,
	"calendar.rotateFeed": AGENDA_OWNER,
	"calendar.revokeFeed": AGENDA_OWNER,
	"calendar.requirements": AGENDA_OWNER,
	"calendar.presets": AGENDA_OWNER,
	"calendar.create": AGENDA_OWNER,
	"calendar.update": AGENDA_OWNER,
	"calendar.setStatus": AGENDA_OWNER,
	"calendar.saveType": AGENDA_OWNER,
	"calendar.replaceRules": AGENDA_OWNER,
	"calendar.addException": AGENDA_OWNER,
	"calendar.removeException": AGENDA_OWNER,
	"calendar.searchCommunes": AGENDA_OWNER,
	"calendar.communesAround": AGENDA_OWNER,

	"team.list": member({ member: ["update"] }),
	"team.invite": member({ invitation: ["create"] }),
	"team.cancelInvitation": member({ invitation: ["cancel"] }),
	"team.updateRole": member({ member: ["update"] }),
	"team.remove": member({ member: ["delete"] }),
	"team.mine": MFA,
	"team.invitation": MFA,
	"team.accept": MFA,
	"team.decline": MFA,

	"audit.list": member({ audit: ["read"] }),

	"claims.mine": MFA,
	"claims.preview": MFA,
	"claims.start": MFA,
	"claims.get": MFA,
	"claims.sendRegistryEmail": MFA,
	"claims.pscResult": MFA,
	"claims.phoneCode": MFA,
	"claims.submit": MFA,
	// The registry email link: the token alone proves control of the practice's mailbox.
	"claims.confirmEmail": PUBLIC,
	"claims.withdraw": MFA,

	"profile.get": PAGE_READ,
	"profile.save": PAGE_WRITE,
	"profile.publish": PAGE_WRITE,
	"profile.setSiteHidden": PAGE_WRITE,
	"profile.addSite": PAGE_WRITE,
	"profile.removeSite": PAGE_WRITE,
	"profile.removePhoto": PAGE_WRITE,
	"profile.setRemoved": member({ organization: ["delete"] }),

	"gdpr.requestRemoval": PUBLIC,
	"gdpr.report": PUBLIC,

	"admin.claims.queue": ADMIN,
	"admin.claims.detail": ADMIN,
	"admin.claims.verifyPhone": ADMIN,
	"admin.claims.approve": ADMIN,
	"admin.claims.reject": ADMIN,
	"admin.reports.queue": ADMIN,
	"admin.reports.read": ADMIN,
	"admin.reports.resolve": ADMIN,
	"admin.removals.queue": ADMIN,
	"admin.removals.read": ADMIN,
	"admin.removals.decide": ADMIN,
};

type AnyProcedure = { _def: { meta?: ProcedureMeta; type: string } };
const procedures = appRouter._def.procedures as unknown as Record<string, AnyProcedure>;

/**
 * A database where nothing exists: every query resolves to no rows. Enough
 * for the membership and administrator lookups of the middleware.
 */
function emptyDatabase(): Database {
	const chain: unknown = new Proxy(() => undefined, {
		get: (_target, key) => {
			if (key === "then") {
				return (resolve: (rows: unknown[]) => void) => resolve([]);
			}
			return chain;
		},
		apply: () => chain,
	});
	return chain as Database;
}

function session(mfaVerifiedAt: Date | null): SessionContext {
	return {
		session: {
			id: "session-probe",
			userId: "user-probe",
			expiresAt: new Date(Date.now() + 3_600_000),
			mfaVerifiedAt,
			// A client-chosen active organization is never trusted.
			activeOrganizationId: "org-probe",
		},
		user: {
			id: "user-probe",
			email: "probe@example.test",
			name: "Probe",
			emailVerified: true,
		},
	};
}

function callerFor(current: SessionContext | null) {
	const ctx: Context = {
		headers: new Headers(),
		db: emptyDatabase,
		getSession: async () => current,
		rateLimit: async () => true,
	};
	return createCallerFactory(appRouter)(ctx);
}

type Callable = (input?: unknown) => Promise<unknown>;

function procedureOf(caller: unknown, path: string): Callable {
	return path
		.split(".")
		.reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], caller) as Callable;
}

async function outcome(call: Promise<unknown>): Promise<string> {
	try {
		await call;
		return "OK";
	} catch (error) {
		if (error instanceof TRPCError) {
			return error.message === "MFA_REQUIRED" ? "MFA_REQUIRED" : error.code;
		}
		return "OTHER";
	}
}

describe("procedure access", () => {
	it("lists every procedure with the access its path requires", () => {
		const actual = Object.fromEntries(
			Object.entries(procedures).map(([path, procedure]) => [path, procedure._def.meta]),
		);
		expect(actual).toEqual(EXPECTED);
	});

	const restricted = Object.entries(EXPECTED).filter(([, meta]) => meta.access !== "public");
	const needingFactor = restricted.filter(([, meta]) => meta.access !== "authed");

	it.each(restricted)("%s refuses a signed-out caller", async (path) => {
		expect(await outcome(procedureOf(callerFor(null), path)({}))).toBe("UNAUTHORIZED");
	});

	it.each(needingFactor)("%s refuses a session without a second factor", async (path) => {
		const caller = callerFor(session(null));
		expect(await outcome(procedureOf(caller, path)({ organizationId: "org-probe" }))).toBe(
			"MFA_REQUIRED",
		);
	});

	it.each(
		restricted.filter(([, meta]) => meta.access === "member" || meta.access === "platformAdmin"),
	)("%s refuses a non-member or a non-administrator", async (path) => {
		const caller = callerFor(session(new Date()));
		expect(await outcome(procedureOf(caller, path)({ organizationId: "org-probe" }))).toBe(
			"FORBIDDEN",
		);
	});

	it.each(Object.entries(EXPECTED).filter(([, meta]) => meta.access === "public"))(
		"%s never asks a patient to sign in",
		async (path) => {
			const result = await outcome(procedureOf(callerFor(null), path)(undefined));
			expect(["UNAUTHORIZED", "MFA_REQUIRED"]).not.toContain(result);
		},
	);
});
