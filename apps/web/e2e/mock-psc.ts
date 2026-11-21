/**
 * A stand-in for Pro Santé Connect (OpenID Connect), for local development and
 * the end-to-end tests only. It never talks to the ANS.
 *
 *   PSC_MOCK_PORT=3190 PSC_CLIENT_ID=… PSC_CLIENT_SECRET=… bun e2e/mock-psc.ts
 *   then PSC_ISSUER=http://localhost:3190 for the app.
 *
 * Like the real service it publishes a discovery document and its signing
 * keys, signs RS256 ID tokens bound to the request's nonce, checks the client
 * secret sent in the token request body (client_secret_post) and the PKCE
 * verifier, and returns `SubjectNameID` / `preferred_username` (= `8` + RPPS)
 * next to a technical `sub` UUID. The sign-in page asks for the RPPS number
 * the e-CPS app would prove (synthetic fixtures only).
 */
import { createHash, createSign, generateKeyPairSync, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const PORT = Number(process.env.PSC_MOCK_PORT ?? 3190);
const ISSUER = `http://localhost:${PORT}`;
const CLIENT_ID = process.env.PSC_CLIENT_ID ?? "apercura-e2e";
const CLIENT_SECRET = process.env.PSC_CLIENT_SECRET ?? "e2e-only-secret";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KID = randomUUID();
const jwk = { ...publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" };

type Grant = {
	rpps: string;
	nonce: string | null;
	redirectUri: string;
	challenge: string | null;
	clientId: string;
};
const codes = new Map<string, Grant>();
const tokens = new Map<string, string>();
/** One stable technical `sub` per person, as the real service keeps. */
const subjects = new Map<string, string>();

const b64url = (value: Buffer | string) => Buffer.from(value).toString("base64url");

function signJwt(payload: Record<string, unknown>) {
	const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: KID }));
	const body = b64url(JSON.stringify(payload));
	const signature = createSign("RSA-SHA256").update(`${header}.${body}`).sign(privateKey);
	return `${header}.${body}.${b64url(signature)}`;
}

function json(response: ServerResponse, status: number, value: unknown) {
	response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
	response.end(JSON.stringify(value));
}

async function form(request: IncomingMessage) {
	const chunks: Buffer[] = [];
	for await (const chunk of request) chunks.push(chunk as Buffer);
	return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

const escapeHtml = (value: string) =>
	value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

function signInPage(params: URLSearchParams) {
	const hidden = [...params]
		.map(
			([key, value]) =>
				`<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}">`,
		)
		.join("");
	return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Pro Santé Connect (simulation)</title></head>
<body><main><h1>Pro Santé Connect (simulation)</h1>
<p>Service de test : aucune donnée n’est envoyée à l’ANS.</p>
<form method="post" action="/auth">${hidden}
<label for="rpps">Numéro RPPS</label> <input id="rpps" name="rpps" inputmode="numeric" pattern="\\d{11}" required>
<button type="submit">Valider avec e-CPS</button>
</form></main></body></html>`;
}

const server = createServer(async (request, response) => {
	const url = new URL(request.url ?? "/", ISSUER);
	try {
		if (url.pathname === "/.well-known/openid-configuration") {
			return json(response, 200, {
				issuer: ISSUER,
				authorization_endpoint: `${ISSUER}/auth`,
				token_endpoint: `${ISSUER}/token`,
				userinfo_endpoint: `${ISSUER}/userinfo`,
				jwks_uri: `${ISSUER}/jwks`,
				response_types_supported: ["code"],
				subject_types_supported: ["public"],
				id_token_signing_alg_values_supported: ["RS256"],
				token_endpoint_auth_methods_supported: ["client_secret_post"],
				code_challenge_methods_supported: ["S256"],
				scopes_supported: ["openid", "scope_all"],
			});
		}
		if (url.pathname === "/jwks") return json(response, 200, { keys: [jwk] });
		if (url.pathname === "/auth" && request.method === "GET") {
			if (url.searchParams.get("client_id") !== CLIENT_ID)
				return json(response, 400, { error: "unauthorized_client" });
			response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
			return response.end(signInPage(url.searchParams));
		}
		if (url.pathname === "/auth" && request.method === "POST") {
			const params = await form(request);
			const rpps = params.get("rpps") ?? "";
			const redirectUri = params.get("redirect_uri") ?? "";
			if (!/^\d{11}$/.test(rpps) || !redirectUri)
				return json(response, 400, { error: "invalid_request" });
			const code = randomUUID();
			codes.set(code, {
				rpps,
				nonce: params.get("nonce"),
				redirectUri,
				challenge: params.get("code_challenge"),
				clientId: params.get("client_id") ?? "",
			});
			const target = new URL(redirectUri);
			target.searchParams.set("code", code);
			target.searchParams.set("state", params.get("state") ?? "");
			target.searchParams.set("iss", ISSUER);
			response.writeHead(302, { location: target.toString() });
			return response.end();
		}
		if (url.pathname === "/token" && request.method === "POST") {
			const params = await form(request);
			if (params.get("client_id") !== CLIENT_ID || params.get("client_secret") !== CLIENT_SECRET) {
				return json(response, 401, { error: "invalid_client" });
			}
			const grant = codes.get(params.get("code") ?? "");
			codes.delete(params.get("code") ?? "");
			if (!grant || grant.redirectUri !== params.get("redirect_uri")) {
				return json(response, 400, { error: "invalid_grant" });
			}
			if (grant.challenge) {
				const verifier = params.get("code_verifier") ?? "";
				if (b64url(createHash("sha256").update(verifier).digest()) !== grant.challenge) {
					return json(response, 400, { error: "invalid_grant" });
				}
			}
			const sub = subjects.get(grant.rpps) ?? randomUUID();
			subjects.set(grant.rpps, sub);
			const accessToken = randomUUID();
			tokens.set(accessToken, grant.rpps);
			const now = Math.floor(Date.now() / 1000);
			return json(response, 200, {
				access_token: accessToken,
				token_type: "Bearer",
				expires_in: 300,
				scope: "openid scope_all",
				id_token: signJwt({
					iss: ISSUER,
					aud: grant.clientId,
					sub,
					iat: now,
					exp: now + 300,
					...(grant.nonce ? { nonce: grant.nonce } : {}),
					acr: "eidas2",
				}),
			});
		}
		if (url.pathname === "/userinfo") {
			const token = (request.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
			const rpps = tokens.get(token);
			if (!rpps) return json(response, 401, { error: "invalid_token" });
			return json(response, 200, {
				sub: subjects.get(rpps),
				SubjectNameID: `8${rpps}`,
				preferred_username: `8${rpps}`,
				given_name: "Exemple",
				family_name: "Praticien",
			});
		}
		json(response, 404, { error: "not_found" });
	} catch (error) {
		json(response, 500, { error: error instanceof Error ? error.message : "error" });
	}
});

server.listen(PORT, () => {
	console.log(`Mock Pro Santé Connect on ${ISSUER}`);
});
