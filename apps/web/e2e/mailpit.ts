import type { APIRequestContext } from "@playwright/test";

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

interface MailpitSummary {
	ID: string;
}

/** Waits for the latest email sent to `to` and returns its plain-text body (Mailpit API). */
export async function latestEmailText(request: APIRequestContext, to: string, timeoutMs = 20_000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const search = await request.get(`${MAILPIT_URL}/api/v1/search`, {
			params: { query: `to:"${to}"`, limit: 1 },
		});
		if (search.ok()) {
			const { messages } = (await search.json()) as { messages: MailpitSummary[] };
			const first = messages[0];
			if (first) {
				const message = await request.get(`${MAILPIT_URL}/api/v1/message/${first.ID}`);
				const { Text } = (await message.json()) as { Text: string };
				return Text;
			}
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error(`No email for ${to} in Mailpit (${MAILPIT_URL})`);
}
