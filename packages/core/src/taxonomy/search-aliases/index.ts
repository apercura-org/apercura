import { AT_SEARCH_ALIASES } from "./at";
import { CH_SEARCH_ALIASES } from "./ch";
import { CZ_SEARCH_ALIASES } from "./cz";
import { DE_SEARCH_ALIASES } from "./de";
import { EE_SEARCH_ALIASES } from "./ee";
import { ES_SEARCH_ALIASES } from "./es";
import { FR_SEARCH_ALIASES } from "./fr";
import { GB_SEARCH_ALIASES } from "./gb";
import { IT_SEARCH_ALIASES } from "./it";
import { NO_SEARCH_ALIASES } from "./no";
import { PL_SEARCH_ALIASES } from "./pl";
import type { SearchAliasTable } from "./types";

export * from "./types";
export {
	AT_SEARCH_ALIASES,
	CH_SEARCH_ALIASES,
	CZ_SEARCH_ALIASES,
	DE_SEARCH_ALIASES,
	EE_SEARCH_ALIASES,
	ES_SEARCH_ALIASES,
	FR_SEARCH_ALIASES,
	GB_SEARCH_ALIASES,
	IT_SEARCH_ALIASES,
	NO_SEARCH_ALIASES,
	PL_SEARCH_ALIASES,
};

/** The search aliases of each open market. */
export const SEARCH_ALIASES: Readonly<
	Record<
		"FR" | "AT" | "GB" | "CZ" | "ES" | "IT" | "DE" | "CH" | "EE" | "PL" | "NO",
		SearchAliasTable
	>
> = {
	FR: FR_SEARCH_ALIASES,
	AT: AT_SEARCH_ALIASES,
	GB: GB_SEARCH_ALIASES,
	CZ: CZ_SEARCH_ALIASES,
	ES: ES_SEARCH_ALIASES,
	IT: IT_SEARCH_ALIASES,
	DE: DE_SEARCH_ALIASES,
	CH: CH_SEARCH_ALIASES,
	EE: EE_SEARCH_ALIASES,
	PL: PL_SEARCH_ALIASES,
	NO: NO_SEARCH_ALIASES,
};
