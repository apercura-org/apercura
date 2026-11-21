-- Custom migration: grants on the account tables (Better Auth) and rate limits.
--
-- - apercura_app:      read/write, like every other app-owned table.
-- - apercura_etl:      nothing. The import never reads accounts.
-- - apercura_readonly: SELECT, but never the secrets: session tokens, password
--                      hashes, OAuth tokens, TOTP secrets, backup codes and
--                      verification values (email links, 2FA and WebAuthn
--                      challenges) stay out of reach.
--
-- The default privileges of 0004 already cover apercura_app and give
-- apercura_readonly SELECT on whole tables; this migration states the app grants
-- explicitly and narrows the read-only role to column-level grants.

GRANT SELECT, INSERT, UPDATE, DELETE ON
	directory."user",
	directory.session,
	directory.account,
	directory.verification,
	directory.two_factor,
	directory.passkey,
	directory.organization,
	directory.member,
	directory.invitation,
	directory.auth_rate_limit,
	directory.rate_limits
TO apercura_app;
--> statement-breakpoint

REVOKE ALL ON
	directory."user",
	directory.session,
	directory.account,
	directory.verification,
	directory.two_factor,
	directory.passkey,
	directory.organization,
	directory.member,
	directory.invitation,
	directory.auth_rate_limit,
	directory.rate_limits
FROM apercura_etl;
--> statement-breakpoint

GRANT SELECT ON
	directory."user",
	directory.passkey,
	directory.organization,
	directory.member,
	directory.invitation,
	directory.auth_rate_limit,
	directory.rate_limits
TO apercura_readonly;
--> statement-breakpoint

REVOKE ALL ON
	directory.session,
	directory.account,
	directory.verification,
	directory.two_factor
FROM apercura_readonly;
--> statement-breakpoint

GRANT SELECT (
	id, user_id, expires_at, ip_address, user_agent, active_organization_id, mfa_verified_at,
	mfa_method, created_at, updated_at
) ON directory.session TO apercura_readonly;
--> statement-breakpoint
GRANT SELECT (
	id, account_id, provider_id, user_id, access_token_expires_at, refresh_token_expires_at, scope,
	created_at, updated_at
) ON directory.account TO apercura_readonly;
--> statement-breakpoint
GRANT SELECT (id, user_id, verified, failed_verification_count, locked_until)
	ON directory.two_factor TO apercura_readonly;
