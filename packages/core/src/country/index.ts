import { austria } from "./at";
import { czechia } from "./cz";
import { france } from "./fr";
import { unitedKingdom } from "./gb";
import type { CountryAdapter, CountryCode } from "./types";

export { AT_STATES, austria, VIENNA_CODE } from "./at";
export { CZ_REGIONS, czechia, PRAGUE_CODE, PRAGUE_DISTRICT_CODE } from "./cz";
export { france } from "./fr";
export { GB_NATIONS, GB_REGIONS, gbNationOf, unitedKingdom } from "./gb";
export * from "./types";

/** Adapters of the markets the code supports: France, Austria, the United Kingdom and Czechia. */
export const COUNTRY_ADAPTERS: Readonly<Partial<Record<CountryCode, CountryAdapter>>> = {
	FR: france,
	AT: austria,
	GB: unitedKingdom,
	CZ: czechia,
};

/** The adapter of a market, or an error naming a country the code does not support yet. */
export function countryAdapter(code: string): CountryAdapter {
	const adapter = COUNTRY_ADAPTERS[code as CountryCode];
	if (!adapter) throw new RangeError(`No country adapter for "${code}"`);
	return adapter;
}

/** The adapter whose pages live under a path segment (`fr`, `at`, `gb`, `cz`), or undefined. */
export function adapterOfSegment(segment: string): CountryAdapter | undefined {
	return Object.values(COUNTRY_ADAPTERS).find((adapter) => adapter?.segment === segment);
}
