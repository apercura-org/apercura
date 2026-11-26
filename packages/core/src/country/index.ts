import { austria } from "./at";
import { switzerland } from "./ch";
import { czechia } from "./cz";
import { germany } from "./de";
import { spain } from "./es";
import { france } from "./fr";
import { unitedKingdom } from "./gb";
import { italy } from "./it";
import type { CountryAdapter, CountryCode } from "./types";

export { AT_STATES, austria, VIENNA_CODE } from "./at";
export {
	CH_ATTRIBUTION_DATE,
	CH_CANTONS,
	CH_HOSPITAL_FIGURES_YEAR,
	chCantonOfNumber,
	switzerland,
} from "./ch";
export { CZ_REGIONS, czechia, PRAGUE_CODE, PRAGUE_DISTRICT_CODE } from "./cz";
export { DE_PHARMACY_STATES, DE_SCHEME_IDS, DE_STATES, DESTATIS_YEAR, germany } from "./de";
export { ES_COMMUNITIES, ES_PROVINCE_COMMUNITIES, spain } from "./es";
export { france } from "./fr";
export { GB_NATIONS, GB_REGIONS, gbNationOf, unitedKingdom } from "./gb";
export {
	ISTAT_BOUNDARIES_YEAR,
	IT_HOSPITAL_BEDS_YEAR,
	IT_REGIONS,
	italy,
	itRegionOfMinistryCode,
} from "./it";
export * from "./types";

/**
 * Adapters of the markets the code supports: France, Austria, the United Kingdom, Czechia, Spain,
 * Italy, Germany and Switzerland.
 */
export const COUNTRY_ADAPTERS: Readonly<Partial<Record<CountryCode, CountryAdapter>>> = {
	FR: france,
	AT: austria,
	GB: unitedKingdom,
	CZ: czechia,
	ES: spain,
	IT: italy,
	DE: germany,
	CH: switzerland,
};

/** The adapter of a market, or an error naming a country the code does not support yet. */
export function countryAdapter(code: string): CountryAdapter {
	const adapter = COUNTRY_ADAPTERS[code as CountryCode];
	if (!adapter) throw new RangeError(`No country adapter for "${code}"`);
	return adapter;
}

/** The adapter whose pages live under a path segment (`fr`, `at`, `gb`, `cz`, `es`, `it`, `de`, `ch`), or undefined. */
export function adapterOfSegment(segment: string): CountryAdapter | undefined {
	return Object.values(COUNTRY_ADAPTERS).find((adapter) => adapter?.segment === segment);
}
