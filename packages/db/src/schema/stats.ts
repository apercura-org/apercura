/**
 * Page statistics for owners, in schema `directory` (app-owned: the import has no access).
 *
 * Aggregated counts only: one row per claimed page and day, no visitor, no IP address, no
 * cookie, no user agent. Kept 13 months (`PAGE_VIEW_RETENTION_MONTHS`).
 */
import { sql } from "drizzle-orm";
import { check, date, index, integer, primaryKey } from "drizzle-orm/pg-core";
import { practitioners } from "./directory";
import { directory } from "./schemas";

/** Views of a claimed practitioner page per day (Europe/Paris calendar day). */
export const pageViewDays = directory.table(
	"page_view_days",
	{
		practitionerId: integer()
			.notNull()
			.references(() => practitioners.id, { onDelete: "cascade" }),
		day: date({ mode: "string" }).notNull(),
		views: integer().notNull().default(0),
	},
	(table) => [
		primaryKey({ columns: [table.practitionerId, table.day] }),
		index("page_view_days_day_idx").on(table.day),
		check("page_view_days_views_check", sql`${table.views} >= 0`),
	],
);
