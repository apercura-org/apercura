// @ts-check
/**
 * How a cache entry is stored in Valkey: one compressed frame per entry.
 *
 * Next.js hands the handlers plain objects that hold strings, numbers, Buffers (a page's RSC
 * payload, a route's body) and Maps (a page's segments). JSON cannot carry the last two, and
 * base64 would grow the bytes by a third before compression, so a frame is:
 *
 *   "AC" | version (1 byte) | JSON length (u32) | JSON | buffer count (u32) | (length (u32) | bytes)…
 *
 * where every Buffer of the value is replaced in the JSON by `{"$$apercuraBuffer": index}` and
 * every Map by `{"$$apercuraMap": [[key, value], …]}`. The frame is then Brotli-compressed
 * (quality 5: a few milliseconds for a 300 KB page, off the event loop, about a tenth of the
 * size). Anything that does not decode is a cache miss.
 */
import { promisify } from "node:util";
import { brotliCompress, brotliDecompress, constants } from "node:zlib";

const compress = promisify(brotliCompress);
const decompress = promisify(brotliDecompress);

const MAGIC_0 = 0x41; // "A"
const MAGIC_1 = 0x43; // "C"
const VERSION = 1;
const BUFFER_KEY = "$$apercuraBuffer";
const MAP_KEY = "$$apercuraMap";

/** Brotli quality of stored entries: a good ratio for HTML and RSC at a low CPU cost. */
export const BROTLI_QUALITY = 5;

/**
 * The uncompressed frame of a value.
 * @param {unknown} value
 * @returns {Buffer}
 */
export function encodeFrame(value) {
	/** @type {Uint8Array[]} */
	const buffers = [];
	const json = JSON.stringify(
		value,
		/** @this {any} @param {string} key @param {unknown} serialized */
		function replacer(key, serialized) {
			// `this[key]` is the value before its own toJSON (Buffer has one).
			const original = this[key];
			if (original instanceof Uint8Array) {
				buffers.push(original);
				return { [BUFFER_KEY]: buffers.length - 1 };
			}
			if (original instanceof Map) return { [MAP_KEY]: [...original.entries()] };
			return serialized;
		},
	);
	const body = Buffer.from(json ?? "null", "utf8");
	let size = 2 + 1 + 4 + body.length + 4;
	for (const buffer of buffers) size += 4 + buffer.byteLength;
	const frame = Buffer.allocUnsafe(size);
	let offset = 0;
	frame[offset++] = MAGIC_0;
	frame[offset++] = MAGIC_1;
	frame[offset++] = VERSION;
	offset = frame.writeUInt32BE(body.length, offset);
	offset += body.copy(frame, offset);
	offset = frame.writeUInt32BE(buffers.length, offset);
	for (const buffer of buffers) {
		offset = frame.writeUInt32BE(buffer.byteLength, offset);
		frame.set(buffer, offset);
		offset += buffer.byteLength;
	}
	return frame;
}

/**
 * The value of an uncompressed frame. Throws on anything that is not one.
 * @param {Buffer} frame
 * @returns {unknown}
 */
export function decodeFrame(frame) {
	if (frame.length < 11 || frame[0] !== MAGIC_0 || frame[1] !== MAGIC_1) {
		throw new Error("not a cache frame");
	}
	if (frame[2] !== VERSION) throw new Error(`unknown cache frame version ${frame[2]}`);
	let offset = 3;
	const jsonLength = frame.readUInt32BE(offset);
	offset += 4;
	const jsonEnd = offset + jsonLength;
	if (jsonEnd + 4 > frame.length) throw new Error("truncated cache frame");
	const json = frame.toString("utf8", offset, jsonEnd);
	offset = jsonEnd;
	const count = frame.readUInt32BE(offset);
	offset += 4;
	/** @type {Buffer[]} */
	const buffers = [];
	for (let index = 0; index < count; index++) {
		if (offset + 4 > frame.length) throw new Error("truncated cache frame");
		const length = frame.readUInt32BE(offset);
		offset += 4;
		if (offset + length > frame.length) throw new Error("truncated cache frame");
		// A copy: the caller may keep it while the frame's memory is reused.
		buffers.push(Buffer.from(frame.subarray(offset, offset + length)));
		offset += length;
	}
	return JSON.parse(json, (_key, value) => {
		if (value && typeof value === "object" && !Array.isArray(value)) {
			const keys = Object.keys(value);
			if (keys.length === 1 && keys[0] === BUFFER_KEY) {
				const buffer = buffers[value[BUFFER_KEY]];
				if (!buffer) throw new Error("cache frame refers to a missing buffer");
				return buffer;
			}
			if (keys.length === 1 && keys[0] === MAP_KEY) return new Map(value[MAP_KEY]);
		}
		return value;
	});
}

/**
 * A value, framed and compressed, ready to store.
 * @param {unknown} value
 * @returns {Promise<Buffer>}
 */
export async function pack(value) {
	const frame = encodeFrame(value);
	return compress(frame, {
		params: {
			[constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY,
			[constants.BROTLI_PARAM_SIZE_HINT]: frame.length,
		},
	});
}

/**
 * The value of a stored entry. Throws when it does not decode.
 * @param {Buffer} stored
 * @returns {Promise<unknown>}
 */
export async function unpack(stored) {
	return decodeFrame(await decompress(stored));
}
