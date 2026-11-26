import { AT_SEARCH_ALIASES } from "./at";
import { CZ_SEARCH_ALIASES } from "./cz";
import { ES_SEARCH_ALIASES } from "./es";
import { FR_SEARCH_ALIASES } from "./fr";
import { GB_SEARCH_ALIASES } from "./gb";
import { IT_SEARCH_ALIASES } from "./it";
import type { SearchAliasTable } from "./types";

export * from "./types";
export {
	AT_SEARCH_ALIASES,
	CZ_SEARCH_ALIASES,
	ES_SEARCH_ALIASES,
	FR_SEARCH_ALIASES,
	GB_SEARCH_ALIASES,
	IT_SEARCH_ALIASES,
};

/** The search aliases of each open market. */
export const SEARCH_ALIASES: Readonly<
	Record<"FR" | "AT" | "GB" | "CZ" | "ES" | "IT", SearchAliasTable>
> = {
	FR: FR_SEARCH_ALIASES,
	AT: AT_SEARCH_ALIASES,
	GB: GB_SEARCH_ALIASES,
	CZ: CZ_SEARCH_ALIASES,
	ES: ES_SEARCH_ALIASES,
	IT: IT_SEARCH_ALIASES,
};
