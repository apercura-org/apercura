import {
	REVALIDATE_MAX_TAGS,
	REVALIDATE_SIGNATURE_HEADER,
	REVALIDATE_TIMESTAMP_HEADER,
	signRevalidation,
} from "@apercura/core/revalidation";

/**
 * Cache invalidation from outside the web app (the jobs CLI): signed POSTs to `/api/revalidate`,
 * the same contract as the open data import. Skipped without APP_URL or REVALIDATE_SECRET; a
 * failure is logged and never fails the job (pages then refresh at their next revalidation).
 * Returns how many tags the app accepted.
 */
export async function sendRevalidation(
	tags: readonly string[],
	env: Record<string, string | undefined> = process.env,
): Promise<number> {
	const secret = env.REVALIDATE_SECRET;
	if (!secret || !env.APP_URL || tags.length === 0) {
		return 0;
	}
	let sent = 0;
	for (let index = 0; index < tags.length; index += REVALIDATE_MAX_TAGS) {
		const chunk = tags.slice(index, index + REVALIDATE_MAX_TAGS);
		const body = JSON.stringify({ tags: chunk });
		const timestamp = Math.floor(Date.now() / 1000);
		try {
			const response = await fetch(new URL("/api/revalidate", env.APP_URL), {
				method: "POST",
				body,
				headers: {
					"content-type": "application/json",
					[REVALIDATE_TIMESTAMP_HEADER]: String(timestamp),
					[REVALIDATE_SIGNATURE_HEADER]: signRevalidation(secret, timestamp, body),
				},
				signal: AbortSignal.timeout(10_000),
			});
			if (response.ok) {
				sent += chunk.length;
			} else {
				console.error(`Revalidation answered ${response.status}`);
			}
		} catch (error) {
			console.error("Revalidation failed:", error);
		}
	}
	return sent;
}
