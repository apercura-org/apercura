import { appIconPng } from "~/lib/brand-image";

/** The home-screen icon of iOS: the app icon (the symbol on white, padded) at 180 px. Prerendered. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
	return appIconPng(180);
}
