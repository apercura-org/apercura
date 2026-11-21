import "server-only";
import { AwsClient } from "aws4fetch";
import { serverEnv } from "~/env";

/**
 * Object storage (§13 `StorageDriver`): S3-compatible in every deployment
 * (MinIO in development, the host's S3 such as Cellar in production). Photos
 * are public objects served through `/media/photos/…` (or S3_PUBLIC_URL);
 * claim documents are platform-key ciphertexts and never public.
 */
export interface StorageDriver {
	put(key: string, body: Uint8Array, contentType: string): Promise<void>;
	/** The object's bytes, or null when it does not exist. */
	get(key: string): Promise<{ body: Uint8Array; contentType: string | null } | null>;
	delete(key: string): Promise<void>;
}

const TIMEOUT_MS = 10_000;

export class StorageError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "StorageError";
	}
}

/** Path-style S3 client (works with MinIO, Cellar, Garage, AWS). */
export function s3Driver(options: {
	endpoint: string;
	bucket: string;
	accessKeyId: string;
	secretAccessKey: string;
	region?: string;
}): StorageDriver {
	const client = new AwsClient({
		accessKeyId: options.accessKeyId,
		secretAccessKey: options.secretAccessKey,
		service: "s3",
		region: options.region ?? "us-east-1",
	});
	const base = options.endpoint.replace(/\/+$/, "");
	const bucketUrl = `${base}/${encodeURIComponent(options.bucket)}`;
	const objectUrl = (key: string) =>
		`${bucketUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
	let bucketReady: Promise<void> | undefined;

	/**
	 * Signs then sends the request with the original body: aws4fetch's own
	 * fetch would stream it (chunked, no Content-Length), which S3 refuses.
	 */
	const send = async (
		url: string,
		init: { method?: string; body?: Uint8Array; headers?: Record<string, string> } = {},
	) => {
		const signed = await client.sign(url, {
			method: init.method ?? "GET",
			headers: init.headers,
			body: init.body as BodyInit | undefined,
		});
		return fetch(signed.url, {
			method: signed.method,
			headers: signed.headers,
			body: init.body as BodyInit | undefined,
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
	};

	/** Creates the bucket on first use when it does not exist (development, self-hosting). */
	const ensureBucket = () => {
		bucketReady ??= (async () => {
			const head = await send(bucketUrl, { method: "HEAD" });
			if (head.ok) return;
			if (head.status !== 404) throw new StorageError(`Bucket check failed (${head.status})`);
			const created = await send(bucketUrl, { method: "PUT" });
			if (!created.ok && created.status !== 409) {
				throw new StorageError(`Bucket creation failed (${created.status})`);
			}
		})().catch((error) => {
			bucketReady = undefined;
			throw error;
		});
		return bucketReady;
	};

	return {
		async put(key, body, contentType) {
			await ensureBucket();
			const response = await send(objectUrl(key), {
				method: "PUT",
				body,
				headers: { "content-type": contentType },
			});
			if (!response.ok) throw new StorageError(`Upload failed (${response.status})`);
		},
		async get(key) {
			const response = await send(objectUrl(key));
			if (response.status === 404) return null;
			if (!response.ok) throw new StorageError(`Download failed (${response.status})`);
			return {
				body: new Uint8Array(await response.arrayBuffer()),
				contentType: response.headers.get("content-type"),
			};
		},
		async delete(key) {
			const response = await send(objectUrl(key), { method: "DELETE" });
			if (!response.ok && response.status !== 404) {
				throw new StorageError(`Delete failed (${response.status})`);
			}
		},
	};
}

/** In-memory driver for tests. */
export function memoryDriver(): StorageDriver & { objects: Map<string, Uint8Array> } {
	const objects = new Map<string, Uint8Array>();
	const types = new Map<string, string>();
	return {
		objects,
		async put(key, body, contentType) {
			objects.set(key, new Uint8Array(body));
			types.set(key, contentType);
		},
		async get(key) {
			const body = objects.get(key);
			return body ? { body, contentType: types.get(key) ?? null } : null;
		},
		async delete(key) {
			objects.delete(key);
			types.delete(key);
		},
	};
}

const globalForStorage = globalThis as typeof globalThis & { apercuraStorage?: StorageDriver };

export function storageConfigured(): boolean {
	return Boolean(
		serverEnv.S3_ENDPOINT &&
			serverEnv.S3_BUCKET &&
			serverEnv.S3_ACCESS_KEY_ID &&
			serverEnv.S3_SECRET_ACCESS_KEY,
	);
}

/** The configured driver. Throws when S3 is not configured. */
export function getStorage(): StorageDriver {
	if (globalForStorage.apercuraStorage) return globalForStorage.apercuraStorage;
	if (!storageConfigured()) throw new StorageError("S3 storage is not configured");
	globalForStorage.apercuraStorage = s3Driver({
		endpoint: serverEnv.S3_ENDPOINT as string,
		bucket: serverEnv.S3_BUCKET as string,
		accessKeyId: serverEnv.S3_ACCESS_KEY_ID as string,
		secretAccessKey: serverEnv.S3_SECRET_ACCESS_KEY as string,
		region: serverEnv.S3_REGION,
	});
	return globalForStorage.apercuraStorage;
}

/** For tests: use another driver. */
export function setStorage(driver: StorageDriver | undefined) {
	globalForStorage.apercuraStorage = driver;
}

/** Public URL of a photo key (`photos/{random}.webp`). */
export function photoUrl(key: string): string {
	const file = key.replace(/^photos\//, "");
	const base = serverEnv.S3_PUBLIC_URL?.replace(/\/+$/, "");
	return base ? `${base}/${key}` : `/media/photos/${encodeURIComponent(file)}`;
}
