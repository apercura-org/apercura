/**
 * The static Archivo cuts the Open Graph images are drawn with, relative to the web app's
 * root (the server's working directory, in development as in the standalone build). They are
 * read with fs at request time, which the build's file tracing cannot see: next.config.ts
 * lists these exact files in `outputFileTracingIncludes`, so the standalone output (and the
 * Docker image) ships them. Imported by next.config.ts: no dependencies.
 */
export const OG_FONT_WEIGHTS = [500, 600] as const;
export const OG_FONT_SUBSETS = ["latin", "latin-ext"] as const;

export type OgFontWeight = (typeof OG_FONT_WEIGHTS)[number];
export type OgFontSubset = (typeof OG_FONT_SUBSETS)[number];

export function ogFontFile(subset: OgFontSubset, weight: OgFontWeight): string {
	return `node_modules/@fontsource/archivo/files/archivo-${subset}-${weight}-normal.woff`;
}

export const OG_FONT_FILES: readonly string[] = OG_FONT_SUBSETS.flatMap((subset) =>
	OG_FONT_WEIGHTS.map((weight) => ogFontFile(subset, weight)),
);
