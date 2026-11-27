import { austria } from "./at";
import { switzerland } from "./ch";
import { czechia } from "./cz";
import { germany } from "./de";
import { estonia } from "./ee";
import { spain } from "./es";
import { france } from "./fr";
import { unitedKingdom } from "./gb";
import { ireland } from "./ie";
import { italy } from "./it";
import { norway } from "./no";
import { poland } from "./pl";
import type { CountryAdapter, CountryCode } from "./types";

export { AT_STATES, austria, VIENNA_CODE } from "./at";
export {
	CH_ATTRIBUTION_DATE,
	CH_CANTONS,
	CH_HOSPITAL_FIGURES_YEAR,
	CH_LIST_CANTONS,
	chCantonOfNumber,
	switzerland,
} from "./ch";
export { CZ_REGIONS, czechia, PRAGUE_CODE, PRAGUE_DISTRICT_CODE } from "./cz";
export { DE_PHARMACY_STATES, DE_SCHEME_IDS, DE_STATES, DESTATIS_YEAR, germany } from "./de";
export { EE_COUNTIES, EE_PLACES_DATE, EE_SCHEME_IDS, estonia } from "./ee";
export { ES_COMMUNITIES, ES_PROVINCE_COMMUNITIES, spain } from "./es";
export { france } from "./fr";
export { GB_NATIONS, GB_REGIONS, gbNationOf, unitedKingdom } from "./gb";
export {
	IE_CENSUS_YEAR,
	IE_COUNTIES,
	IE_HSE_ATLAS_DATE,
	IE_PROVINCES,
	ieCountyOfName,
	ireland,
} from "./ie";
export {
	ISTAT_BOUNDARIES_YEAR,
	IT_HOSPITAL_BEDS_YEAR,
	IT_REGIONS,
	italy,
	itRegionOfMinistryCode,
} from "./it";
export { NO_COUNTIES, NO_SCHEME_IDS, norway, OSLO_MUNICIPALITY } from "./no";
export {
	PL_OBTAINED_AT,
	PL_PRODUCED_AT,
	PL_TERC_AS_OF,
	PL_VOIVODESHIPS,
	poland,
	WARSAW_CODE,
} from "./pl";
export * from "./types";

/**
 * Adapters of the markets the code supports: France, Austria, the United Kingdom, Czechia, Spain,
 * Italy, Germany, Switzerland, Poland and Ireland.
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
	EE: estonia,
	PL: poland,
	NO: norway,
	IE: ireland,
};

/** The adapter of a market, or an error naming a country the code does not support yet. */
export function countryAdapter(code: string): CountryAdapter {
	const adapter = COUNTRY_ADAPTERS[code as CountryCode];
	if (!adapter) throw new RangeError(`No country adapter for "${code}"`);
	return adapter;
}

/** The adapter whose pages live under a path segment (`fr`, `at`, `gb`, `cz`, `es`, `it`, `de`, `ch`, `pl`, `ee`, `no`, `ie`), or undefined. */
export function adapterOfSegment(segment: string): CountryAdapter | undefined {
	return Object.values(COUNTRY_ADAPTERS).find((adapter) => adapter?.segment === segment);
}
