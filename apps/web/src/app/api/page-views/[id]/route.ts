import { after } from "next/server";
import { getDb } from "~/server/db";
import { recordPageView, shouldCountView } from "~/server/stats/page-views";

const ID = /^[1-9]\d{0,9}$/;

/**
 * The page-view beacon of a claimed practitioner page (~/components/page-view-beacon.tsx). It
 * only ever increments a daily counter, after the response: the answer is the same empty 204
 * whether the view counted or not, so it tells nothing about the page or the limits. No cookie
 * is read or set, nothing about the request is stored.
 */
export async function POST(request: Request, context: RouteContext<"/api/page-views/[id]">) {
	const { id } = await context.params;
	const practitionerId = ID.test(id) ? Number(id) : null;
	if (
		practitionerId !== null &&
		practitionerId <= 2_147_483_647 &&
		shouldCountView(request.headers, practitionerId)
	) {
		after(async () => {
			try {
				await recordPageView(getDb(), practitionerId);
			} catch (error) {
				console.error("Page view not counted:", error instanceof Error ? error.name : "error");
			}
		});
	}
	return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
