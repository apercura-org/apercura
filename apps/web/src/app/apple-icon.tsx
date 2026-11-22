import { sealIcon } from "~/lib/seal-icon";

/** The home-screen icon of iOS: the brand seal at 180 px. Prerendered. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
	return sealIcon(180);
}
