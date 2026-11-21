import { connection } from "next/server";
import { getStorage, storageConfigured } from "~/server/storage";

const FILE = /^[0-9a-f-]{36}\.webp$/;

/**
 * Serves practitioner photos from object storage when no S3_PUBLIC_URL is
 * set. Keys are random and never reused, so responses are immutable.
 */
export async function GET(_request: Request, context: RouteContext<"/media/photos/[file]">) {
	// Per-request: never prerendered at build time.
	await connection();
	const { file } = await context.params;
	if (!FILE.test(file) || !storageConfigured()) return new Response(null, { status: 404 });
	const object = await getStorage().get(`photos/${file}`);
	if (!object) return new Response(null, { status: 404 });
	return new Response(new Uint8Array(object.body), {
		headers: {
			"content-type": "image/webp",
			"cache-control": "public, max-age=31536000, immutable",
			"x-content-type-options": "nosniff",
		},
	});
}
