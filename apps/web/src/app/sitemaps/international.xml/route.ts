import { connection } from "next/server";
import { siteOrigin } from "~/lib/site-url";
import { urlSetXml, xmlResponse } from "~/lib/sitemap-xml";

/**
 * The pages outside every market: the international home. Rendered at request time so APP_URL
 * is the runtime one.
 */
export async function GET() {
	await connection();
	return xmlResponse(urlSetXml([{ loc: `${siteOrigin()}/` }]));
}
