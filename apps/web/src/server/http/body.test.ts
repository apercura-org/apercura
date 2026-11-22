import { describe, expect, it } from "vitest";
import { readBodyCapped, withBody } from "./body";

function streamOf(chunks: number[]) {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const size of chunks) controller.enqueue(new Uint8Array(size).fill(97));
			controller.close();
		},
	});
}

describe("readBodyCapped", () => {
	it("reads a body within the cap", async () => {
		const request = new Request("http://localhost/api", { method: "POST", body: "hello" });
		expect(new TextDecoder().decode((await readBodyCapped(request, 16)) ?? undefined)).toBe(
			"hello",
		);
	});

	it("refuses a declared Content-Length over the cap before reading", async () => {
		const request = new Request("http://localhost/api", {
			method: "POST",
			body: "x",
			headers: { "content-length": "1000000000" },
		});
		expect(await readBodyCapped(request, 1024)).toBeNull();
	});

	it("stops reading a chunked body as soon as it passes the cap", async () => {
		const request = new Request("http://localhost/api", {
			method: "POST",
			body: streamOf([600, 600, 600]),
			duplex: "half",
		} as RequestInit);
		expect(await readBodyCapped(request, 1024)).toBeNull();
	});

	it("hands the body on to the next handler", async () => {
		const request = new Request("http://localhost/api", { method: "POST", body: '{"a":1}' });
		const body = await readBodyCapped(request, 64);
		expect(await withBody(request, body as Uint8Array).json()).toEqual({ a: 1 });
		const get = new Request("http://localhost/api");
		expect((await readBodyCapped(get, 64))?.byteLength).toBe(0);
	});
});
