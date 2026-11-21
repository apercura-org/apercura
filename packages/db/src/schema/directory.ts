import { text, timestamp } from "drizzle-orm/pg-core";
import { directory } from "./schemas";

/** Small key/value table for directory-wide metadata (e.g. last import run). */
export const meta = directory.table("meta", {
	key: text().primaryKey(),
	value: text().notNull(),
	updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
