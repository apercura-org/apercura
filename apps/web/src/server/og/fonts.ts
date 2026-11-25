import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { OG_FONT_WEIGHTS, type OgFontSubset, type OgFontWeight, ogFontFile } from "./font-files";

/**
 * The Open Graph images' faces: static Archivo cuts, read from the installed package (the
 * variable fonts are WOFF2 only, which the image renderer cannot read). Never fetched over
 * the network. `latin-ext` covers the names the `latin` subset lacks (œ, ł, ő…). The files
 * are listed in ./font-files, which the standalone build's tracing includes.
 */
async function face(subset: OgFontSubset, weight: OgFontWeight) {
	return readFile(join(process.cwd(), ogFontFile(subset, weight)));
}

export type OgFont = { name: string; data: Buffer; weight: OgFontWeight; style: "normal" };

export async function ogFonts(subsets: readonly OgFontSubset[] = ["latin"]): Promise<OgFont[]> {
	const pairs = subsets.flatMap((subset) => OG_FONT_WEIGHTS.map((weight) => ({ subset, weight })));
	const data = await Promise.all(pairs.map(({ subset, weight }) => face(subset, weight)));
	return pairs.map(({ weight }, index) => ({
		name: "Archivo",
		data: data[index] as Buffer,
		weight,
		style: "normal",
	}));
}
