import "server-only";

import type { Sql } from "@apercura/db";
import { cacheLife, cacheTag } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { Locale } from "~/i18n/routing";
import {
	NO_SWISS_COVERAGE,
	type SwissCoverage,
	type SwissCoverageRow,
	type SwissCoverageTexts,
	shapeSwissCoverage,
	swissCoverageTexts,
} from "~/lib/swiss-coverage";
import { cacheTags } from "../cache-tags";
import { getSql, hasDatabaseUrl } from "../db";

/**
 * The registries of Switzerland's published facilities, by kind: the sources of their current
 * activities (`ch-zh-heime`) and the lists credited on their pages (`quelle`, a canton's hospital
 * list merged into a FOPH site). A facility counts while it is active, not withheld and has a
 * page (`practitioner_pages`), whichever run last read its list.
 */
export async function readSwissCoverageRows(sql: Sql): Promise<SwissCoverageRow[]> {
	return sql<SwissCoverageRow[]>`
		SELECT DISTINCT l.registry, p.profession_code AS "professionCode"
		FROM directory.practitioner_pages pg
		JOIN directory.practitioners p ON p.id = pg.practitioner_id AND p.status = 'active'
			AND p.withheld_at IS NULL
		CROSS JOIN LATERAL (
			SELECT a.source AS registry FROM directory.activities a
			WHERE a.practitioner_id = p.id AND a.removed_at IS NULL
			UNION
			SELECT q.code FROM directory.practitioner_qualifications q
			WHERE q.practitioner_id = p.id AND q.source = 'quelle'
		) l
		WHERE pg.country = 'CH'
		ORDER BY 1, 2
	`;
}

/**
 * The cantons Switzerland's pages cover, by kind of facility, live from the directory.
 *
 * Cached for days and tagged like the home's figures: the import sends `sitemap` with any change
 * and the app expires it at once, so the first visitor after an import that adds or drops a
 * canton's list reads the new coverage. Without a database (a build without one) nothing is
 * claimed, for minutes only.
 */
export async function getSwissCoverage(): Promise<SwissCoverage> {
	"use cache";
	cacheTag("registry", cacheTags.sitemap, cacheTags.coarse.practitioner);
	if (!hasDatabaseUrl()) {
		cacheLife("minutes");
		return NO_SWISS_COVERAGE;
	}
	cacheLife("days");
	return shapeSwissCoverage(await readSwissCoverageRows(getSql()));
}

/** The coverage statements of a Swiss page, in its language. */
export async function getSwissCoverageTexts(locale: Locale): Promise<SwissCoverageTexts> {
	const [t, coverage] = await Promise.all([
		getTranslations({ locale, namespace: "SwissCoverage" }),
		getSwissCoverage(),
	]);
	return swissCoverageTexts(t, locale, coverage);
}
