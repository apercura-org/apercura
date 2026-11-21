import "server-only";
import { pscIdentifierOf } from "@apercura/core";
import type { GenericOAuthConfig } from "better-auth/plugins";
import { serverEnv } from "~/env";
import { PSC_PROVIDER_ID } from "./policy";

/**
 * Pro Santé Connect (ANS), an OpenID Connect provider for health
 * professionals (e-CPS app or CPS card).
 *
 * - Discovery from PSC_ISSUER, client_secret_post, scope `openid scope_all`,
 *   PKCE, ID tokens verified against the provider's keys with a nonce.
 * - The account is keyed by `SubjectNameID` / `preferred_username`
 *   (`8` + RPPS), never by `sub`, a technical UUID since March 2026.
 * - It never creates an account: a practitioner links it to their account
 *   from the claim page (which verifies the claim), then can sign in with it.
 * - Its profile email is replaced by a placeholder on the reserved `.invalid`
 *   domain, so it can never match, link or overwrite a real address.
 */
export function pscProviderConfig(): GenericOAuthConfig {
	const issuer = (serverEnv.PSC_ISSUER ?? "").replace(/\/+$/, "");
	return {
		providerId: PSC_PROVIDER_ID,
		name: "Pro Santé Connect",
		discoveryUrl: `${issuer}/.well-known/openid-configuration`,
		requireIdTokenVerification: true,
		clientId: serverEnv.PSC_CLIENT_ID ?? "",
		clientSecret: serverEnv.PSC_CLIENT_SECRET,
		tokenEndpointAuth: { method: "client_secret_post" },
		scopes: ["openid", "scope_all"],
		pkce: true,
		disableSignUp: true,
		overrideUserInfo: false,
		accountSubject: ({ profile }) => {
			const identifier = pscIdentifierOf(profile as Record<string, unknown>);
			if (!identifier) throw new Error("Pro Santé Connect returned no SubjectNameID");
			return identifier;
		},
		mapProfileToUser: (profile) => {
			const identifier = pscIdentifierOf(profile as Record<string, unknown>) ?? "unknown";
			const given = typeof profile.given_name === "string" ? profile.given_name : "";
			const family = typeof profile.family_name === "string" ? profile.family_name : "";
			return {
				email: `${identifier}@psc.invalid`,
				emailVerified: true,
				name: `${given} ${family}`.trim() || identifier,
			};
		},
	};
}
