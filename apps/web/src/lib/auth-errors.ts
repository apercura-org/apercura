/** Maps a Better Auth client error to a message key under `auth.errors`. */
export type AuthErrorKey =
	| "generic"
	| "tooManyRequests"
	| "invalidCredentials"
	| "emailNotVerified"
	| "invalidCode"
	| "locked"
	| "passwordTooShort"
	| "passwordTooLong"
	| "userExists"
	| "invalidPassword"
	| "mfaRequired"
	| "lastFactor"
	| "passkeyFailed";

const BY_CODE: Record<string, AuthErrorKey> = {
	INVALID_EMAIL_OR_PASSWORD: "invalidCredentials",
	EMAIL_NOT_VERIFIED: "emailNotVerified",
	INVALID_CODE: "invalidCode",
	INVALID_BACKUP_CODE: "invalidCode",
	INVALID_TWO_FACTOR_COOKIE: "invalidCode",
	TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "locked",
	ACCOUNT_TEMPORARILY_LOCKED: "locked",
	PASSWORD_TOO_SHORT: "passwordTooShort",
	PASSWORD_TOO_LONG: "passwordTooLong",
	USER_ALREADY_EXISTS: "userExists",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "userExists",
	INVALID_PASSWORD: "invalidPassword",
	MFA_REQUIRED: "mfaRequired",
	LAST_SECOND_FACTOR: "lastFactor",
	AUTH_CANCELLED: "passkeyFailed",
	AUTHENTICATION_FAILED: "passkeyFailed",
	PASSKEY_NOT_FOUND: "passkeyFailed",
	FAILED_TO_VERIFY_REGISTRATION: "passkeyFailed",
};

export function authErrorKey(
	error: { code?: string | null; status?: number | null } | null | undefined,
): AuthErrorKey {
	if (!error) {
		return "generic";
	}
	if (error.status === 429) {
		return "tooManyRequests";
	}
	return (error.code && BY_CODE[error.code]) || "generic";
}
