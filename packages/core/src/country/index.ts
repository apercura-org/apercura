import { france } from "./fr";
import type { CountryAdapter, CountryCode } from "./types";

export { france } from "./fr";
export * from "./types";

/** Adapters of the markets the code supports. Only France in v1. */
export const COUNTRY_ADAPTERS: Readonly<Partial<Record<CountryCode, CountryAdapter>>> = {
	FR: france,
};

/** The adapter of a market, or an error naming a country the code does not support yet. */
export function countryAdapter(code: string): CountryAdapter {
	const adapter = COUNTRY_ADAPTERS[code as CountryCode];
	if (!adapter) throw new RangeError(`No country adapter for "${code}"`);
	return adapter;
}
