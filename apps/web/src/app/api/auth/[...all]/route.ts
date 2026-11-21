import { serverEnv } from "~/env";
import { getAuth } from "~/server/auth";
import { trustedProxyCount, withClientIpHeader } from "~/server/auth/client-ip";

/** Auth requests are small JSON bodies; anything larger is refused before parsing. */
const MAX_BODY_BYTES = 64 * 1024;

/** Better Auth endpoints. The client IP header is rebuilt here, never taken from the client. */
async function handler(request: Request) {
	const headers = withClientIpHeader(
		request.headers,
		trustedProxyCount(serverEnv.TRUSTED_PROXY_COUNT),
	);
	let body: ArrayBuffer | undefined;
	if (request.method !== "GET" && request.method !== "HEAD") {
		body = await request.arrayBuffer();
		if (body.byteLength > MAX_BODY_BYTES) {
			return Response.json({ error: "body too large" }, { status: 413 });
		}
	}
	return getAuth().handler(
		new Request(request.url, { method: request.method, headers, body, signal: request.signal }),
	);
}

export { handler as GET, handler as POST };
