/**
 * Ameli matching (`buildAmeliMatches`) over hand-built temp tables: pins the
 * semantics on tricky cases, checks it against the former correlated-subquery
 * formulation on a seeded random volume, and checks it stays linear at
 * national scale (the correlated form stalled a full-France import, #79).
 *
 * SYNTHETIC data only, generated in SQL (generate_series, seeded random()).
 * Opt-in: runs when ETL_TEST_DATABASE_URL is set. Touches no permanent table.
 */
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import type { TransactionSql } from "../src/lib/db";
import { AMELI_MATCHES_QUERY, buildAmeliMatches } from "../src/merge";

const url = process.env.ETL_TEST_DATABASE_URL;

type Group = {
	group_id: number;
	billing_sector: string | null;
	optam: string | null;
	carte_vitale: boolean;
	apcv: boolean;
};

const createTables = async (tx: TransactionSql) => {
	await tx`
		CREATE TEMP TABLE ameli_groups (
			group_id bigint PRIMARY KEY, billing_sector text, optam text,
			carte_vitale boolean, apcv boolean
		) ON COMMIT DROP
	`;
	await tx`
		CREATE TEMP TABLE ameli_candidates (practitioner_id integer, group_id bigint) ON COMMIT DROP
	`;
};

/** The formulation used before #79, kept as the reference semantics. */
const buildReferenceMatches = (tx: TransactionSql) => tx`
	CREATE TEMP TABLE reference_matches ON COMMIT DROP AS
	SELECT c.practitioner_id,
		min(g.billing_sector) AS billing_sector, min(g.optam) AS optam,
		bool_or(g.carte_vitale) AS carte_vitale, bool_or(g.apcv) AS apcv
	FROM ameli_candidates c
	JOIN ameli_groups g ON g.group_id = c.group_id
	WHERE NOT EXISTS (
		SELECT 1 FROM ameli_candidates other
		WHERE other.group_id = c.group_id AND other.practitioner_id <> c.practitioner_id
	)
	GROUP BY c.practitioner_id
	HAVING count(DISTINCT (coalesce(g.billing_sector, ''), coalesce(g.optam, ''), g.carte_vitale, g.apcv)) = 1
		AND count(*) = (SELECT count(*) FROM ameli_candidates all_c WHERE all_c.practitioner_id = c.practitioner_id)
`;

/** Rolls back whatever the body did: temp tables only. */
const rollback = Symbol("rollback");

describe.skipIf(!url)("Ameli matching", () => {
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

	it("keeps only practitioners whose every group is theirs alone and agrees", async () => {
		const groups: Group[] = [
			// 1: practitioner 1, one unique group -> matched.
			{ group_id: 1, billing_sector: "1", optam: null, carte_vitale: true, apcv: false },
			// 10: shared by practitioners 2 and 3 -> neither matched.
			{ group_id: 10, billing_sector: "2", optam: "optam", carte_vitale: true, apcv: true },
			// 20, 21: practitioner 4 alone, same values -> matched once.
			{ group_id: 20, billing_sector: "1", optam: null, carte_vitale: false, apcv: true },
			{ group_id: 21, billing_sector: "1", optam: null, carte_vitale: false, apcv: true },
			// 30 unique to practitioner 5, 31 shared with 6 -> neither matched,
			// although 5 still has a unique group of their own.
			{ group_id: 30, billing_sector: "1", optam: null, carte_vitale: true, apcv: false },
			{ group_id: 31, billing_sector: "1", optam: null, carte_vitale: true, apcv: false },
			// 40, 41: practitioner 7 alone but values differ -> not matched.
			{ group_id: 40, billing_sector: "1", optam: null, carte_vitale: true, apcv: false },
			{ group_id: 41, billing_sector: "2", optam: null, carte_vitale: true, apcv: false },
			// 50, 51: practitioner 8, values differ only by a NULL optam -> not matched.
			{ group_id: 50, billing_sector: "2", optam: null, carte_vitale: true, apcv: false },
			{ group_id: 51, billing_sector: "2", optam: "optam_aco", carte_vitale: true, apcv: false },
			// 60: practitioner 9, NULL sector and optam -> matched with NULLs.
			{ group_id: 60, billing_sector: null, optam: null, carte_vitale: false, apcv: false },
			// 70: a group nobody is a candidate for.
			{ group_id: 70, billing_sector: "1", optam: null, carte_vitale: true, apcv: true },
		];
		const candidates: [number, number][] = [
			[1, 1],
			[2, 10],
			[3, 10],
			[4, 20],
			[4, 21],
			[5, 30],
			[5, 31],
			[6, 31],
			[7, 40],
			[7, 41],
			[8, 50],
			[8, 51],
			[9, 60],
		];
		await inTx(async (tx) => {
			await createTables(tx);
			await tx`INSERT INTO ameli_groups ${tx(groups)}`;
			await tx`
				INSERT INTO ameli_candidates
				${tx(candidates.map(([practitioner_id, group_id]) => ({ practitioner_id, group_id })))}
			`;
			await buildAmeliMatches(tx);
			await buildReferenceMatches(tx);
			const matches = await tx`
				SELECT practitioner_id, billing_sector, optam, carte_vitale, apcv
				FROM ameli_matches ORDER BY practitioner_id
			`;
			expect([...matches]).toEqual([
				{ practitioner_id: 1, billing_sector: "1", optam: null, carte_vitale: true, apcv: false },
				{ practitioner_id: 4, billing_sector: "1", optam: null, carte_vitale: false, apcv: true },
				{ practitioner_id: 9, billing_sector: null, optam: null, carte_vitale: false, apcv: false },
			]);
			const reference = await tx`
				SELECT practitioner_id, billing_sector, optam, carte_vitale, apcv
				FROM reference_matches ORDER BY practitioner_id
			`;
			expect([...reference]).toEqual([...matches]);
		});
	});

	it("agrees with the former correlated formulation on a seeded random volume", async () => {
		await inTx(async (tx) => {
			await createTables(tx);
			await tx`SELECT setseed(0.79)`;
			// Few distinct values, so some practitioners get agreeing groups, and
			// many collisions, so groups are often shared.
			await tx`
				INSERT INTO ameli_groups
				SELECT g, (ARRAY['1', '2', NULL])[1 + floor(random() * 3)::int],
					(ARRAY['optam', NULL])[1 + floor(random() * 2)::int],
					random() < 0.9, random() < 0.1
				FROM generate_series(1, 3000) AS g
			`;
			await tx`
				INSERT INTO ameli_candidates
				SELECT DISTINCT 1 + floor(random() * 2500)::int, 1 + floor(random() * 3000)::bigint
				FROM generate_series(1, 4000)
			`;
			await tx`ANALYZE ameli_groups, ameli_candidates`;
			await buildAmeliMatches(tx);
			await buildReferenceMatches(tx);
			const [row] = await tx<{ matched: number; reference: number; differ: number }[]>`
				SELECT (SELECT count(*) FROM ameli_matches)::integer AS matched,
					(SELECT count(*) FROM reference_matches)::integer AS reference,
					(SELECT count(*) FROM (
						(SELECT * FROM ameli_matches EXCEPT SELECT * FROM reference_matches)
						UNION ALL
						(SELECT * FROM reference_matches EXCEPT SELECT * FROM ameli_matches)
					) d)::integer AS differ
			`;
			expect(row?.matched).toBeGreaterThan(100);
			expect(row?.matched).toBe(row?.reference);
			expect(row?.differ).toBe(0);
		});
	});

	it("matches a national volume quickly, without a correlated subplan", async () => {
		await inTx(async (tx) => {
			await createTables(tx);
			// 300k candidates over 250k practitioners and 280k groups: mostly 1:1,
			// with shared groups and practitioners holding several groups.
			await tx`
				INSERT INTO ameli_groups
				SELECT g, CASE WHEN g % 3 = 0 THEN '2' ELSE '1' END,
					CASE WHEN g % 5 = 0 THEN 'optam' END, true, g % 7 = 0
				FROM generate_series(1, 280000) AS g
			`;
			await tx`
				INSERT INTO ameli_candidates
				SELECT n, n FROM generate_series(1, 250000) AS n
				UNION ALL
				SELECT n % 250000 + 1, 250000 + n % 30000 + 1 FROM generate_series(1, 50000) AS n
			`;
			await tx`ANALYZE ameli_groups, ameli_candidates`;
			const plan = await tx.unsafe<{ "QUERY PLAN": string }[]>(`EXPLAIN ${AMELI_MATCHES_QUERY}`);
			expect(plan.map((line) => line["QUERY PLAN"]).join("\n")).not.toMatch(/SubPlan/);
			const started = performance.now();
			await buildAmeliMatches(tx);
			const elapsed = performance.now() - started;
			const [row] = await tx<{ matched: number }[]>`
				SELECT count(*)::integer AS matched FROM ameli_matches
			`;
			// Practitioners 1..250000 own their group; those also given a shared
			// or disagreeing extra group drop out.
			expect(row?.matched).toBeGreaterThan(150000);
			expect(row?.matched).toBeLessThan(250000);
			// The correlated form took minutes at this volume; this takes seconds.
			expect(elapsed).toBeLessThan(15_000);
		});
	});
});
