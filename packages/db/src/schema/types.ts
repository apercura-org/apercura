import { customType } from "drizzle-orm/pg-core";

export type GeoPoint = { longitude: number; latitude: number };

/**
 * PostGIS `geography(Point, 4326)`. Values are read as EWKB hex by default, so
 * queries that need coordinates should select `ST_X(location::geometry)` and
 * `ST_Y(location::geometry)` explicitly; writes accept `{ longitude, latitude }`.
 */
export const geographyPoint = customType<{ data: GeoPoint; driverData: string }>({
	dataType() {
		return "geography(Point, 4326)";
	},
	toDriver(value) {
		return `SRID=4326;POINT(${value.longitude} ${value.latitude})`;
	},
});
