import { pgSchema } from "drizzle-orm/pg-core";

/** Public, open-data side: practitioners, places, specialties. */
export const directory = pgSchema("directory");

/** Care side: accounts, bookings and anything touching health data. */
export const care = pgSchema("care");
