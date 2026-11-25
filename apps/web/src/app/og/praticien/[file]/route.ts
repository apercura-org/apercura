import { parsePractitionerSegment } from "@apercura/core";
import { PUBLIC_PAGE_CACHE_CONTROL } from "~/lib/public-cache";
import { hasDatabaseUrl } from "~/server/db";
import { practitionerOgImage } from "~/server/og/practitioner-image";

/**
 * The Open Graph image of a practitioner page: `/og/praticien/{slug}.png`, the page's own
 * slug (only its RPPS number counts, so a renamed page keeps its image). 404 for a malformed
 * number (no database access), an unknown page, or one withheld by a removal request. The PNG
 * is cached with the page's tags (~/server/og/practitioner-image); shared caches keep it as
 * briefly as the page itself.
 */
export async function GET(_request: Request, { params }: RouteContext<"/og/praticien/[file]">) {
	const { file } = await params;
	const segment = file.endsWith(".png") ? parsePractitionerSegment(file.slice(0, -4)) : null;
	if (!segment || !hasDatabaseUrl()) return new Response("Not found", { status: 404 });
	const png = await practitionerOgImage(segment.rpps);
	if (!png) return new Response("Not found", { status: 404 });
	return new Response(new Uint8Array(png), {
		headers: {
			"content-type": "image/png",
			"content-length": String(png.byteLength),
			"cache-control": PUBLIC_PAGE_CACHE_CONTROL,
			"x-content-type-options": "nosniff",
		},
	});
}
