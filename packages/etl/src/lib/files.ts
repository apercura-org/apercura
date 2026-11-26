/**
 * Source files: streaming download to disk (or read from a local directory)
 * with the checks the guards need: size, sha256, strict UTF-8, final newline.
 */
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable, Transform, type TransformCallback } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

export type SourceFile = {
	key: string;
	/** URL or local path the file was read from. */
	url: string;
	/** Final URL after redirects (data.gouv.fr stable links redirect). */
	resolvedUrl: string;
	path: string;
	bytes: number;
	sha256: string;
	lastModified: string | null;
	/** Only checked for text files. */
	utf8Valid: boolean | null;
	endsWithNewline: boolean;
};

const USER_AGENT = "apercura-etl (open data import; https://github.com/apercura-org/apercura)";

/** Hashes, counts and validates bytes as they stream through. */
class Inspector extends Transform {
	private readonly hash = createHash("sha256");
	private readonly decoder: TextDecoder | null;
	bytes = 0;
	lastByte = -1;
	utf8Valid = true;

	constructor(checkUtf8: boolean) {
		super();
		this.decoder = checkUtf8 ? new TextDecoder("utf-8", { fatal: true }) : null;
	}

	override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
		this.hash.update(chunk);
		this.bytes += chunk.length;
		if (chunk.length > 0) this.lastByte = chunk[chunk.length - 1] ?? -1;
		if (this.decoder && this.utf8Valid) {
			try {
				this.decoder.decode(chunk, { stream: true });
			} catch {
				this.utf8Valid = false;
			}
		}
		callback(null, chunk);
	}

	override _flush(callback: TransformCallback) {
		if (this.decoder && this.utf8Valid) {
			try {
				this.decoder.decode();
			} catch {
				this.utf8Valid = false;
			}
		}
		callback();
	}

	digest(): string {
		return this.hash.digest("hex");
	}
}

export type FetchOptions = {
	key: string;
	url: string;
	path: string;
	text: boolean;
	attempts?: number;
};

/** Time to receive the response headers of a download. */
const HEADERS_TIMEOUT_MS = 60_000;
/** Longest pause in a download's body before it is abandoned (and retried). */
const STALL_TIMEOUT_MS = 120_000;

/**
 * Downloads `url` to `path`, streaming. Asks for gzip transfer encoding; fetch
 * decompresses it transparently, so sizes and hashes are of the content.
 */
export async function downloadFile(options: FetchOptions): Promise<SourceFile> {
	const attempts = options.attempts ?? 3;
	let lastError: unknown;
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			return await downloadOnce(options);
		} catch (error) {
			lastError = error;
			if (attempt < attempts) await sleep(2_000 * attempt);
		}
	}
	throw new Error(`Download of ${options.key} failed after ${attempts} attempts`, {
		cause: lastError,
	});
}

async function downloadOnce(options: FetchOptions): Promise<SourceFile> {
	// Large files stream for minutes: one deadline for the headers, then one for a stalled body.
	const controller = new AbortController();
	let deadline = setTimeout(
		() => controller.abort(new Error("download timed out")),
		HEADERS_TIMEOUT_MS,
	);
	const watchdog = new Transform({
		transform(chunk, _encoding, callback) {
			clearTimeout(deadline);
			deadline = setTimeout(
				() => controller.abort(new Error("download stalled")),
				STALL_TIMEOUT_MS,
			);
			callback(null, chunk);
		},
	});
	const inspector = new Inspector(options.text);
	let response: Response;
	try {
		response = await fetch(options.url, {
			headers: { "accept-encoding": "gzip", "user-agent": USER_AGENT },
			redirect: "follow",
			signal: controller.signal,
		});
		if (!response.ok || !response.body) {
			throw new Error(`GET ${options.url} answered ${response.status}`);
		}
		await mkdir(dirname(options.path), { recursive: true });
		await pipeline(
			Readable.fromWeb(response.body as WebReadableStream<Uint8Array>),
			watchdog,
			inspector,
			createWriteStream(options.path),
		);
	} finally {
		clearTimeout(deadline);
	}
	return {
		key: options.key,
		url: options.url,
		resolvedUrl: response.url || options.url,
		path: options.path,
		bytes: inspector.bytes,
		sha256: inspector.digest(),
		lastModified: response.headers.get("last-modified"),
		utf8Valid: options.text ? inspector.utf8Valid : null,
		endsWithNewline: inspector.lastByte === 0x0a,
	};
}

/** Inspects a local file (fixtures, `--source-dir`). */
export async function inspectLocalFile(
	key: string,
	path: string,
	text: boolean,
): Promise<SourceFile> {
	const info = await stat(path);
	const inspector = new Inspector(text);
	await pipeline(createReadStream(path), inspector, async (source) => {
		for await (const _chunk of source) {
			// drain
		}
	});
	return {
		key,
		url: path,
		resolvedUrl: path,
		path,
		bytes: inspector.bytes,
		sha256: inspector.digest(),
		lastModified: info.mtime.toISOString(),
		utf8Valid: text ? inspector.utf8Valid : null,
		endsWithNewline: inspector.lastByte === 0x0a,
	};
}

/** A metadata request (dataset description, places API page) never hangs the import. */
const JSON_TIMEOUT_MS = 30_000;

/** GET a JSON document with retries. */
export async function fetchJson<T>(url: string, attempts = 3): Promise<T> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			const response = await fetch(url, {
				headers: { accept: "application/json", "user-agent": USER_AGENT },
				signal: AbortSignal.timeout(JSON_TIMEOUT_MS),
			});
			if (!response.ok) throw new Error(`GET ${url} answered ${response.status}`);
			return (await response.json()) as T;
		} catch (error) {
			lastError = error;
			if (attempt < attempts) await sleep(1_000 * attempt);
		}
	}
	throw new Error(`GET ${url} failed after ${attempts} attempts`, { cause: lastError });
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export { USER_AGENT };
