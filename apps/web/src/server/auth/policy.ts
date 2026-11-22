/**
 * Which Better Auth endpoints may be reached, and which ones need a session
 * that proved a second factor.
 *
 * Better Auth only asks for the second factor on password sign-in. Any other
 * sign-in method (magic link, email OTP, social, OAuth) would skip it, so none
 * is installed, the remaining bypasses are disabled, and our own
 * `session.mfaVerifiedAt` is the only proof the app trusts.
 */

export type MfaMethod = "totp" | "backup_code" | "passkey" | "psc";

/** Endpoints whose new session has just proved a second factor. */
export const MFA_SESSION_PATHS: Readonly<Record<string, MfaMethod>> = {
	"/two-factor/verify-totp": "totp",
	"/two-factor/verify-backup-code": "backup_code",
	// Passkeys are registered and verified with user verification required.
	"/passkey/verify-authentication": "passkey",
};

/** Better Auth's own invitation and member endpoints, replaced by tRPC `team.*`. */
export const TEAM_PATHS = [
	"/organization/invite-member",
	"/organization/accept-invitation",
	"/organization/reject-invitation",
	"/organization/cancel-invitation",
	"/organization/get-invitation",
	"/organization/list-invitations",
	"/organization/list-user-invitations",
	"/organization/remove-member",
	"/organization/update-member-role",
	"/organization/leave",
	"/organization/update",
	"/organization/delete",
] as const;

/** Endpoints that answer 404 over HTTP. */
export const DISABLED_PATHS = [
	// Email or SMS codes as a "second factor" are not a second factor.
	"/two-factor/send-otp",
	"/two-factor/verify-otp",
	// `/sign-in/social` and `/link-social` stay reachable for Pro Santé Connect
	// only (see `pscRequestProblem`); every other provider and the direct
	// ID-token sign-in are refused there.
	"/unlink-account",
	// Account recovery is a new identity verification, never an email reset.
	"/request-password-reset",
	"/reset-password",
	// Lists session tokens; the app lists sessions by id through tRPC instead.
	"/list-sessions",
	"/delete-user",
	// Session fields are written by the server only.
	"/update-session",
	// Team changes go through tRPC `team.*` only, which re-reads the membership, requires a
	// second factor and keeps invitations to 48 hours: one path, one set of rules.
	...TEAM_PATHS,
];

/** Endpoints that always need a session with a second factor. */
export function alwaysRequiresMfa(path: string): boolean {
	// Linking Pro Santé Connect to an account changes how it signs in.
	return path.startsWith("/organization/") || path === "/link-social";
}

/** Better Auth's provider id for Pro Santé Connect. */
export const PSC_PROVIDER_ID = "psc";

/** OAuth endpoints, open to Pro Santé Connect only. */
export const OAUTH_PATHS = new Set(["/sign-in/social", "/link-social"]);

/**
 * Why an OAuth request must be refused, or null when it is a Pro Santé
 * Connect redirect flow: another provider, a disabled provider, or a direct
 * ID-token sign-in (which would skip the provider's own authentication).
 */
export function pscRequestProblem(
	body: Record<string, unknown> | undefined,
	pscEnabled: boolean,
): "provider" | "id_token" | null {
	if (!pscEnabled || body?.provider !== PSC_PROVIDER_ID) return "provider";
	if (body.idToken !== undefined) return "id_token";
	return null;
}

/**
 * The second-factor method a new session proves, from the endpoint that
 * created it: TOTP, backup code, passkey, or a Pro Santé Connect callback
 * (e-CPS or CPS card are strong authentication on their own).
 */
export function mfaMethodOf(
	path: string | undefined,
	params?: Record<string, unknown>,
): MfaMethod | null {
	if (!path) return null;
	if (path === "/callback/:id") return params?.id === PSC_PROVIDER_ID ? "psc" : null;
	return MFA_SESSION_PATHS[path] ?? null;
}

/**
 * Endpoints that change how the account signs in. Once the user has a second
 * factor, they need a session that proved it: a stolen password alone must not
 * be enough to add a passkey, replace the TOTP secret or change the password.
 */
const STEP_UP_PATHS = new Set([
	"/two-factor/enable",
	"/two-factor/disable",
	"/two-factor/get-totp-uri",
	"/two-factor/generate-backup-codes",
	"/passkey/generate-register-options",
	"/passkey/verify-registration",
	"/passkey/delete-passkey",
	"/passkey/update-passkey",
	"/change-password",
	"/change-email",
	"/update-user",
]);

export function requiresStepUp(path: string): boolean {
	return STEP_UP_PATHS.has(path);
}

/** Endpoints that accept `trustDevice`, which would let later password sign-ins skip the second factor. */
export const TRUST_DEVICE_PATHS = new Set([
	"/two-factor/verify-totp",
	"/two-factor/verify-backup-code",
	"/two-factor/verify-otp",
]);

/**
 * How many second factors would be left after this request, for the endpoints
 * that remove one (null for the others). The second factor is mandatory, so
 * the last one cannot be removed.
 */
export function factorsLeftAfter(
	path: string,
	factors: { totp: boolean; passkeys: number },
): number | null {
	if (path === "/two-factor/disable") {
		return factors.passkeys;
	}
	if (path === "/passkey/delete-passkey") {
		return (factors.totp ? 1 : 0) + Math.max(0, factors.passkeys - 1);
	}
	return null;
}
