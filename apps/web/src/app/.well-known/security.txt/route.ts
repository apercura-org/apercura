import { connection } from "next/server";
import { serverEnv } from "~/env";
import { securityContact, securityTxt } from "~/lib/legal";
import { siteOrigin } from "~/lib/site-url";

/**
 * `/.well-known/security.txt` (RFC 9116): where to report a vulnerability (SECURITY_CONTACT,
 * else the legal contact, else the repository's private advisories) and the disclosure policy.
 * Rendered per request, so `Expires` always lies 180 days ahead and APP_URL is the runtime one.
 */
export async function GET(): Promise<Response> {
	await connection();
	const { contact, policy } = securityContact(serverEnv);
	const body = securityTxt({
		contact,
		policy,
		canonical: `${siteOrigin()}/.well-known/security.txt`,
		now: new Date(),
	});
	return new Response(body, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=86400",
		},
	});
}
