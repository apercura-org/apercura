/**
 * Reads a request body with a size cap. A declared `Content-Length` over the
 * cap is refused before reading; a body sent without one (chunked) is read
 * only up to the cap. Null when the body is too large: answer 413.
 */
export async function readBodyCapped(
	request: Request,
	maxBytes: number,
): Promise<Uint8Array | null> {
	const declared = request.headers.get("content-length");
	if (declared !== null && (!/^\d{1,15}$/.test(declared.trim()) || Number(declared) > maxBytes)) {
		return null;
	}
	if (!request.body) return new Uint8Array();
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel().catch(() => undefined);
			return null;
		}
		chunks.push(value);
	}
	const body = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return body;
}

/** A copy of `request` with an already read body (for handlers that read it again). */
export function withBody(request: Request, body: Uint8Array, headers = request.headers): Request {
	const method = request.method.toUpperCase();
	return new Request(request.url, {
		method,
		headers,
		body: method === "GET" || method === "HEAD" ? undefined : (body as BodyInit),
		signal: request.signal,
	});
}

export const tooLarge = () => Response.json({ error: "body too large" }, { status: 413 });
