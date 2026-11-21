import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ACCEPTED = new Set(["jpeg", "png", "webp"]);
const SIZE = 640;

export class PhotoError extends Error {
	constructor(readonly code: "TOO_LARGE" | "UNSUPPORTED") {
		super(code);
		this.name = "PhotoError";
	}
}

/**
 * Re-encodes an uploaded photo: JPEG, PNG or WebP of 5 MB at most, decoded
 * by sharp (the declared type is never trusted), turned upright from its EXIF
 * orientation, cropped square around the subject, and written as a fresh
 * WebP without any metadata (EXIF, GPS, ICC comments). Returns the bytes and
 * a random storage key.
 */
export async function processPhoto(input: Uint8Array) {
	if (input.byteLength === 0 || input.byteLength > MAX_PHOTO_BYTES) {
		throw new PhotoError(input.byteLength === 0 ? "UNSUPPORTED" : "TOO_LARGE");
	}
	let format: string | undefined;
	try {
		({ format } = await sharp(input, { failOn: "error" }).metadata());
	} catch {
		throw new PhotoError("UNSUPPORTED");
	}
	if (!format || !ACCEPTED.has(format)) throw new PhotoError("UNSUPPORTED");
	const body = await sharp(input, { failOn: "error", limitInputPixels: 40_000_000 })
		.rotate()
		.resize(SIZE, SIZE, { fit: "cover", position: "attention" })
		.webp({ quality: 82 })
		.toBuffer();
	return { body, key: `photos/${randomUUID()}.webp`, contentType: "image/webp" };
}
