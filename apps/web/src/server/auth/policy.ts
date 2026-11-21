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

/** Endpoints that answer 404 over HTTP. */
export const DISABLED_PATHS = [
	// Email or SMS codes as a "second factor" are not a second factor.
	"/two-factor/send-otp",
	"/two-factor/verify-otp",
	// No social or OAuth sign-in (Pro Santé Connect will get its own flow).
	"/sign-in/social",
	"/link-social",
	// Account recovery is a new identity verification, never an email reset.
	"/request-password-reset",
	"/reset-password",
	// Lists session tokens; the app lists sessions by id through tRPC instead.
	"/list-sessions",
	"/delete-user",
	// Session fields are written by the server only.
	"/update-session",
];

/** Endpoints that always need a session with a second factor. */
export function alwaysRequiresMfa(path: string): boolean {
	return path.startsWith("/organization/");
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
