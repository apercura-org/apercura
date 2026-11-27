/**
 * Everything that differs from one country market to the next, behind one
 * interface. France, Austria, the United Kingdom, Czechia, Spain, Italy, Germany, Switzerland and Poland and Estonia are implemented; docs/adr/0002-multi-country.md
 * lists what is known about every other European market.
 *
 * Adapters are pure data and pure functions: no network, no database. Imports
 * (`packages/etl/sources/{country}`) and the web app read them.
 */

/** ISO 3166-1 alpha-2 codes of the markets the data model is prepared for. */
export const COUNTRY_CODES = ["FR", "AT", "DE", "GB", "ES", "IT", "CZ", "CH", "EE", "PL"] as const;

export type CountryCode = (typeof COUNTRY_CODES)[number];

/** A practitioner or organization identifier, and how to check one without a network call. */
export interface IdentifierScheme {
	/** Stored in `directory.practitioners.id_scheme` (`RPPS`, `LANR`…). */
	readonly id: string;
	/** Name as printed to users. */
	readonly name: string;
	/** Who issues the identifier. */
	readonly issuer: string;
	/** Syntax and check digit only: a valid number may still not exist. */
	isValid(value: string): boolean;
}

/** An open-data source the directory is imported from. */
export interface RegistrySource {
	readonly id: string;
	readonly name: string;
	readonly publisher: string;
	readonly url: string;
	/** Licence of the published data. */
	readonly licence: string;
	/** The licence text, when it has a canonical URL. */
	readonly licenceUrl?: string;
	/**
	 * The attribution the licence requires, word for word as the publisher asks
	 * for it (CC BY 4.0 sources). Printed on the data sources page.
	 */
	readonly attribution?: string;
	/**
	 * The attribution in each language the publisher words it in, for a market of several
	 * languages (Switzerland: the FOPH's in German, French and Italian), keyed by ISO 639-1; a page
	 * prints its language's, else `attribution`.
	 */
	readonly attributions?: Readonly<Partial<Record<string, string>>>;
	/** What the source provides to the directory. */
	readonly provides: readonly (
		| "practitioners"
		| "activities"
		| "establishments"
		| "billing"
		| "places"
	)[];
}

export interface PhoneFormat {
	/** Country calling codes, without `+` (several for France and its overseas departments). */
	readonly callingCodes: readonly string[];
	/** A number as typed or published, in E.164 (`+33472000000`), or null when it is not plausible. */
	toE164(raw: string | null | undefined): string | null;
	/** An E.164 number the way it is written in the country. */
	format(e164: string): string;
}

export interface PostalAddress {
	readonly street: string | null;
	readonly postcode: string | null;
	readonly city: string;
}

export interface AddressFormat {
	/** Shape of a postcode. */
	readonly postcode: RegExp;
	/** Lines of an address in the country's order. */
	lines(address: PostalAddress): string[];
}

export interface TaxonomyAdapter {
	/** Registry profession codes and their URL slugs. */
	readonly professions: Readonly<
		Record<string, { readonly slug: string; readonly enabled: boolean }>
	>;
	/** Professions imported by default. */
	readonly defaultProfessions: readonly string[];
	/** Listing slug of a practitioner, from its profession and specialty codes. */
	listingSlugFor(professionCode: string, specialtyCode: string | null | undefined): string | null;
	/** True when `slug` can be served as a listing page. */
	isListingSlug(slug: string): boolean;
}

/** A legal page the market requires, and the app pathname that serves it. */
export interface LegalPage {
	readonly id: "legal-notice" | "privacy" | "terms" | "accessibility";
	/** Internal (unlocalized) pathname of the page in the web app. */
	readonly pathname: string;
	/** The rule that requires it. */
	readonly basis: string;
}

/** Rules for hosting health data (bookings are health data). */
export interface HealthDataHosting {
	/** Name of the regime (`HDS` in France). */
	readonly regime: string;
	/** Legal basis. */
	readonly basis: string;
	readonly url: string;
}

/** Which product modules a market supports once it is open. */
export interface CountryFeatures {
	/** Public directory pages generated from the registry. */
	readonly directory: boolean;
	/** Online booking without a patient account. */
	readonly booking: boolean;
	/** Claim through the national practitioner e-identity (Pro Santé Connect in France). */
	readonly eIdentityClaim: boolean;
}

export interface CountryAdapter {
	readonly code: CountryCode;
	/** First path segment of the market's pages on apercura.org (`fr`, `at`). */
	readonly segment: string;
	/** Language of the market's pages (ISO 639-1). */
	readonly defaultLocale: string;
	/** Default IANA time zone. */
	readonly defaultTimeZone: string;
	/** Every IANA time zone a practice of the market can be in. */
	readonly timeZones: readonly string[];
	/**
	 * Time zone of a region code of the registry (a French department code, an
	 * Austrian Bundesland number). Throws on an unknown code rather than guessing.
	 */
	timeZoneOf(regionCode: string): string;
	readonly registries: readonly RegistrySource[];
	/**
	 * Identifiers of practitioners in the market's sources: one national number
	 * (RPPS in France), or one key per regional list where no national number is
	 * published (Austria).
	 */
	readonly practitionerIds: readonly IdentifierScheme[];
	readonly taxonomy: TaxonomyAdapter;
	readonly phone: PhoneFormat;
	readonly address: AddressFormat;
	readonly legalPages: readonly LegalPage[];
	readonly healthDataHosting: HealthDataHosting;
	readonly features: CountryFeatures;
}
