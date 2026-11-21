import "server-only";
import { authSchema } from "@apercura/db/schema";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { organization, twoFactor } from "better-auth/plugins";
import { serverEnv } from "~/env";
import { getDb } from "~/server/db";
import { emailLocale, sendVerificationEmail } from "~/server/mail/auth-emails";
import { ac, roles } from "./access";
import { CLIENT_IP_HEADER } from "./client-ip";
import { hasSecondFactor, secondFactors } from "./membership";
import {
	alwaysRequiresMfa,
	DISABLED_PATHS,
	factorsLeftAfter,
	MFA_SESSION_PATHS,
	requiresStepUp,
	TRUST_DEVICE_PATHS,
} from "./policy";

const HOUR = 60 * 60;

/** Error code the client shows as "confirm with your second factor first". */
const MFA_REQUIRED = "MFA_REQUIRED";

function mfaRequired() {
	return new APIError("FORBIDDEN", {
		code: MFA_REQUIRED,
		message: "This action needs a session confirmed with a second factor.",
	});
}

function createAuth() {
	const baseURL = serverEnv.BETTER_AUTH_URL ?? serverEnv.APP_URL;
	const isProduction = process.env.NODE_ENV === "production";

	return betterAuth({
		appName: "Apercura",
		baseURL,
		secret: serverEnv.BETTER_AUTH_SECRET,
		trustedOrigins: [serverEnv.APP_URL, baseURL].filter(Boolean),
		database: drizzleAdapter(getDb(), { provider: "pg", schema: authSchema }),
		telemetry: { enabled: false },
		disabledPaths: DISABLED_PATHS,

		emailAndPassword: {
			enabled: true,
			requireEmailVerification: true,
			autoSignIn: false,
			minPasswordLength: 12,
			maxPasswordLength: 128,
		},
		emailVerification: {
			sendOnSignUp: true,
			sendOnSignIn: true,
			// The verification link alone never opens a session: the person signs in with their password.
			autoSignInAfterVerification: false,
			expiresIn: HOUR,
			sendVerificationEmail: async ({ user, url }) => {
				await sendVerificationEmail({
					to: user.email,
					name: user.name,
					url,
					locale: (user as { locale?: unknown }).locale,
				});
			},
		},
		account: { accountLinking: { enabled: false } },

		user: {
			additionalFields: {
				locale: { type: "string", required: false, defaultValue: "fr", input: true },
				isPlatformAdmin: {
					type: "boolean",
					required: false,
					defaultValue: false,
					input: false,
				},
			},
		},
		session: {
			// Database sessions with a 12 h idle expiry: each use more than 15 min after
			// the last refresh pushes the expiry back to 12 h from now.
			expiresIn: 12 * HOUR,
			updateAge: 15 * 60,
			additionalFields: {
				mfaVerifiedAt: { type: "date", required: false, input: false },
				mfaMethod: { type: "string", required: false, input: false },
			},
		},

		rateLimit: {
			enabled: isProduction,
			storage: "database",
			window: 60,
			max: 100,
			customRules: {
				"/sign-up/email": { window: HOUR, max: 5 },
				"/sign-in/email": { window: 60, max: 5 },
				"/send-verification-email": { window: HOUR, max: 3 },
				"/two-factor/*": { window: 60, max: 5 },
				"/passkey/verify-authentication": { window: 60, max: 10 },
			},
		},
		advanced: {
			cookiePrefix: "apercura",
			useSecureCookies: isProduction && baseURL?.startsWith("https://"),
			// The route handler sets this header from X-Forwarded-For and
			// TRUSTED_PROXY_COUNT, after removing any client-sent value.
			ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
		},

		databaseHooks: {
			user: {
				create: {
					before: async (user) => ({
						data: { ...user, locale: emailLocale(user.locale), isPlatformAdmin: false },
					}),
				},
				update: {
					before: async (data) => {
						if (!("locale" in data)) {
							return { data };
						}
						return { data: { ...data, locale: emailLocale(data.locale) } };
					},
				},
			},
			session: {
				create: {
					// The only place mfaVerifiedAt is set on a new session: the endpoint
					// that created it has just verified a second factor.
					before: async (session, ctx) => {
						const method = ctx?.path ? MFA_SESSION_PATHS[ctx.path] : undefined;
						if (!method) {
							return { data: session };
						}
						return { data: { ...session, mfaVerifiedAt: new Date(), mfaMethod: method } };
					},
				},
			},
		},

		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				const path = ctx.path;
				const body = ctx.body as Record<string, unknown> | undefined;
				if (path === "/passkey/verify-registration" && body?.createSession) {
					throw new APIError("BAD_REQUEST", { message: "createSession is not supported" });
				}
				if (!alwaysRequiresMfa(path) && !requiresStepUp(path)) {
					if (TRUST_DEVICE_PATHS.has(path) && body?.trustDevice) {
						// A trusted device would let the next password sign-in skip the second factor.
						return { context: { body: { ...body, trustDevice: false } } };
					}
					return;
				}
				const current = await getSessionFromCtx(ctx);
				if (!current) {
					// No session: the endpoint itself refuses (or it is a trusted server call).
					return;
				}
				if (!current.session.mfaVerifiedAt && alwaysRequiresMfa(path)) {
					throw mfaRequired();
				}
				const factors = await secondFactors(getDb(), current.user.id);
				if (!current.session.mfaVerifiedAt && hasSecondFactor(factors)) {
					throw mfaRequired();
				}
				const remaining = factorsLeftAfter(path, factors);
				if (remaining !== null && remaining < 1) {
					throw new APIError("BAD_REQUEST", {
						code: "LAST_SECOND_FACTOR",
						message: "Add another second factor before removing this one.",
					});
				}
			}),
			after: createAuthMiddleware(async (ctx) => {
				const path = ctx.path;
				if (isAPIError(ctx.context.returned) || ctx.context.returned instanceof Error) {
					return;
				}
				// Step-up: an existing password session proves a second factor without
				// a new session being created (Better Auth only creates one at sign-in
				// or when the factor is first confirmed, see databaseHooks above).
				const method =
					path === "/passkey/verify-registration" ? "passkey" : MFA_SESSION_PATHS[path];
				if (!method || path === "/passkey/verify-authentication" || ctx.context.newSession) {
					return;
				}
				const current = await getSessionFromCtx(ctx);
				if (!current || current.session.mfaVerifiedAt) {
					return;
				}
				await ctx.context.internalAdapter.updateSession(current.session.token, {
					mfaVerifiedAt: new Date(),
					mfaMethod: method,
				});
			}),
		},

		plugins: [
			twoFactor({
				issuer: "Apercura",
				backupCodeOptions: { amount: 10, length: 10 },
			}),
			passkey({
				rpName: "Apercura",
				authenticatorSelection: { userVerification: "required", residentKey: "preferred" },
			}),
			organization({
				ac,
				roles,
				creatorRole: "owner",
				// Organizations are created by the claim flow (server side), not by users.
				allowUserToCreateOrganization: false,
				invitationExpiresIn: 7 * 24 * HOUR,
			}),
			// Must stay last: forwards Set-Cookie from server-side auth calls.
			nextCookies(),
		],
	});
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as typeof globalThis & { apercuraAuth?: Auth };

/** The Better Auth instance, created on first use (builds never need the database). */
export function getAuth(): Auth {
	globalForAuth.apercuraAuth ??= createAuth();
	return globalForAuth.apercuraAuth;
}

export type AuthSession = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;
