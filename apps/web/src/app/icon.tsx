import { sealIcon } from "~/lib/seal-icon";

/*
 * The site icon: 48 px (the favicon of search results, a multiple of 48),
 * 192 px and 512 px (web app manifest, Organization logo). Prerendered.
 */
export const contentType = "image/png";

const SIZES = [48, 192, 512];

export function generateImageMetadata() {
	return SIZES.map((size) => ({
		id: String(size),
		size: { width: size, height: size },
		contentType,
	}));
}

export default async function Icon({ id }: { id: Promise<string> }) {
	const size = Number(await id);
	return sealIcon(SIZES.includes(size) ? size : 48);
}
