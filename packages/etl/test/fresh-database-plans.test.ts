/**
 * The post-merge queries of the import on a fresh database (#90): the whole
 * run is one transaction, so on the first import the directory tables hold
 * rows the planner has never seen statistics for. The derived fields and the
 * orphan check must stay set-based there: checked against the former
 * correlated formulations on a seeded random volume, then timed and explained
 * at national scale on never-analyzed tables.
 *
 * SYNTHETIC data only, generated in SQL (generate_series, seeded random()).
 * Opt-in: runs when ETL_TEST_DATABASE_URL is set. Every test swaps empty,
 * never-analyzed copies in for the directory tables it fills, inside a
 * transaction that is always rolled back: the permanent tables are untouched.
 */
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import type { TransactionSql } from "../src/lib/db";
import { ORPHANED_PAGES_QUERY, orphanedPages, recomputeDerived } from "../src/merge";

const url = process.env.ETL_TEST_DATABASE_URL;

const ctx = { runId: 0, country: "FR", professions: ["10"], department: null };

/** The directory tables these queries read. */
const TABLES = ["practitioners", "activities", "sites", "landing_pages", "suppressions"];

/**
 * Renames the directory tables away and creates empty copies (columns,
 * defaults, checks, identities and indexes) in their place: fresh tables with
 * no statistics, whatever ran on this database before.
 */
const swapInFreshTables = async (tx: TransactionSql) => {
	for (const table of TABLES) {
		await tx.unsafe(`ALTER TABLE directory.${table} RENAME TO ${table}_before_test`);
		await tx.unsafe(
			`CREATE TABLE directory.${table} (LIKE directory.${table}_before_test INCLUDING ALL)`,
		);
	}
};

/** The `primary_place_id` and `indexable` formulations used before #90. */
const REFERENCE_DERIVED = `
	SELECT p.id,
		(SELECT s.place_id FROM directory.activities a
			JOIN directory.sites s ON s.id = a.site_id AND s.removed_at IS NULL
			WHERE a.practitioner_id = p.id AND a.is_primary
			LIMIT 1) AS primary_place_id,
		(p.status = 'active'
			AND p.withheld_at IS NULL
			AND p.profession_code = ANY ('{10}'::text[])
			AND NOT EXISTS (
				SELECT 1 FROM directory.suppressions x
				WHERE x.country = p.country AND x.id_scheme = p.id_scheme AND x.national_id = p.national_id
			)
			AND EXISTS (
				SELECT 1 FROM directory.activities a
				JOIN directory.sites s ON s.id = a.site_id AND s.removed_at IS NULL AND s.place_id IS NOT NULL
				WHERE a.practitioner_id = p.id AND a.removed_at IS NULL AND NOT a.hidden
					AND a.practice_kind IN ('office', 'health_center', 'hospital')
			)) AS indexable
	FROM directory.practitioners p
`;

/** The orphan check used before #90 (a correlated subplan per practitioner). */
const REFERENCE_ORPHANS = `
	SELECT count(*)::integer AS count, (array_agg(p.slug ORDER BY p.id))[1:10] AS examples
	FROM directory.practitioners p
	WHERE p.indexable AND NOT EXISTS (
		SELECT 1 FROM directory.activities a
		JOIN directory.sites s ON s.id = a.site_id AND s.removed_at IS NULL
		JOIN directory.landing_pages lp ON lp.listing_slug = p.listing_slug
			AND lp.place_id = s.place_id
		WHERE a.practitioner_id = p.id AND a.removed_at IS NULL AND NOT a.hidden
			AND a.practice_kind IN ('office', 'health_center', 'hospital')
	)
`;

/** Rolls back whatever the body did. */
const rollback = Symbol("rollback");

describe.skipIf(!url)("post-merge queries on a fresh database", () => {
	const sql = postgres(url ?? "", { max: 1, onnotice: () => {} });

	const inTx = async (body: (tx: TransactionSql) => Promise<void>) => {
		try {
			await sql.begin(async (tx) => {
				await body(tx as TransactionSql);
				throw rollback;
			});
		} catch (error) {
			if (error !== rollback) throw error;
		}
	};

	afterAll(async () => {
		await sql.end();
	});

	it("agree with the former correlated formulations on a seeded random volume", async () => {
		await inTx(async (tx) => {
			await swapInFreshTables(tx);
			await tx`SELECT setseed(0.9)`;
			// 3,000 practitioners over 6 listing slugs (some none), a few removed,
			// suppressed, withheld or of another profession.
			await tx`
				INSERT INTO directory.practitioners (national_id, first_name, last_name,
					first_name_source, last_name_source, profession_code, listing_slug, slug, status,
					withheld_at)
				SELECT 'R' || n, 'F', 'L', 'F', 'L',
					CASE WHEN random() < 0.05 THEN '60' ELSE '10' END,
					CASE WHEN random() < 0.05 THEN NULL ELSE 'slug-' || floor(random() * 6)::int END,
					'p-' || n,
					CASE WHEN random() < 0.05 THEN 'removed' ELSE 'active' END,
					CASE WHEN random() < 0.03 THEN now() END
				FROM generate_series(1, 3000) AS n
			`;
			await tx`
				INSERT INTO directory.suppressions (national_id, reason)
				SELECT 'R' || n, 'objection' FROM generate_series(1, 3000, 37) AS n
			`;
			// 1,500 sites in 200 places, some without a place or removed.
			await tx`
				INSERT INTO directory.sites (source, source_key, kind, place_id, removed_at)
				SELECT 'ans', 'S' || n, 'office',
					CASE WHEN random() < 0.05 THEN NULL ELSE 1 + floor(random() * 200)::int END,
					CASE WHEN random() < 0.05 THEN now() END
				FROM generate_series(1, 1500) AS n
			`;
			// 0 to 3 activities each: every kind, some hidden, removed or without a site.
			await tx`
				INSERT INTO directory.activities (practitioner_id, site_id, source, source_key,
					practice_kind, mode_code, hidden, removed_at)
				SELECT p.id,
					CASE WHEN random() < 0.03 THEN NULL
						ELSE (SELECT min(id) FROM directory.sites) + floor(random() * 1500)::int END,
					'ans', 'A' || p.id || '-' || k,
					(ARRAY['office', 'health_center', 'hospital', 'locum', 'non_clinical'])
						[1 + floor(random() * 5)::int],
					CASE WHEN random() < 0.5 THEN 'L' ELSE 'S' END,
					random() < 0.05,
					CASE WHEN random() < 0.05 THEN now() END
				FROM directory.practitioners p
				CROSS JOIN LATERAL generate_series(1, floor(random() * 4)::int + p.id * 0) AS k
			`;
			// Semantics only here: statistics keep the correlated references quick.
			const analyze = () => tx.unsafe(`ANALYZE ${TABLES.map((t) => `directory.${t}`).join(", ")}`);
			await analyze();
			await recomputeDerived(tx, ctx);
			await analyze();
			const [derived] = await tx.unsafe<{ indexable: number; differ: number }[]>(`
				SELECT count(*) FILTER (WHERE p.indexable)::integer AS indexable,
					count(*) FILTER (WHERE p.primary_place_id IS DISTINCT FROM r.primary_place_id
						OR p.indexable IS DISTINCT FROM r.indexable)::integer AS differ
				FROM directory.practitioners p
				JOIN (${REFERENCE_DERIVED}) r ON r.id = p.id
			`);
			expect(derived?.indexable).toBeGreaterThan(1000);
			expect(derived?.differ).toBe(0);
			// Landing pages for about 80% of the (listing slug, place) pairs in use.
			await tx`
				INSERT INTO directory.landing_pages (key, listing_slug, place_id, practitioner_count,
					payload, indexable, content_hash)
				SELECT listing_slug || ':' || place_id, listing_slug, place_id, 1, '{}', true, ''
				FROM (
					SELECT DISTINCT p.listing_slug, s.place_id
					FROM directory.practitioners p
					JOIN directory.activities a ON a.practitioner_id = p.id
					JOIN directory.sites s ON s.id = a.site_id
					WHERE p.listing_slug IS NOT NULL AND s.place_id IS NOT NULL
				) pairs
				WHERE random() < 0.8
			`;
			await analyze();
			const orphans = await orphanedPages(tx);
			const [reference] =
				await tx.unsafe<{ count: number; examples: string[] | null }[]>(REFERENCE_ORPHANS);
			expect(orphans.count).toBeGreaterThan(20);
			expect(orphans.count).toBeLessThan(derived?.indexable ?? 0);
			expect(orphans).toEqual({ count: reference?.count, examples: reference?.examples });
		});
	});

	it("run set-based at national scale on never-analyzed tables", async () => {
		await inTx(async (tx) => {
			await swapInFreshTables(tx);
			// 200k practitioners over 30 listing slugs, 130k sites in 20k places,
			// 230k activities (one each, plus hospital activities for 30k of them).
			await tx`
				INSERT INTO directory.practitioners (national_id, first_name, last_name,
					first_name_source, last_name_source, profession_code, listing_slug, slug)
				SELECT 'R' || n, 'F', 'L', 'F', 'L', '10', 'slug-' || n % 30, 'p-' || n
				FROM generate_series(1, 200000) AS n
			`;
			await tx`
				INSERT INTO directory.sites (source, source_key, kind, place_id)
				SELECT 'ans', 'S' || n, 'office', 1 + n * 7919 % 20000
				FROM generate_series(1, 130000) AS n
			`;
			// The copies number their rows from 1.
			await tx`
				INSERT INTO directory.activities (practitioner_id, site_id, source, source_key,
					practice_kind)
				SELECT n, 1 + n % 130000, 'ans', 'A' || n,
					CASE WHEN n % 50 = 0 THEN 'non_clinical' ELSE 'office' END
				FROM generate_series(1, 200000) AS n
				UNION ALL
				SELECT n, 1 + n * 31 % 130000, 'ans', 'B' || n, 'hospital'
				FROM generate_series(6, 180000, 6) AS n
			`;
			const [stats] = await tx<{ analyzed: number }[]>`
				SELECT count(*)::integer AS analyzed FROM pg_stats
				WHERE schemaname = 'directory' AND tablename = ANY (${TABLES}::text[])
			`;
			expect(stats?.analyzed).toBe(0);

			let started = performance.now();
			await recomputeDerived(tx, ctx);
			const derivedMs = performance.now() - started;

			// One landing page per (listing slug, place) pair in use, except in
			// one place in ten: the practitioners only listed in those places are
			// orphans. The pairs come from the same arithmetic as the rows above
			// (site n lies in place 1 + n * 7919 % 20000), not from a query over
			// the never-analyzed tables.
			await tx`
				INSERT INTO directory.landing_pages (key, listing_slug, place_id, practitioner_count,
					payload, indexable, content_hash)
				SELECT listing_slug || ':' || place_id, listing_slug, place_id, 1, '{}', true, ''
				FROM (
					SELECT 'slug-' || n % 30 AS listing_slug, 1 + (1 + n % 130000) * 7919 % 20000 AS place_id
					FROM generate_series(1, 200000) AS n
					UNION
					SELECT 'slug-' || n % 30, 1 + (1 + n * 31 % 130000) * 7919 % 20000
					FROM generate_series(6, 180000, 6) AS n
				) pairs
				WHERE place_id % 10 <> 0
			`;
			const plan = await tx.unsafe<{ "QUERY PLAN": string }[]>(`EXPLAIN ${ORPHANED_PAGES_QUERY}`, [
				"FR",
			]);
			expect(plan.map((line) => line["QUERY PLAN"]).join("\n")).not.toMatch(/SubPlan/);
			started = performance.now();
			const orphans = await orphanedPages(tx);
			const orphansMs = performance.now() - started;

			const [counts] = await tx<{ indexable: number; pages: number }[]>`
				SELECT (SELECT count(*) FROM directory.practitioners WHERE indexable)::integer AS indexable,
					(SELECT count(*) FROM directory.landing_pages)::integer AS pages
			`;
			expect(counts?.indexable).toBeGreaterThan(190000);
			expect(counts?.pages).toBeGreaterThan(40000);
			expect(orphans.count).toBeGreaterThan(1000);
			expect(orphans.count).toBeLessThan(40000);
			// The correlated forms ran for minutes to hours here; these take seconds.
			expect(derivedMs).toBeLessThan(20_000);
			expect(orphansMs).toBeLessThan(10_000);
		});
	});
});
