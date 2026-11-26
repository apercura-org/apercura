import { describe, expect, it } from "vitest";
import { decodeFrame, encodeFrame, pack, unpack } from "./codec.mjs";

const page = {
	kind: "APP_PAGE",
	html: `<!DOCTYPE html><html lang="fr"><body>${"<p>Médecin généraliste</p>".repeat(400)}</body></html>`,
	rscData: Buffer.from(`0:["$","div",null,{"children":"é"}]\n`.repeat(200)),
	postponed: undefined,
	status: 200,
	headers: { "x-next-cache-tags": "practitioner:1,_N_T_/fr/praticien/x", vary: ["rsc", "accept"] },
	segmentData: new Map([
		["/_tree", Buffer.from("tree")],
		["/_full", Buffer.from([0, 255, 254, 1])],
	]),
};

describe("cache entry codec", () => {
	it("round-trips a page with its buffers and segments", async () => {
		const stored = await pack({ lastModified: 1, value: page });
		const back = (await unpack(stored)) as { lastModified: number; value: typeof page };
		expect(back.lastModified).toBe(1);
		expect(back.value.html).toBe(page.html);
		expect(Buffer.isBuffer(back.value.rscData)).toBe(true);
		expect(back.value.rscData.equals(page.rscData)).toBe(true);
		expect(back.value.segmentData).toBeInstanceOf(Map);
		expect([...back.value.segmentData.keys()]).toEqual(["/_tree", "/_full"]);
		expect(back.value.segmentData.get("/_full")?.equals(Buffer.from([0, 255, 254, 1]))).toBe(true);
		expect(back.value.headers).toEqual(page.headers);
		expect(back.value.status).toBe(200);
		expect("postponed" in back.value).toBe(false);
	});

	it("compresses pages several times over", async () => {
		const frame = encodeFrame(page);
		const stored = await pack(page);
		expect(stored.length * 5).toBeLessThan(frame.length);
	});

	it("keeps binary buffers byte for byte (no UTF-8 or base64 detour)", () => {
		const bytes = Buffer.from(Array.from({ length: 256 }, (_, index) => index));
		const back = decodeFrame(encodeFrame({ value: bytes })) as { value: Buffer };
		expect(back.value.equals(bytes)).toBe(true);
	});

	it("refuses what is not one of its frames", async () => {
		expect(() => decodeFrame(Buffer.from("not a frame at all"))).toThrow();
		const frame = encodeFrame(page);
		expect(() => decodeFrame(frame.subarray(0, frame.length - 3))).toThrow();
		await expect(unpack(Buffer.from("garbage"))).rejects.toThrow();
	});
});
