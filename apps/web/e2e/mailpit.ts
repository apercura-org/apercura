import type { APIRequestContext } from "@playwright/test";

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

interface MailpitSummary {
	ID: string;
	Subject: string;
}

/** Waits for the latest email sent to `to` and returns its plain-text body (Mailpit API). */
export async function latestEmailText(request: APIRequestContext, to: string, timeoutMs = 20_000) {
	return (await waitForEmail(request, to, /./, timeoutMs)).text;
}

/**
 * Waits for the latest email to `to` whose subject matches `subject` and returns its subject and
 * plain-text body (Mailpit API).
 */
export async function waitForEmail(
	request: APIRequestContext,
	to: string,
	subject: RegExp,
	timeoutMs = 20_000,
): Promise<{ subject: string; text: string }> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const search = await request.get(`${MAILPIT_URL}/api/v1/search`, {
			params: { query: `to:"${to}"`, limit: 20 },
		});
		if (search.ok()) {
			const { messages } = (await search.json()) as { messages: MailpitSummary[] };
			const found = messages.find((message) => subject.test(message.Subject));
			if (found) {
				const message = await request.get(`${MAILPIT_URL}/api/v1/message/${found.ID}`);
				const { Text, Subject } = (await message.json()) as { Text: string; Subject: string };
				return { subject: Subject, text: Text };
			}
		}
		await new Promise((resolve) => setTimeout(resolve, 400));
	}
	throw new Error(`No email matching ${subject} for ${to} in Mailpit (${MAILPIT_URL})`);
}
