/**
 * Drains `directory.invalidation_outbox` after the import commits: signed POSTs
 * to the web app's `/api/revalidate`, at most 100 tags per request, retried.
 * When the app is unreachable the rows stay for the next run (or the next
 * drain). Above 20,000 tags, coarse tags (`practitioner:*`…) replace them.
 */
import {
	REVALIDATE_MAX_TAGS,
	REVALIDATE_SIGNATURE_HEADER,
	REVALIDATE_TIMESTAMP_HEADER,
	signRevalidation,
} from "@apercura/core/revalidation";
import type { Sql } from "./lib/db";
import { sleep } from "./lib/files";

export const COARSE_TAG_THRESHOLD = 20_000;

/** `practitioner:12` -> `practitioner:*`, `listing:cardiologue:75` -> `listing:*`. */
export function coarseTag(tag: string): string {
	const prefix = tag.split(":")[0] ?? tag;
	return `${prefix}:*`;
}

export type DrainResult = {
	pending: number;
	sent: number;
	coarse: boolean;
	status: "done" | "skipped" | "unreachable" | "partial";
	error?: string;
};

export async function sendTags(
	appUrl: string,
	secret: string,
	tags: string[],
	attempts = 3,
): Promise<void> {
	const body = JSON.stringify({ tags });
	let lastError: unknown;
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			const timestamp = Math.floor(Date.now() / 1000);
			const response = await fetch(new URL("/api/revalidate", appUrl), {
				method: "POST",
				body,
				headers: {
					"content-type": "application/json",
					[REVALIDATE_TIMESTAMP_HEADER]: String(timestamp),
					[REVALIDATE_SIGNATURE_HEADER]: signRevalidation(secret, timestamp, body),
				},
				signal: AbortSignal.timeout(15_000),
			});
			if (response.ok) return;
			lastError = new Error(`revalidate answered ${response.status}`);
			if (response.status >= 400 && response.status < 500 && response.status !== 429) break;
		} catch (error) {
			lastError = error;
		}
		if (attempt < attempts) await sleep(1_000 * 2 ** (attempt - 1));
	}
	throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Asks the cache warm-up to start its walk over: the import may only set this column of its
 * row. Never fails the import: a database without the table (an older schema) just warms up
 * on its own schedule.
 */
export async function requestWarmRestart(sql: Sql, log?: (message: string) => void): Promise<void> {
	try {
		await sql`UPDATE directory.cache_warmup SET restart_requested_at = now() WHERE id = 1`;
	} catch (error) {
		log?.(`Cache warm-up restart not requested: ${String(error)}`);
	}
}

export async function drainOutbox(
	sql: Sql,
	options: { appUrl: string | null; secret: string | null; log?: (message: string) => void },
): Promise<DrainResult> {
	const [{ pending } = { pending: 0 }] = await sql<{ pending: number }[]>`
		SELECT count(*)::integer AS pending FROM directory.invalidation_outbox
	`;
	if (pending === 0) return { pending, sent: 0, coarse: false, status: "done" };
	if (!options.appUrl || !options.secret) {
		options.log?.(`${pending} cache tags left in the outbox (APP_URL or REVALIDATE_SECRET unset)`);
		return { pending, sent: 0, coarse: false, status: "skipped" };
	}

	if (pending > COARSE_TAG_THRESHOLD) {
		const rows = await sql<{ tag: string }[]>`
			SELECT DISTINCT split_part(tag, ':', 1) || ':*' AS tag FROM directory.invalidation_outbox
		`;
		const tags = rows.map((row) => row.tag);
		try {
			for (let start = 0; start < tags.length; start += REVALIDATE_MAX_TAGS) {
				await sendTags(
					options.appUrl,
					options.secret,
					tags.slice(start, start + REVALIDATE_MAX_TAGS),
				);
			}
		} catch (error) {
			return { pending, sent: 0, coarse: true, status: "unreachable", error: String(error) };
		}
		await sql`DELETE FROM directory.invalidation_outbox`;
		await requestWarmRestart(sql, options.log);
		return { pending, sent: pending, coarse: true, status: "done" };
	}

	let sent = 0;
	let lastId = 0;
	while (true) {
		const batch = await sql<{ id: number; tag: string }[]>`
			SELECT id, tag FROM directory.invalidation_outbox
			WHERE id > ${lastId}
			ORDER BY id
			LIMIT ${REVALIDATE_MAX_TAGS}
		`;
		if (batch.length === 0) break;
		lastId = batch[batch.length - 1]?.id ?? lastId;
		const ids = batch.map((row) => row.id);
		try {
			await sendTags(
				options.appUrl,
				options.secret,
				batch.map((row) => row.tag),
			);
		} catch (error) {
			if (sent > 0) await requestWarmRestart(sql, options.log);
			await sql`
				UPDATE directory.invalidation_outbox
				SET attempts = attempts + 1, last_error = ${String(error).slice(0, 500)}
				WHERE id = ANY (${ids}::bigint[])
			`;
			return {
				pending,
				sent,
				coarse: false,
				status: sent === 0 ? "unreachable" : "partial",
				error: String(error),
			};
		}
		await sql`DELETE FROM directory.invalidation_outbox WHERE id = ANY (${ids}::bigint[])`;
		sent += batch.length;
	}
	await requestWarmRestart(sql, options.log);
	return { pending, sent, coarse: false, status: "done" };
}
