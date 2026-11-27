/**
 * Downloading from data.gov.lt and its store (get.data.gov.lt), which answer `429 Too Many
 * Requests` to a client that asks too often. The import asks politely: one request at a time,
 * at least `intervalMs` between the start of two requests (20 s by default,
 * `ETL_LT_REQUEST_INTERVAL_MS`), and on a 429 or a server error it waits as long as the
 * `Retry-After` header says, and never less than an interval doubling at each attempt, then
 * tries again, up to `attempts` times. Any other answer (a 404) fails at once. Nothing is done
 * to get around the limit: one plain User-Agent, one address, one connection.
 */
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { inspectLocalFile, type SourceFile, sleep, USER_AGENT } from "../../lib/files";

/** The longest wait between two attempts (10 minutes), whatever `Retry-After` asks. */
const MAX_WAIT_MS = 10 * 60_000;
/** Time to receive the response headers of a request. */
const HEADERS_TIMEOUT_MS = 120_000;

export type PoliteOptions = {
	intervalMs: number;
	attempts: number;
	log?: (message: string) => void;
	/** For tests. */
	fetch?: typeof fetch;
	sleep?: (ms: number) => Promise<unknown>;
	now?: () => number;
};

/** True for the answers worth retrying: too many requests, and server errors. */
export const retryable = (status: number) => status === 429 || status >= 500;

/** How long a `Retry-After` header asks to wait (seconds or an HTTP date), or null. */
export function retryAfterMs(value: string | null, now: number = Date.now()): number | null {
	if (!value) return null;
	const trimmed = value.trim();
	if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
	const date = Date.parse(trimmed);
	return Number.isNaN(date) ? null : Math.max(0, date - now);
}

export class PoliteClient {
	private last = Number.NEGATIVE_INFINITY;
	private readonly fetchFn: typeof fetch;
	private readonly wait: (ms: number) => Promise<unknown>;
	private readonly now: () => number;
	/** Requests sent (attempts included), for the run's stats. */
	requests = 0;

	constructor(private readonly options: PoliteOptions) {
		this.fetchFn = options.fetch ?? fetch;
		this.wait = options.sleep ?? sleep;
		this.now = options.now ?? Date.now;
	}

	/** One answer, after the pause the previous request asks for; retried as above. */
	private async request(url: string): Promise<Response> {
		let backoff = this.options.intervalMs;
		for (let attempt = 1; ; attempt++) {
			const since = this.now() - this.last;
			if (since < this.options.intervalMs) await this.wait(this.options.intervalMs - since);
			this.last = this.now();
			this.requests++;
			let response: Response | null = null;
			let failure: unknown = null;
			try {
				response = await this.fetchFn(url, {
					headers: { "user-agent": USER_AGENT, "accept-encoding": "gzip" },
					redirect: "follow",
					signal: AbortSignal.timeout(HEADERS_TIMEOUT_MS),
				});
			} catch (error) {
				failure = error;
			}
			if (response?.ok) return response;
			if (response && !retryable(response.status)) {
				await response.body?.cancel();
				throw new Error(`GET ${url} answered ${response.status}`);
			}
			const asked = response ? retryAfterMs(response.headers.get("retry-after"), this.now()) : null;
			await response?.body?.cancel();
			if (attempt >= this.options.attempts) {
				throw new Error(
					`GET ${url} ${response ? `answered ${response.status}` : "failed"} after ${attempt} attempts`,
					{ cause: failure ?? undefined },
				);
			}
			const pause = Math.min(MAX_WAIT_MS, Math.max(asked ?? 0, backoff));
			this.options.log?.(
				`${url}: ${response ? response.status : "no answer"}, waiting ${Math.round(pause / 1000)} s (attempt ${attempt} of ${this.options.attempts})`,
			);
			await this.wait(pause);
			// The pause is the gap: the next attempt goes at once.
			this.last = Number.NEGATIVE_INFINITY;
			backoff *= 2;
		}
	}

	/** Downloads `url` to `path` (streamed), then hashes it. */
	async download(key: string, url: string, path: string): Promise<SourceFile> {
		const response = await this.request(url);
		if (!response.body) throw new Error(`GET ${url}: empty body`);
		await mkdir(dirname(path), { recursive: true });
		await pipeline(
			Readable.fromWeb(response.body as WebReadableStream<Uint8Array>),
			createWriteStream(path),
		);
		const file = await inspectLocalFile(key, path, true);
		return {
			...file,
			url,
			resolvedUrl: response.url || url,
			lastModified: response.headers.get("last-modified"),
		};
	}

	/** The text of a page (the dataset page whose licence is checked). */
	async text(url: string): Promise<string> {
		const response = await this.request(url);
		return response.text();
	}
}

/** The dataset page of VASPVT's licence register on data.gov.lt. */
export const LT_DATASET_PAGE = "https://data.gov.lt/datasets/1623/";

/** The licence the dataset page must still name. */
export const LT_LICENCE = "Creative Commons Attribution 4.0";

/**
 * Throws unless the dataset page names the CC BY 4.0 in its licence field ("Licencija Creative
 * Commons Attribution 4.0"), so a changed licence never goes unnoticed.
 */
export function checkLicencePage(html: string): void {
	const text = html
		.replace(/<script\b[\s\S]*?<\/script[^>]*>|<style\b[\s\S]*?<\/style[^>]*>/gi, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;|\s+/g, " ");
	const field = /Licencija\s+([^|]{0,80}?)\s+(?:Katalogas|Laikotarpis|$)/u.exec(text);
	const licence = (field?.[1] ?? "").trim();
	if (!licence.startsWith(LT_LICENCE)) {
		throw new Error(
			`the dataset page names the licence "${licence || "(none)"}", not ${LT_LICENCE}`,
		);
	}
}

/**
 * The store's CSV of a model: with `columns`, only those (`?select(…)`, plain columns only); without, every
 * column (the Address Register's small text tables, whose references the store writes `<ref>._id`
 * only in a full download).
 */
export function storeCsvUrl(base: string, path: string, columns?: readonly string[]): string {
	const url = `${base.replace(/\/$/, "")}/${path}/:format/csv`;
	return columns ? `${url}?select(${columns.join(",")})` : url;
}
