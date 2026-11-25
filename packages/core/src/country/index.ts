import { austria } from "./at";
import { france } from "./fr";
import type { CountryAdapter, CountryCode } from "./types";

export { AT_STATES, austria, VIENNA_CODE } from "./at";
export { france } from "./fr";
export * from "./types";

/** Adapters of the markets the code supports: France and Austria. */
export const COUNTRY_ADAPTERS: Readonly<Partial<Record<CountryCode, CountryAdapter>>> = {
	FR: france,
	AT: austria,
};

/** The adapter of a market, or an error naming a country the code does not support yet. */
export function countryAdapter(code: string): CountryAdapter {
	const adapter = COUNTRY_ADAPTERS[code as CountryCode];
	if (!adapter) throw new RangeError(`No country adapter for "${code}"`);
	return adapter;
}

/** The adapter whose pages live under a path segment (`fr`, `at`), or undefined. */
export function adapterOfSegment(segment: string): CountryAdapter | undefined {
	return Object.values(COUNTRY_ADAPTERS).find((adapter) => adapter?.segment === segment);
}
