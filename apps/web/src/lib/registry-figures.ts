import { FR_DEFAULT_PROFESSIONS, FR_PROFESSIONS } from "@apercura/core/taxonomy";

/**
 * The register figures printed on the home page: for each enabled profession, the
 * practitioners with a public, indexable page; and how many of all of them have a street
 * address for their practice. Shaped here from the rows of `getRegistryFigures`, so the
 * rules are unit-tested without a database.
 */

/** The home page's label of each profession it can count, in its order. */
export const FIGURE_PROFESSIONS = {
	"10": "doctors",
	"40": "dentists",
	"50": "midwives",
	"60": "nurses",
} as const satisfies Record<string, string>;

export type FigureProfessionKey = (typeof FIGURE_PROFESSIONS)[keyof typeof FIGURE_PROFESSIONS];

export type FigureRow = { professionCode: string; practitioners: number; withAddress: number };

export type RegistryFigures = {
	professions: { key: FigureProfessionKey; count: number }[];
	/** Every counted practitioner with a street address for a practice. */
	withAddress: number;
	/** Date (YYYY-MM-DD) of the last successful import. */
	importedAt: string;
};

/** The professions the home page counts: enabled and labelled, in the default import order. */
export function countedProfessions(): (keyof typeof FIGURE_PROFESSIONS)[] {
	const order: readonly string[] = FR_DEFAULT_PROFESSIONS;
	return (Object.keys(FIGURE_PROFESSIONS) as (keyof typeof FIGURE_PROFESSIONS)[])
		.filter((code) => FR_PROFESSIONS[code]?.enabled)
		.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/**
 * The figures, or null when there is nothing honest to print: no import yet, or no
 * practitioner counted (an empty database). A profession without anyone counted prints 0.
 */
export function shapeRegistryFigures(
	rows: readonly FigureRow[],
	importedAt: string | null,
): RegistryFigures | null {
	if (!importedAt) return null;
	const byCode = new Map(rows.map((row) => [row.professionCode, row]));
	const codes = countedProfessions();
	const professions = codes.map((code) => ({
		key: FIGURE_PROFESSIONS[code],
		count: Number(byCode.get(code)?.practitioners ?? 0),
	}));
	if (professions.every((profession) => profession.count === 0)) return null;
	const withAddress = codes.reduce(
		(sum, code) => sum + Number(byCode.get(code)?.withAddress ?? 0),
		0,
	);
	return { professions, withAddress, importedAt };
}
