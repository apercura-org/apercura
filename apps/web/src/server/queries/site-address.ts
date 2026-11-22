import { sites } from "@apercura/db/schema";
import { sql } from "drizzle-orm";

/**
 * The street line a registry site displays: the registry's number with the
 * BAN's accented street name when the import's geocoder matched it surely
 * (`sites.geo_address_line`), else the registry text itself.
 */
export const siteAddressLine = sql<
	string | null
>`coalesce(${sites.geoAddressLine}, ${sites.addressLine})`;
