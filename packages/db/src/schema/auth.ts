/**
 * Accounts and access (Better Auth), in schema `directory`.
 *
 * The table and column shapes follow Better Auth 1.7 with the email + password,
 * two-factor, passkey and organization plugins (`bunx auth generate`), with
 * every timestamp stored as `timestamptz`. Field keys must keep Better Auth's
 * names: the Drizzle adapter maps models to these objects by key.
 *
 * App-owned: the open data import has no access to any of these tables.
 */
import {
	bigint,
	boolean,
	index,
	integer,
	text,
	timestamp,
	unique,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { directory } from "./schemas";

const now = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updated = () =>
	timestamp({ withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date());

/** A person with an account: practitioner, assistant or platform staff. */
export const user = directory.table("user", {
	id: text().primaryKey(),
	name: text().notNull(),
	email: text().notNull().unique(),
	emailVerified: boolean().notNull().default(false),
	image: text(),
	/** Set by the two-factor plugin once a TOTP secret has been confirmed. */
	twoFactorEnabled: boolean().default(false),
	/** Locale of emails sent to this user (`fr` or `en`). */
	locale: text().notNull().default("fr"),
	/**
	 * Platform administrator (claims review, reports). Separate from organization
	 * roles and never a way into patient data.
	 */
	isPlatformAdmin: boolean().notNull().default(false),
	createdAt: now(),
	updatedAt: updated(),
});

/** Database sessions: revocable, 12 h idle expiry. */
export const session = directory.table(
	"session",
	{
		id: text().primaryKey(),
		token: text().notNull().unique(),
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		expiresAt: timestamp({ withTimezone: true }).notNull(),
		ipAddress: text(),
		userAgent: text(),
		/** Better Auth's organization hint. Never used for access decisions. */
		activeOrganizationId: text(),
		/**
		 * When this session proved a second factor (TOTP, backup code, passkey with
		 * user verification, later Pro Santé Connect). Null means password only.
		 */
		mfaVerifiedAt: timestamp({ withTimezone: true }),
		/** `totp`, `backup_code`, `passkey` or `psc`. */
		mfaMethod: text(),
		createdAt: now(),
		updatedAt: updated(),
	},
	(table) => [index("session_user_id_idx").on(table.userId)],
);

/** Credentials: the hashed password (`providerId = 'credential'`), later Pro Santé Connect. */
export const account = directory.table(
	"account",
	{
		id: text().primaryKey(),
		accountId: text().notNull(),
		providerId: text().notNull(),
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: text(),
		refreshToken: text(),
		idToken: text(),
		accessTokenExpiresAt: timestamp({ withTimezone: true }),
		refreshTokenExpiresAt: timestamp({ withTimezone: true }),
		scope: text(),
		password: text(),
		createdAt: now(),
		updatedAt: updated(),
	},
	(table) => [index("account_user_id_idx").on(table.userId)],
);

/** Short-lived values: email verification, two-factor challenges, WebAuthn challenges. */
export const verification = directory.table(
	"verification",
	{
		id: text().primaryKey(),
		identifier: text().notNull(),
		value: text().notNull(),
		expiresAt: timestamp({ withTimezone: true }).notNull(),
		createdAt: now(),
		updatedAt: updated(),
	},
	(table) => [index("verification_identifier_idx").on(table.identifier)],
);

/** TOTP secret and backup codes, both encrypted by Better Auth. */
export const twoFactor = directory.table(
	"two_factor",
	{
		id: text().primaryKey(),
		secret: text().notNull(),
		backupCodes: text().notNull(),
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		verified: boolean().default(true),
		failedVerificationCount: integer().default(0),
		lockedUntil: timestamp({ withTimezone: true }),
	},
	(table) => [
		index("two_factor_secret_idx").on(table.secret),
		index("two_factor_user_id_idx").on(table.userId),
	],
);

/** WebAuthn credentials (registered with user verification required). */
export const passkey = directory.table(
	"passkey",
	{
		id: text().primaryKey(),
		name: text(),
		publicKey: text().notNull(),
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		credentialID: text("credential_id").notNull(),
		counter: integer().notNull(),
		deviceType: text().notNull(),
		backedUp: boolean().notNull(),
		transports: text(),
		aaguid: text(),
		createdAt: timestamp({ withTimezone: true }),
	},
	(table) => [
		index("passkey_user_id_idx").on(table.userId),
		uniqueIndex("passkey_credential_id_uq").on(table.credentialID),
	],
);

/** A practice or workspace (one or more practitioners and their assistants). */
export const organization = directory.table("organization", {
	id: text().primaryKey(),
	name: text().notNull(),
	slug: text().notNull().unique(),
	logo: text(),
	metadata: text(),
	createdAt: now(),
});

/** Membership of a user in an organization, with its role (`owner`, `practitioner`, `assistant`). */
export const member = directory.table(
	"member",
	{
		id: text().primaryKey(),
		organizationId: text()
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		userId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		role: text().notNull().default("assistant"),
		createdAt: now(),
	},
	(table) => [
		unique("member_organization_user_uq").on(table.organizationId, table.userId),
		index("member_user_id_idx").on(table.userId),
	],
);

export const invitation = directory.table(
	"invitation",
	{
		id: text().primaryKey(),
		organizationId: text()
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		email: text().notNull(),
		role: text(),
		status: text().notNull().default("pending"),
		expiresAt: timestamp({ withTimezone: true }).notNull(),
		inviterId: text()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: now(),
	},
	(table) => [
		index("invitation_organization_id_idx").on(table.organizationId),
		index("invitation_email_idx").on(table.email),
	],
);

/** Better Auth's own rate limiter (`rateLimit.storage = "database"`), keyed by IP and path. */
export const authRateLimit = directory.table("auth_rate_limit", {
	id: text().primaryKey(),
	key: text().notNull().unique(),
	count: integer().notNull(),
	/** Milliseconds since the epoch, as Better Auth writes it. */
	lastRequest: bigint({ mode: "number" }).notNull(),
});

/**
 * Application rate limits (fixed windows), e.g. per signed-in user, because
 * hospital staff share one IP address. Incremented atomically with
 * `INSERT … ON CONFLICT DO UPDATE … RETURNING`.
 */
export const rateLimits = directory.table(
	"rate_limits",
	{
		key: text().primaryKey(),
		windowStartedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		count: integer().notNull().default(0),
	},
	(table) => [index("rate_limits_window_idx").on(table.windowStartedAt)],
);

/** Schema map handed to the Better Auth Drizzle adapter (keys are Better Auth model names). */
export const authSchema = {
	user,
	session,
	account,
	verification,
	twoFactor,
	passkey,
	organization,
	member,
	invitation,
	rateLimit: authRateLimit,
};
