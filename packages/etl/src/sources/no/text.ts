/**
 * Text helpers of the Norwegian sources: whitespace, and the key an address is looked up under
 * in Kartverket's address file.
 */

/** Collapses whitespace and trims. */
export const clean = (value: string | null | undefined) =>
	(value ?? "").replace(/\s+/g, " ").trim();

/**
 * The key of a street address within a municipality: lower case, spacing and punctuation
 * collapsed, a house number range read as its first number (`Tunveien 5 - 7`, `Trondheimsvegen
 * 266-268` → `tunveien 5`, `trondheimsvegen 266`), a house letter joined to its number
 * (`Lille Borgen vei 12 D` → `lille borgen vei 12d`). Both files are keyed the same way.
 */
export function streetKey(street: string): string {
	return clean(street)
		.toLowerCase()
		.replace(/[.,]/g, " ")
		.replace(/(\d+)\s*[a-zæøå]?\s*-\s*\d+\s*[a-zæøå]?\b/u, "$1")
		.replace(/(\d+)\s+([a-zæøå])\b/u, "$1$2")
		.replace(/\s+/g, " ")
		.trim();
}

/** The key of an address: its municipality number and its street key (`3209|ragnar strøms veg 10`). */
export const addressKey = (municipality: string, street: string) =>
	`${municipality}|${streetKey(street)}`;
