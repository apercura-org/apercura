import { connection } from "next/server";
import { Suspense } from "react";

async function Marker() {
	await connection();
	return null;
}

/**
 * Renders nothing, at request time. A practitioner-space page whose content is
 * all static still answers per request with it, so the page carries the
 * request's Content-Security-Policy nonce on its scripts like every other page
 * of the space (see ~/lib/security-headers).
 */
export function PerRequest() {
	return (
		<Suspense fallback={null}>
			<Marker />
		</Suspense>
	);
}
