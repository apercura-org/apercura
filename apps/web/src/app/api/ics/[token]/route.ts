/**
 * The practice's private calendar feed, `GET /api/ics/{token}.ics`, for Google Calendar, Apple
 * Calendar or Thunderbird. The token is the only credential (256 bits, only its SHA-256 is
 * stored); the owner rotates or revokes it in the booking settings. Never cached, never indexed.
 */
import { randomUUID } from "node:crypto";
import { readFeed } from "~/server/booking/ics-feed";
import { getDb } from "~/server/db";
import { consumeRateLimit } from "~/server/rate-limit";

const PRIVATE_HEADERS = {
	"Cache-Control": "private, no-store",
	"Referrer-Policy": "no-referrer",
	"X-Robots-Tag": "noindex, nofollow",
};

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ token: string }> },
): Promise<Response> {
	const { token } = await params;
	const db = getDb();
	const result = await readFeed(db, token, {
		nowMs: Date.now(),
		rateLimit: (key, rule) => consumeRateLimit(db, key, rule),
		requestId: randomUUID(),
	});
	if (result.status !== 200) {
		return new Response(null, { status: result.status, headers: PRIVATE_HEADERS });
	}
	return new Response(result.body, {
		status: 200,
		headers: {
			...PRIVATE_HEADERS,
			"Content-Type": "text/calendar; charset=utf-8",
			"Content-Disposition": 'inline; filename="agenda.ics"',
		},
	});
}
