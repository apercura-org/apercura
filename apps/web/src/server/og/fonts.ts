import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The Open Graph images' faces: static Archivo cuts, read from the installed package (the
 * variable fonts are WOFF2 only, which the image renderer cannot read). Never fetched over
 * the network. `latin-ext` covers the names the `latin` subset lacks (œ, ł, ő…).
 */
type Weight = 500 | 600;
type Subset = "latin" | "latin-ext";

async function face(subset: Subset, weight: Weight) {
	return readFile(
		join(
			process.cwd(),
			`node_modules/@fontsource/archivo/files/archivo-${subset}-${weight}-normal.woff`,
		),
	);
}

export type OgFont = { name: string; data: Buffer; weight: Weight; style: "normal" };

export async function ogFonts(subsets: readonly Subset[] = ["latin"]): Promise<OgFont[]> {
	const pairs = subsets.flatMap((subset) =>
		([500, 600] as const).map((weight) => ({ subset, weight })),
	);
	const data = await Promise.all(pairs.map(({ subset, weight }) => face(subset, weight)));
	return pairs.map(({ weight }, index) => ({
		name: "Archivo",
		data: data[index] as Buffer,
		weight,
		style: "normal",
	}));
}
