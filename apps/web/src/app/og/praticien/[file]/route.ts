import { parseAnyPractitionerKey } from "~/lib/practitioner-key";
import { PUBLIC_PAGE_CACHE_CONTROL } from "~/lib/public-cache";
import { hasDatabaseUrl } from "~/server/db";
import { practitionerOgImage } from "~/server/og/practitioner-image";

/**
 * The Open Graph image of a practitioner page: `/og/praticien/{slug}.png`, the page's own
 * slug, marked `gb.` for a UK page (only its identifier counts, an RPPS number, an Austrian list
 * key or a UK practice key, so a renamed page
 * keeps its image). 404 for a malformed identifier (no database access), an unknown page, or one withheld by a removal request. The PNG
 * is cached with the page's tags (~/server/og/practitioner-image); shared caches keep it as
 * briefly as the page itself.
 */
export async function GET(_request: Request, { params }: RouteContext<"/og/praticien/[file]">) {
	const { file } = await params;
	const segment = file.endsWith(".png") ? parseAnyPractitionerKey(file.slice(0, -4)) : null;
	if (!segment || !hasDatabaseUrl()) return new Response("Not found", { status: 404 });
	const { country, idScheme, nationalId } = segment;
	const png = await practitionerOgImage({ country, idScheme, nationalId });
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
