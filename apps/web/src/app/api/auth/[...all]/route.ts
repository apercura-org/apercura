import { serverEnv } from "~/env";
import { getAuth } from "~/server/auth";
import { trustedProxyCount, withClientIpHeader } from "~/server/auth/client-ip";
import { readBodyCapped, tooLarge, withBody } from "~/server/http/body";

/** Auth requests are small JSON bodies; anything larger is refused before parsing. */
const MAX_BODY_BYTES = 64 * 1024;

/** Better Auth endpoints. The client IP header is rebuilt here, never taken from the client. */
async function handler(request: Request) {
	const headers = withClientIpHeader(
		request.headers,
		trustedProxyCount(serverEnv.TRUSTED_PROXY_COUNT),
	);
	// Read with a cap: an unbounded body would be buffered whole before any check.
	const body = await readBodyCapped(request, MAX_BODY_BYTES);
	if (!body) return tooLarge();
	return getAuth().handler(withBody(request, body, headers));
}

export { handler as GET, handler as POST };
