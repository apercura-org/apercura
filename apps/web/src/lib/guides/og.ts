import { siteOrigin } from "~/lib/site-url";

/** The Open Graph image of a guide (`app/og/guides/[file]`), prerendered at build time. */
export const guideOgImageUrl = (slug: string) =>
	`${siteOrigin()}/og/guides/${encodeURIComponent(slug)}.png`;
