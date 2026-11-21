import { describe, expect, it } from "vitest";
import {
	CLIENT_IP_HEADER,
	resolveClientIp,
	trustedProxyCount,
	withClientIpHeader,
} from "./client-ip";
import {
	alwaysRequiresMfa,
	DISABLED_PATHS,
	factorsLeftAfter,
	MFA_SESSION_PATHS,
	requiresStepUp,
	TRUST_DEVICE_PATHS,
} from "./policy";

describe("sign-in methods", () => {
	it("only TOTP, backup codes and passkeys mark a new session as strongly authenticated", () => {
		expect(MFA_SESSION_PATHS).toEqual({
			"/two-factor/verify-totp": "totp",
			"/two-factor/verify-backup-code": "backup_code",
			"/passkey/verify-authentication": "passkey",
		});
		for (const path of ["/sign-in/email", "/sign-up/email", "/verify-email", "/change-password"]) {
			expect(MFA_SESSION_PATHS[path]).toBeUndefined();
		}
	});

	it("disables the endpoints that would skip or weaken the second factor", () => {
		for (const path of [
			"/two-factor/send-otp",
			"/two-factor/verify-otp",
			"/sign-in/social",
			"/request-password-reset",
			"/update-session",
			"/list-sessions",
		]) {
			expect(DISABLED_PATHS).toContain(path);
		}
	});

	it("never lets a device be trusted to skip the second factor", () => {
		expect(TRUST_DEVICE_PATHS.has("/two-factor/verify-totp")).toBe(true);
		expect(TRUST_DEVICE_PATHS.has("/two-factor/verify-backup-code")).toBe(true);
	});

	it("needs a strong session for team management and for changing how one signs in", () => {
		expect(alwaysRequiresMfa("/organization/invite-member")).toBe(true);
		expect(alwaysRequiresMfa("/organization/update-member-role")).toBe(true);
		expect(alwaysRequiresMfa("/sign-in/email")).toBe(false);
		for (const path of [
			"/two-factor/enable",
			"/two-factor/disable",
			"/passkey/generate-register-options",
			"/passkey/verify-registration",
			"/passkey/delete-passkey",
			"/change-password",
			"/change-email",
		]) {
			expect(requiresStepUp(path)).toBe(true);
		}
		// Signing out (one session or all) must always work.
		expect(requiresStepUp("/revoke-sessions")).toBe(false);
		expect(requiresStepUp("/sign-out")).toBe(false);
	});

	it("keeps at least one second factor", () => {
		expect(factorsLeftAfter("/two-factor/disable", { totp: true, passkeys: 0 })).toBe(0);
		expect(factorsLeftAfter("/two-factor/disable", { totp: true, passkeys: 1 })).toBe(1);
		expect(factorsLeftAfter("/passkey/delete-passkey", { totp: false, passkeys: 1 })).toBe(0);
		expect(factorsLeftAfter("/passkey/delete-passkey", { totp: true, passkeys: 1 })).toBe(1);
		expect(factorsLeftAfter("/passkey/delete-passkey", { totp: false, passkeys: 2 })).toBe(1);
		expect(factorsLeftAfter("/sign-out", { totp: false, passkeys: 0 })).toBeNull();
	});
});

describe("client IP", () => {
	it("trusts X-Forwarded-For only through the declared number of proxies", () => {
		expect(resolveClientIp("203.0.113.7", 0)).toBeNull();
		expect(resolveClientIp("203.0.113.7", 1)).toBe("203.0.113.7");
		// The client wrote the first entry; the single proxy appended the real address.
		expect(resolveClientIp("198.51.100.1, 203.0.113.7", 1)).toBe("203.0.113.7");
		expect(resolveClientIp("198.51.100.1, 203.0.113.7, 10.0.0.2", 2)).toBe("203.0.113.7");
		expect(resolveClientIp("2001:db8::1", 1)).toBe("2001:db8::1");
		expect(resolveClientIp("203.0.113.7", 2)).toBeNull();
		expect(resolveClientIp("not-an-ip", 1)).toBeNull();
		expect(resolveClientIp(null, 1)).toBeNull();
	});

	it("replaces any client-sent value of the header Better Auth reads", () => {
		const spoofed = new Headers({
			[CLIENT_IP_HEADER]: "192.0.2.99",
			"x-forwarded-for": "203.0.113.7",
		});
		expect(withClientIpHeader(spoofed, 0).get(CLIENT_IP_HEADER)).toBeNull();
		expect(withClientIpHeader(spoofed, 1).get(CLIENT_IP_HEADER)).toBe("203.0.113.7");
	});

	it("reads TRUSTED_PROXY_COUNT defensively", () => {
		expect(trustedProxyCount(undefined)).toBe(0);
		expect(trustedProxyCount("2")).toBe(2);
		expect(trustedProxyCount("-1")).toBe(0);
		expect(trustedProxyCount("abc")).toBe(0);
	});
});
